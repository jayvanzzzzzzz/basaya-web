import { postToApi } from './api.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase.js';
import { state } from './state.js';
import { orderedLessonIds } from './moduleModel.js';

export async function loadModules({ includeArchived = false } = {}) {
  const ref = collection(db, 'modules');
  const snapshots = await Promise.all([
    getDocs(query(ref, where('ownerId', '==', state.user.uid))),
    getDocs(query(ref, where('visibility', '==', 'shared'))),
  ]);
  return [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(item => [item.id, { id: item.id, ...item.data() }])).values()]
    .filter(item => includeArchived || item.archived !== true)
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

export async function saveModule(existing, values) {
  const lessonIds = orderedLessonIds(values.lessonIds);
  const title = values.title.trim(), description = values.description.trim();
  if (!title || title.length > 120 || description.length > 1000) throw new Error('Enter a module title (up to 120 characters) and a description of up to 1,000 characters.');
  values.saveRequestKey ||= crypto.randomUUID();
  const result = await postToApi('content-lifecycle', {
    action: 'save-module', sourceId: existing?.id, revision: existing?.revision,
    title, description, lessonIds, visibility: values.visibility || existing?.visibility || 'private', requestKey: values.saveRequestKey,
  });
  Object.assign(values, result.module, { changeKind: result.changeKind });
  return result.id;
}

export async function reserveLessonCopy(source, rootData, requestKey = crypto.randomUUID()) {
  const result = await postToApi('content-lifecycle', { action: 'reserve-lesson-version', sourceId: source.id,
    title: rootData.title, description: rootData.description, difficulty: rootData.difficulty,
    visibility: rootData.visibility, requestKey,
    expectedUpdatedAt: source.updatedAt?.seconds !== undefined ? `${source.updatedAt.seconds}:${source.updatedAt.nanoseconds}` : undefined });
  return result;
}
