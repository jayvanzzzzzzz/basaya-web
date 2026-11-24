import { FieldValue, Timestamp } from 'firebase-admin/firestore';
const fail = (status, message) => Object.assign(new Error(message), { status });
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const active = item => item.exists && !item.get('archived') && !item.get('deletionPending');
const available = (item, uid, ownerKey = 'ownerId') => active(item) && (item.get(ownerKey) === uid || (item.get('visibility') || 'shared') === 'shared');
function staff(profile) {
  if (!['admin', 'teacher'].includes(profile.get('role')) || profile.get('disabled')) throw fail(403, 'Staff access is required.');
}
async function readModules(tx, database, uid, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length) throw fail(400, 'Choose 1–20 unique modules.');
  const modules = await Promise.all(ids.map(id => tx.get(database.doc(`modules/${id}`))));
  if (modules.some(item => !available(item, uid))) throw fail(409, 'A module is archived, deleted or unavailable. Choose another module.');
  const lessonIds = modules.flatMap(item => item.get('lessonIds') || []);
  if (!lessonIds.length || lessonIds.length > 200 || lessonIds.some(id => !validId(id)) || new Set(lessonIds).size !== lessonIds.length) throw fail(400, 'Use up to 200 lessons, with each lesson appearing once in the learning path.');
  const lessons = await Promise.all(lessonIds.map(id => tx.get(database.doc(`lessons/${id}`))));
  if (lessons.some(item => !available(item, uid, 'teacherId') || item.get('publicationState') === 'draft')) throw fail(409, 'A lesson is archived, unfinished or unavailable.');
  return { modules, lessonIds, lessons };
}
export async function saveLearningPath(database, uid, body) {
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120 || !validId(body.requestKey) || (body.id && !validId(body.id))) throw fail(400, 'Enter a learning path title of up to 120 characters.');
  const ref = body.id ? database.doc(`learningPaths/${body.id}`) : database.collection('learningPaths').doc();
  const request = database.doc(`contentVersionRequests/${uid}_path_${body.requestKey}`);
  return database.runTransaction(async tx => {
    const [profile, previous, retry] = await Promise.all([tx.get(database.doc(`users/${uid}`)), body.id ? tx.get(ref) : null, tx.get(request)]);
    staff(profile);
    const fingerprint = JSON.stringify([body.id || '', body.title.trim(), body.moduleIds, body.revision || 0]);
    if (retry.exists) {
      if (retry.get('fingerprint') !== fingerprint) throw fail(409, 'This save request has changed. Retry with a new request.');
      return { id: retry.get('id') };
    }
    if (previous && (!active(previous) || previous.get('ownerId') !== uid)) throw fail(403, 'Only the creator can edit this learning path.');
    if (previous && previous.get('revision') !== body.revision) throw fail(409, 'This learning path changed. Reopen it before saving.');
    const { modules, lessons } = await readModules(tx, database, uid, body.moduleIds);
    const visibility = [...modules, ...lessons].every(item => (item.get('visibility') || 'shared') === 'shared') ? 'shared' : 'private';
    tx.set(ref, { title: body.title.trim(), moduleIds: body.moduleIds, ownerId: uid, visibility,
      revision: (previous?.get('revision') || 0) + 1, createdAt: previous?.get('createdAt') || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(), everAssigned: previous?.get('everAssigned') === true });
    tx.set(request, { id: ref.id, fingerprint, createdAt: FieldValue.serverTimestamp() });
    return { id: ref.id };
  });
}
function schedule(body) {
  const openAt = body.openAt ?? null, dueAt = body.dueAt ?? null;
  if ((openAt !== null && !Number.isFinite(openAt)) || (dueAt !== null && (!Number.isFinite(dueAt) || dueAt <= Date.now())) || (openAt !== null && dueAt !== null && dueAt <= openAt)) throw fail(400, 'Choose a valid opening date and a future deadline after it.');
  return { openAt: openAt === null ? null : Timestamp.fromMillis(openAt), dueAt: dueAt === null ? null : Timestamp.fromMillis(dueAt) };
}
export async function assignLearningPath(database, uid, body) {
  if (![body.pathId, body.classId, body.requestKey].every(validId) || !['assessment', 'practice'].includes(body.mode)) throw fail(400, 'Choose a learning path, class and lesson type.');
  const dates = schedule(body);
  const classRef = database.doc(`classes/${body.classId}`), pathRef = database.doc(`learningPaths/${body.pathId}`);
  const assignment = classRef.collection('learningPaths').doc(body.requestKey);
  return database.runTransaction(async tx => {
    const [profile, classroom, path, retry, links] = await Promise.all([
      tx.get(database.doc(`users/${uid}`)), tx.get(classRef), tx.get(pathRef), tx.get(assignment), tx.get(classRef.collection('classLessons')),
    ]);
    staff(profile);
    if (classroom.get('teacherId') !== uid || classroom.get('membershipClosed')) throw fail(403, 'You do not teach this active class.');
    const fingerprint = JSON.stringify([body.pathId, body.revision, body.moduleIds, body.mode, body.openAt ?? null, body.dueAt ?? null]);
    if (retry.exists) {
      if (retry.get('fingerprint') !== fingerprint) throw fail(409, 'This assignment request has changed. Review it again.');
      return { id: assignment.id, linkIds: retry.get('linkIds'), title: retry.get('title') };
    }
    if (!available(path, uid)) throw fail(403, 'This learning path is unavailable.');
    if (path.get('revision') !== body.revision) throw fail(409, 'The learning path changed. Reopen it before assigning.');
    // Customized module versions may replace the originals, never silently add extra steps.
    const moduleIds = body.moduleIds || path.get('moduleIds');
    if (!Array.isArray(moduleIds) || moduleIds.length !== path.get('moduleIds').length) throw fail(400, 'Keep all modules in the selected learning path.');
    const { modules, lessonIds, lessons } = await readModules(tx, database, uid, moduleIds);
    const originalIds = path.get('moduleIds');
    const remaining = [...originalIds];
    for (const item of modules) {
      const index = remaining.findIndex(id => item.id === id || item.get('copiedFromModuleId') === id || item.get('sourceModuleId') === id);
      if (index < 0) throw fail(409, 'A customized module must be a copy of a module in this path.');
      remaining.splice(index, 1);
    }
    if (links.docs.some(item => (item.get('mode') || 'assessment') === body.mode && lessonIds.includes(item.get('lessonId') || item.id))) throw fail(409, 'A lesson is already assigned as this type. Edit a copy or choose another path so one deadline covers the whole assignment.');
    const last = Math.max(0, ...links.docs.map(item => Number(item.get('order')) || 0));
    const titles = new Map(lessons.map(item => [item.id, item.get('title')]));
    const snapshots = modules.map(item => ({ id: item.id, title: item.get('title'), revision: item.get('revision'), lessonIds: item.get('lessonIds'), lessonTitles: item.get('lessonIds').map(id => titles.get(id)) }));
    const linkIds = [];
    let index = 0;
    for (const [position, module] of snapshots.entries()) for (const [lessonPosition, lessonId] of module.lessonIds.entries()) {
      const linkId = body.mode === 'practice' ? `${lessonId}__practice` : lessonId;
      const occupant = links.docs.find(item => item.id === lessonId && item.get('mode') === 'practice');
      if (body.mode === 'assessment' && occupant) tx.set(classRef.collection('classLessons').doc(`${lessonId}__practice`), { ...occupant.data(), lessonId });
      linkIds.push(linkId);
      tx.set(classRef.collection('classLessons').doc(linkId), { lessonId, teacherId: uid, mode: body.mode, order: last + (++index), ...dates,
        moduleId: module.id, moduleTitle: module.title, moduleRevision: module.revision, moduleOrder: lessonPosition + 1,
        learningPathId: path.id, learningPathAssignmentId: assignment.id, learningPathTitle: path.get('title'), learningPathModuleOrder: position + 1,
        createdAt: FieldValue.serverTimestamp(), notifyPending: true });
    }
    tx.set(assignment, { pathId: path.id, pathRevision: path.get('revision'), title: path.get('title'), modules: snapshots, lessonIds, linkIds,
      mode: body.mode, ...dates, teacherId: uid, fingerprint, createdAt: FieldValue.serverTimestamp() });
    tx.update(pathRef, { everAssigned: true });
    tx.update(classRef, { learningPathSequenceUpdatedAt: FieldValue.serverTimestamp() }); // Serialize concurrent appends.
    return { id: assignment.id, linkIds, title: path.get('title') };
  });
}
export async function scheduleLearningPath(database, uid, body) {
  if (![body.classId, body.assignmentId].every(validId)) throw fail(400, 'Choose a class learning path.');
  const dates = schedule(body), classRef = database.doc(`classes/${body.classId}`);
  return database.runTransaction(async tx => {
    const [profile, classroom, assignment, links] = await Promise.all([tx.get(database.doc(`users/${uid}`)), tx.get(classRef), tx.get(classRef.collection('learningPaths').doc(body.assignmentId)), tx.get(classRef.collection('classLessons').where('learningPathAssignmentId', '==', body.assignmentId))]);
    staff(profile);
    if (classroom.get('teacherId') !== uid || classroom.get('membershipClosed')) throw fail(403, 'You do not teach this active class.');
    if (!assignment.exists) throw fail(404, 'This learning path is no longer assigned.');
    for (const link of links.docs) {
      const oldDue = link.get('dueAt')?.toMillis?.();
      const history = [...new Set([...(link.get('deadlineHistory') || []), ...(oldDue && oldDue < Date.now() ? [oldDue] : [])])];
      tx.update(link.ref, { ...dates, deadlineHistory: history, scheduleChangedAt: Date.now() });
    }
    tx.update(assignment.ref, dates);
    return { updated: links.size };
  });
}
