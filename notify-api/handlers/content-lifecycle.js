import { db } from '../lib/firebase.js';
import { allowCors, requireUser } from '../lib/http.js';
import { changeContentLifecycle } from '../lib/contentLifecycle.js';
import { reserveLessonVersion, saveModuleVersion, setLessonVisibility } from '../lib/contentVersioning.js';
import { saveLearningPath, assignLearningPath, scheduleLearningPath } from '../lib/learningPaths.js';
import { archiveClassContent } from '../lib/classContentArchive.js';

export default async function handler(req, res) {
  allowCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  try {
    const uid = await requireUser(req, res);
    if (!uid) return;
    const database = db();
    const action = req.body?.action;
    const result = action === 'reserve-lesson-version' ? await reserveLessonVersion(database, uid, req.body)
      : action === 'save-module' ? await saveModuleVersion(database, uid, req.body)
      : action === 'lesson-visibility' ? await setLessonVisibility(database, uid, req.body)
      : action === 'save-learning-path' ? await saveLearningPath(database, uid, req.body)
      : action === 'assign-learning-path' ? await assignLearningPath(database, uid, req.body)
      : action === 'schedule-learning-path' ? await scheduleLearningPath(database, uid, req.body)
      : ['archive-class-content', 'restore-class-path'].includes(action) ? await archiveClassContent(database, uid, req.body)
      : await changeContentLifecycle(database, uid, req.body);
    if (action === 'save-module') {
      result.module = (await database.doc(`modules/${result.id}`).get()).data();
      for (const field of ['createdAt', 'updatedAt']) {
        const stamp = result.module[field];
        if (stamp?.toMillis) result.module[field] = { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds };
      }
    }
    return res.status(200).json(result);
  } catch (error) {
    if (!error.status) console.error('Content lifecycle failed', error);
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not update this content. Please try again.' });
  }
}
