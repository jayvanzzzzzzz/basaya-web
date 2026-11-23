import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { reserveLessonVersion, saveModuleVersion, setLessonVisibility } from '../notify-api/lib/contentVersioning.js';
import { startFirestoreTestServer } from './firestore-test-server.mjs';

const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: emulator.project });
const db = getFirestore(app);
const reserve = (uid, overrides = {}) => reserveLessonVersion(db, uid, { sourceId:'original', title:'Idyoma', visibility:'private', difficulty:'madali', description:'Edited content', requestKey:crypto.randomUUID(), ...overrides });
const moduleSave = (uid, source, overrides = {}) => saveModuleVersion(db, uid, { sourceId:source?.id, revision:source?.revision,
  title:source?.versionBaseTitle || source?.title || 'Module', description:source?.description || '', lessonIds:source?.lessonIds || ['original','second'], visibility:source?.visibility || 'shared', requestKey:crypto.randomUUID(), ...overrides });
const stored = async (collection,id) => ({id,...(await db.doc(`${collection}/${id}`).get()).data()});
try {
  for (const [path, data] of [
    ['users/teacher',{role:'teacher'}], ['users/other',{role:'teacher'}], ['users/admin',{role:'admin'}], ['users/student',{role:'student'}], ['users/disabled',{role:'teacher',disabled:true}],
    ['lessons/original',{title:'Idyoma',description:'Original',difficulty:'madali',visibility:'shared',adminManaged:true,publicationState:'published'}],
    ['lessons/original/lectures/content',{title:'Lecture',pages:[{sentences:['Original text']}]}],
    ['lessons/second',{title:'Second',description:'Second',difficulty:'madali',visibility:'shared',teacherId:'teacher',publicationState:'published'}],
    ['classes/class',{teacherId:'teacher'}], ['classes/class/classLessons/original',{lessonId:'original',moduleId:'assigned-module',order:1}],
    ['users/student/assignedLessons/original',{quizScore:4,quizFinished:true}],
    ['lessons/private-other',{title:'Private',visibility:'private',teacherId:'other',publicationState:'published'}],
    ['lessons/archived',{title:'Archived',visibility:'shared',teacherId:'teacher',archived:true}],
    ['lessons/metadata',{title:'Metadata',description:'Unchanged content',visibility:'shared',teacherId:'teacher',publicationState:'published'}],
    ['lessons/metadata/quiz/content',{questions:[{question:'Unchanged',answers:[0]}]}],
    ['lessons/legacy',{title:'Legacy',description:'Legacy',visibility:'shared',adminManaged:true,publicationState:'published'}],
  ]) await db.doc(path).set(data);
  const original = (await db.doc('lessons/original').get()).data();
  const lecture = (await db.doc('lessons/original/lectures/content').get()).data();
  const firstKey = crypto.randomUUID();
  const first = await reserve('teacher',{requestKey:firstKey});
  assert.equal(first.title,'Idyoma - 1.1');
  const sameRequest = await reserve('teacher',{requestKey:firstKey});
  assert.equal(sameRequest.id,first.id);
  const parallel = await Promise.all([reserve('teacher'),reserve('other')]);
  assert.deepEqual(parallel.map(r=>r.title).sort(),['Idyoma - 1.2','Idyoma - 1.3']);
  assert.equal((await stored('lessons',first.id)).teacherId,'teacher');
  assert.equal((await stored('lessons',first.id)).adminManaged,undefined);
  assert.equal((await stored('lessons',first.id)).publicationState,'draft');
  await db.doc(`lessons/${first.id}`).update({publicationState:'published'});
  await assert.rejects(()=>reserve('teacher',{sourceId:first.id,expectedUpdatedAt:'stale'}),e=>e.status===409);
  const fromVersion = await reserve('teacher',{sourceId:first.id});
  assert.equal(fromVersion.title,'Idyoma - 1.4');
  assert.equal((await reserve('teacher',{sourceId:first.id,title:first.title})).title,'Idyoma - 1.5');
  const renamed = await reserve('teacher',{title:'Mga Idyoma'});
  assert.equal(renamed.title,'Mga Idyoma');
  await db.doc(`lessons/${renamed.id}`).update({publicationState:'published'});
  const renamedAgain = await reserve('teacher',{sourceId:renamed.id,title:'Mga Idyoma'});
  assert.equal(renamedAgain.title,'Mga Idyoma - 1.1');
  await assert.rejects(()=>reserve('other',{title:'Second'}),e=>e.status===409);
  for(const uid of ['student','disabled'])await assert.rejects(()=>reserve(uid),e=>e.status===403);
  await assert.rejects(()=>reserve('teacher',{sourceId:'private-other',title:'Private'}),e=>e.status===403);
  await assert.rejects(()=>reserve('teacher',{sourceId:'archived',title:'Archived'}),e=>e.status===409);
  await db.doc('lessons/public-derived').set({title:'Public derived - 1.1',visibility:'shared',teacherId:'other',publicationState:'published',sourceLessonId:'private-other',copiedFromLessonId:'private-other',versionBaseTitle:'Public derived',versionNumber:1});
  assert.equal((await reserve('teacher',{sourceId:'public-derived',title:'Public derived'})).title,'Public derived - 1.2');
  assert.deepEqual((await db.doc('lessons/original').get()).data(),original);
  assert.deepEqual((await db.doc('lessons/original/lectures/content').get()).data(),lecture);
  const beforeVisibility = (await db.collection('lessons').get()).size;
  const quiz = (await db.doc('lessons/metadata/quiz/content').get()).data();
  const visibility = await setLessonVisibility(db,'teacher',{id:'metadata',visibility:'private'});
  assert.equal(visibility.changeKind,'visibility');assert.equal(visibility.id,'metadata');
  assert.equal((await db.collection('lessons').get()).size,beforeVisibility);
  assert.deepEqual((await db.doc('lessons/metadata/quiz/content').get()).data(),quiz);
  assert.equal((await setLessonVisibility(db,'teacher',{id:'metadata',visibility:'private'})).changeKind,'none');
  await setLessonVisibility(db,'admin',{id:'legacy',visibility:'private'});
  assert.equal((await db.doc('lessons/legacy').get()).get('teacherId'),'admin');
  assert.equal((await db.doc('lessons/legacy').get()).get('adminManaged'),false);
  const created = await moduleSave('teacher',null);
  let module = await stored('modules',created.id);
  const moduleBefore = (await db.doc(`modules/${module.id}`).get()).data();
  const changed = await moduleSave('teacher',module,{description:'Changed module content'});
  assert.notEqual(changed.id,module.id);assert.equal(changed.module.title,'Module - 1.1');
  assert.deepEqual((await db.doc(`modules/${module.id}`).get()).data(),moduleBefore);
  const ordered = await moduleSave('teacher',module,{lessonIds:['second','original']});
  assert.equal(ordered.module.title,'Module - 1.2');
  const renamedModule = await moduleSave('teacher',module,{title:'New module title'});
  assert.equal(renamedModule.module.title,'New module title');
  const renamedSource = await stored('modules',renamedModule.id);
  const renamedModuleEdit = await moduleSave('teacher',renamedSource,{description:'Changed after rename'});
  assert.equal(renamedModuleEdit.module.title,'New module title - 1.1');
  const numberBefore = (await db.collection('modules').get()).size;
  const metadataOnly = await moduleSave('teacher',module,{visibility:'private'});
  assert.equal(metadataOnly.id,module.id);assert.equal(metadataOnly.changeKind,'visibility');
  assert.equal((await db.collection('modules').get()).size,numberBefore);
  module = await stored('modules',module.id);
  const stamp = (await db.doc(`modules/${module.id}`).get()).updateTime.toMillis();
  assert.equal((await moduleSave('teacher',module)).changeKind,'none');
  assert.equal((await db.doc(`modules/${module.id}`).get()).updateTime.toMillis(),stamp);
  const copySource = await stored('modules',ordered.id);
  await assert.rejects(()=>moduleSave('other',copySource,{visibility:'private'}),e=>e.status===403);
  const otherCopy = await moduleSave('other',copySource,{description:'Another teacher version',visibility:'private'});
  assert.equal(otherCopy.module.ownerId,'other');
  assert.equal((await db.doc(`modules/${copySource.id}`).get()).get('ownerId'),'teacher');
  await assert.rejects(()=>moduleSave('teacher',{...module,revision:1},{description:'Stale edit'}),e=>e.status===409);
  await assert.rejects(()=>setLessonVisibility(db,'teacher',{id:'original',visibility:'private'}),e=>e.status===403);
  await assert.rejects(()=>setLessonVisibility(db,'admin',{id:'original',visibility:'private'}),e=>e.status===409);
  const requestKey = crypto.randomUUID();
  const retry = await moduleSave('teacher',module,{description:'Retry version',requestKey});
  assert.equal((await moduleSave('teacher',module,{description:'Retry version',requestKey})).id,retry.id);
  assert.deepEqual((await db.doc('classes/class/classLessons/original').get()).data(),{lessonId:'original',moduleId:'assigned-module',order:1});
  assert.deepEqual((await db.doc('users/student/assignedLessons/original').get()).data(),{quizScore:4,quizFinished:true});
  console.log('PASS: preserved originals/sections/classes/progress; same-title sequential copies; renamed unsuffixed copies; editing versions; visibility-only in-place; no-op writes; concurrent counters; idempotent retries; ownership and stale edits.');
} finally { await db.terminate(); await deleteApp(app); await emulator.stop(); }
