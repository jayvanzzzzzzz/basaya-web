import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';
import { state } from './state.js';
import { postToApi } from './api.js';
export async function loadLearningPaths({ includeArchived = false } = {}) {
  const ref = collection(db, 'learningPaths');
  const snapshots = state.profile?.role === 'admin' ? [await getDocs(ref)] : await Promise.all([
    getDocs(query(ref, where('ownerId', '==', state.user.uid))), getDocs(query(ref, where('visibility', '==', 'shared'))),
  ]);
  return [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(item => [item.id, { id: item.id, ...item.data() }])).values()]
    .filter(item => includeArchived || !item.archived).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}
export const saveLearningPath = values => postToApi('content-lifecycle', { action: 'save-learning-path', ...values });
export const assignLearningPath = values => postToApi('content-lifecycle', { action: 'assign-learning-path', ...values });
