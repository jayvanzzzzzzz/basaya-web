import { FieldValue } from 'firebase-admin/firestore';

const fail = (status, message) => Object.assign(new Error(message), { status });
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);

// Archive assignment links, never library content or student progress.
export async function archiveClassContent(database, uid, body) {
  const restore = body.action === 'restore-class-path';
  if (!validId(body.classId) || (body.assignmentId ? !validId(body.assignmentId) : restore || !validId(body.linkId))) throw fail(400, 'Choose an assigned lesson or lesson path.');
  const classRef = database.doc(`classes/${body.classId}`);
  return database.runTransaction(async tx => {
    const [profile, classroom, links, saved, path] = await Promise.all([
      tx.get(database.doc(`users/${uid}`)), tx.get(classRef),
      tx.get(classRef.collection('classLessons')),
      tx.get(classRef.collection('archivedClassLessons')),
      body.assignmentId ? tx.get(classRef.collection('learningPaths').doc(body.assignmentId)) : null,
    ]);
    if (profile.get('role') !== 'teacher' || profile.get('disabled') || classroom.get('teacherId') !== uid || classroom.get('membershipClosed') || classroom.get('archived')) throw fail(403, 'You do not teach this active class.');
    if (path && !path.exists) throw fail(404, 'This lesson path is no longer assigned to this class.');
    const selected = links.docs.filter(link => body.assignmentId ? link.get('learningPathAssignmentId') === body.assignmentId : link.id === body.linkId);
    if (restore) {
      const archived = saved.docs.filter(link => link.get('link').learningPathAssignmentId === body.assignmentId);
      if (!path.get('archived')) return { changed: false };
      if (!archived.length) throw fail(409, 'No archived lessons were found for this path.');
      if (archived.some(link => links.docs.some(active => active.id === link.get('linkId')))) throw fail(409, 'A lesson in this path is already assigned. Archive that assignment before restoring this path.');
      for (const link of archived) {
        tx.set(classRef.collection('classLessons').doc(link.get('linkId')), link.get('link'));
        tx.delete(link.ref);
      }
      tx.update(path.ref, { archived: false, restoredAt: FieldValue.serverTimestamp(), restoredBy: uid });
      return { changed: true, restored: archived.length };
    }
    if (!body.assignmentId && !selected.length) throw fail(404, 'This lesson is no longer assigned to this class.');
    for (const link of selected) {
      const key = `${link.get('learningPathAssignmentId') || 'lesson'}_${link.id}`;
      tx.set(classRef.collection('archivedClassLessons').doc(key), { linkId: link.id, link: link.data(), archivedAt: FieldValue.serverTimestamp(), archivedBy: uid });
      tx.delete(link.ref);
    }
    if (path) tx.update(path.ref, { archived: true, archivedAt: FieldValue.serverTimestamp(), archivedBy: uid });
    return { changed: selected.length > 0 || Boolean(path && !path.get('archived')), archived: selected.length };
  });
}
