import { collection, doc, getDocs, query, where, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';
import { state } from './state.js';
import { nextCopyNumber, orderedLessonIds } from './moduleModel.js';

export async function loadModules() {
  const ref = collection(db, 'modules');
  const snapshots = state.profile?.role === 'admin' ? [await getDocs(ref)] : await Promise.all([
    getDocs(query(ref, where('ownerId', '==', state.user.uid))),
    getDocs(query(ref, where('visibility', '==', 'shared'))),
  ]);
  return [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(item => [item.id, { id: item.id, ...item.data() }])).values()]
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

export async function saveModule(existing, values) {
  const lessonIds = orderedLessonIds(values.lessonIds);
  const title = values.title.trim(), description = values.description.trim();
  if (!title || title.length > 120 || description.length > 1000) throw new Error('Enter a module title (up to 120 characters) and a description of up to 1,000 characters.');
  const ref = existing ? doc(db, 'modules', existing.id) : doc(collection(db, 'modules'));
  await runTransaction(db, async transaction => {
    const current = existing ? await transaction.get(ref) : null;
    if (existing && !current.exists()) throw new Error('This module no longer exists. Return to Lessons and reload.');
    if (existing && current.data().revision !== existing.revision) throw new Error('This module changed in another session. Return to Lessons and reopen it before saving.');
    const lessons = await Promise.all(lessonIds.map(id => transaction.get(doc(db, 'lessons', id))));
    if (lessons.some(item => !item.exists() || item.data().publicationState === 'draft')) throw new Error('A selected lesson was removed or is unfinished. Remove it from this module before saving.');
    transaction.set(ref, {
      title, description, lessonIds,
      // Array position is the authoritative order. Student locking is a future feature.
      progression: 'sequential', lockingEnabled: false,
      ownerId: existing ? current.data().ownerId : state.user.uid,
      visibility: existing ? current.data().visibility : state.profile?.role === 'admin' ? 'shared' : 'private',
      revision: (existing ? current.data().revision || 0 : 0) + 1,
      createdAt: existing ? current.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return ref.id;
}

// Allocate the title and root document together so simultaneous authors cannot
// receive the same variant number. Failed section saves reuse this same root.
export async function reserveLessonCopy(ref, source, rootData) {
  const sourceId = source.sourceLessonId || source.id;
  return runTransaction(db, async transaction => {
    const original = await transaction.get(doc(db, 'lessons', sourceId));
    if (!original.exists()) throw new Error('The original lesson no longer exists.');
    const counterRef = doc(db, 'lessonCopyCounters', sourceId);
    const counter = await transaction.get(counterRef);
    const base = original.data().title;
    const sequence = counter.exists() ? counter.data().sequence + 1 : nextCopyNumber(base, state.allLessons);
    const title = `${base} 1.${sequence}`;
    transaction.set(counterRef, { sequence });
    transaction.set(ref, { ...rootData, title, teacherId: state.user.uid,
      publicationState: 'draft',
      sourceLessonId: sourceId, copiedFromLessonId: source.id,
      createdAt: serverTimestamp() });
    return title;
  });
}
