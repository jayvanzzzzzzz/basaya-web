import { FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';

const fail = (status, message) => Object.assign(new Error(message), { status });
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
export const contentOwnerId = (data, kind) => kind === 'module'
  ? data.ownerId || data.createdBy || '' : data.teacherId || data.createdBy || data.ownerId || '';

function authorize(profile, item, uid, kind, action, reason) {
  const role = profile.get('role');
  if (!['teacher', 'admin'].includes(role) || profile.get('disabled') === true) throw fail(403, 'Staff access is required.');
  if (!item.exists) throw fail(404, 'This content no longer exists.');
  const ownerId = contentOwnerId(item.data(), kind);
  const own = ownerId === uid || (kind === 'lesson' && role === 'admin' && item.get('adminManaged') === true && (item.get('visibility') || 'shared') === 'shared');
  if (!own && !(role === 'admin' && (kind === 'learningPath' || (item.get('visibility') || 'shared') === 'shared')))
    throw fail(403, 'You can manage only your own content. Admins can also moderate Shared content.');
  if (['restore', 'delete'].includes(action) && item.get('archiveModerated') === true && role !== 'admin')
    throw fail(403, 'An admin must review content archived for moderation.');
  // Legacy library content has no recorded owner to notify. Do not invent one.
  const moderated = Boolean(ownerId) && !own && role === 'admin';
  if (moderated && !reason.trim()) throw fail(400, 'Provide a reason so the owner understands this moderation action.');
  return { role, ownerId, moderated };
}

async function assertUnused(tx, database, item, kind) {
  const id = item.id;
  if (kind === 'learningPath') {
    const [assigned, links, progress] = await Promise.all([
      tx.get(database.collectionGroup('learningPaths').where('pathId', '==', id)),
      tx.get(database.collectionGroup('classLessons').where('learningPathId', '==', id)),
      tx.get(database.collectionGroup('assignedLessons').where('learningPathId', '==', id)),
    ]);
    if (item.get('everAssigned') || !assigned.empty || !links.empty || !progress.empty) throw fail(409, 'This learning path has class assignments or student progress. Archive it instead of deleting it.');
    return;
  }
  if (kind === 'module') {
    const paths = await tx.get(database.collection('learningPaths').where('moduleIds', 'array-contains', id));
    if (!paths.empty) throw fail(409, 'A learning path uses this module. Archive it instead of deleting it.');
  }
  // A module is only an arrangement; deleting it never removes its lessons.
  const lessonIds = kind === 'lesson' ? [id] : [];
  const [links, modules, progress, historical, attempts, legacyProgress, users, archives] = await Promise.all([
    tx.get(database.collectionGroup('classLessons')),
    tx.get(database.collection('modules')),
    tx.get(database.collectionGroup('assignedLessons')),
    tx.get(database.collectionGroup('lessons')),
    tx.get(database.collectionGroup('assessmentAttempts')),
    tx.get(database.collection('progress')),
    tx.get(database.collection('users')),
    tx.get(database.collectionGroup('archives')),
  ]);
  const refersToLesson = doc => lessonIds.includes(doc.get('lessonId') || doc.id.replace(/__practice$/, ''));
  const refersToProgress = doc => kind === 'module' ? doc.get('moduleId') === id : refersToLesson(doc);
  if (links.docs.some(doc => (kind === 'module' && doc.get('moduleId') === id) || refersToLesson(doc)))
    throw fail(409, `This ${kind} is used by a class. Archive it to preserve class access.`);
  if (progress.docs.some(refersToProgress) || attempts.docs.some(refersToProgress) || legacyProgress.docs.some(refersToProgress) ||
      historical.docs.some(doc => doc.ref.path !== `lessons/${doc.id}` && refersToProgress(doc)))
    throw fail(409, `Student progress depends on this ${kind}. Archive it instead of deleting it.`);
  // Older private attempts are keyed by hash rather than storing lessonId.
  // Resolve their enrollment sessions; fail closed when history cannot be mapped.
  const sessions = new Map();
  for (const doc of [...users.docs, ...progress.docs, ...historical.docs.filter(d => d.ref.path.startsWith('users/')), ...archives.docs]) {
    const uid = doc.ref.path.split('/')[1], classId = doc.get('classId');
    if (typeof classId !== 'string' || !classId) continue;
    const session = doc.get('progressSession') || '';
    if (!sessions.has(uid)) sessions.set(uid, []);
    sessions.get(uid).push([classId, session]);
  }
  const candidates = [...new Set([...historical.docs.map(doc => doc.id), ...progress.docs.map(doc => doc.id), ...lessonIds])];
  for (const attempt of kind === 'lesson' ? attempts.docs.filter(doc => !doc.get('lessonId')) : []) {
    const uid = attempt.ref.path.split('/')[1];
    let matched;
    for (const [classId, session] of sessions.get(uid) || []) {
      matched = candidates.find(lessonId => createHash('sha256').update(JSON.stringify([classId, session, lessonId])).digest('hex') === attempt.id);
      if (matched) break;
    }
    if (!matched) throw fail(409, 'Historical progress cannot be safely matched to a lesson. Archive this content instead.');
    if (lessonIds.includes(matched)) throw fail(409, `Student progress depends on this ${kind}. Archive it instead of deleting it.`);
  }
  if (kind === 'lesson' && modules.docs.some(doc => (doc.get('lessonIds') || []).includes(id)))
    throw fail(409, 'This lesson belongs to a module. Remove it from that module before deleting it.');
  if (kind === 'module' && modules.docs.some(doc => doc.id !== id && (doc.get('sourceModuleId') === id || doc.get('copiedFromModuleId') === id)))
    throw fail(409, 'Another module version depends on this source. Archive it instead of deleting it.');
  if (kind === 'lesson' && historical.docs.some(doc => doc.get('sourceLessonId') === id || doc.get('copiedFromLessonId') === id))
    throw fail(409, 'Another lesson copy depends on this original. Archive it instead of deleting it.');
}

async function deleteUnused(database, uid, ref, kind, reason) {
  const record = await database.runTransaction(async tx => {
    const [profile, item] = await Promise.all([tx.get(database.doc(`users/${uid}`)), tx.get(ref)]);
    const { ownerId, moderated } = authorize(profile, item, uid, kind, 'delete', reason);
    if (item.get('deletionPending') && item.get('deletionRequestedBy') !== uid)
      throw fail(409, 'Another deletion is in progress. Refresh this library.');
    await assertUnused(tx, database, item, kind);
    // Keep the root as a write/assignment barrier until all child documents are gone.
    tx.update(ref, { archived: true, deletionPending: true, deletionRequestedBy: uid, updatedAt: FieldValue.serverTimestamp() });
    return { contentId: ref.id, kind, action: 'delete', actorId: uid, ownerId, moderated, title: item.get('title') || 'Untitled', reason: reason.trim() };
  });
  // Deleting a module never cascades to its reusable lesson documents.
  for (const collection of await ref.listCollections()) await database.recursiveDelete(collection);
  await database.runTransaction(async tx => {
    const item = await tx.get(ref);
    if (!item.exists || !item.get('deletionPending') || item.get('deletionRequestedBy') !== uid)
      throw fail(409, 'The deletion state changed. Refresh the library.');
    const event = database.collection('contentLifecycleEvents').doc();
    const audit = { ...record, createdAt: FieldValue.serverTimestamp() };
    tx.delete(ref);
    tx.set(event, audit);
    if (record.moderated) tx.set(database.doc(`users/${record.ownerId}/contentNotices/${event.id}`), audit);
  });
  return { id: ref.id, kind, deleted: true, changed: true };
}

// Archive metadata, moderation history and owner notices are server-owned.
export async function changeContentLifecycle(database, uid, { kind, id, action, reason = '' } = {}) {
  if (!['lesson', 'module', 'learningPath'].includes(kind) || !idPattern.test(id || '') || !['archive', 'restore', 'delete'].includes(action))
    throw fail(400, 'Choose a lesson or module and a valid action.');
  if (typeof reason !== 'string' || reason.trim().length > 500) throw fail(400, 'Use a reason of up to 500 characters.');
  const ref = database.doc(`${kind === 'lesson' ? 'lessons' : kind === 'learningPath' ? 'learningPaths' : 'modules'}/${id}`);
  if (action === 'delete') return deleteUnused(database, uid, ref, kind, reason);
  const event = database.collection('contentLifecycleEvents').doc();
  return database.runTransaction(async tx => {
    const [profile, item] = await Promise.all([tx.get(database.doc(`users/${uid}`)), tx.get(ref)]);
    const { ownerId, moderated } = authorize(profile, item, uid, kind, action, reason);
    if (item.get('deletionPending')) throw fail(409, 'Deletion is in progress. Retry Delete to finish it.');
    const archived = action === 'archive';
    if ((item.get('archived') === true) === archived) return { id, kind, archived, changed: false };
    const changes = {
      archived, archivedBy: archived ? uid : null, archivedAt: archived ? FieldValue.serverTimestamp() : null,
      archiveReason: archived ? reason.trim() : '', archiveModerated: archived && moderated,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (kind === 'module' || kind === 'learningPath') changes.revision = (item.get('revision') || 0) + 1;
    tx.update(ref, changes);
    const record = { contentId: id, kind, action, actorId: uid, ownerId, title: item.get('title') || 'Untitled', reason: reason.trim(), moderated, createdAt: FieldValue.serverTimestamp() };
    tx.set(event, record);
    if (moderated && ownerId) tx.set(database.doc(`users/${ownerId}/contentNotices/${event.id}`), record);
    return { id, kind, archived, changed: true };
  });
}
