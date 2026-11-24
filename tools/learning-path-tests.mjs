import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { saveLearningPath, assignLearningPath, scheduleLearningPath } from '../notify-api/lib/learningPaths.js';
import { changeContentLifecycle } from '../notify-api/lib/contentLifecycle.js';
import { saveModuleVersion } from '../notify-api/lib/contentVersioning.js';
import { startFirestoreTestServer } from './firestore-test-server.mjs';
const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: emulator.project }), db = getFirestore(app);
const denied = async (fn, status) => assert.rejects(fn, error => error.status === status);
try {
  for (const [path, data] of [
    ['users/teacher',{role:'teacher'}],['users/admin',{role:'admin'}],['users/other',{role:'teacher'}],['users/student',{role:'student'}],
    ['classes/class',{teacherId:'teacher'}],
    ['lessons/a',{title:'A',teacherId:'teacher',visibility:'shared'}],['lessons/b',{title:'B',teacherId:'teacher',visibility:'shared'}],
    ['modules/a',{title:'Module A',ownerId:'teacher',visibility:'shared',lessonIds:['a'],revision:1}],
    ['modules/b',{title:'Module B',ownerId:'teacher',visibility:'shared',lessonIds:['b'],revision:1}],
  ]) await db.doc(path).set(data);
  const values = {title:'Reading path',visibility:'shared',moduleIds:['b','a'],requestKey:crypto.randomUUID()};
  const {id} = await saveLearningPath(db,'teacher',values);
  assert.equal((await saveLearningPath(db,'teacher',values)).id,id);
  const privatePath = await saveLearningPath(db,'teacher',{title:'Private path',moduleIds:['a'],requestKey:crypto.randomUUID()});
  assert.equal((await db.doc(`learningPaths/${privatePath.id}`).get()).get('visibility'),'private');
  const headersFor = uid => ({Authorization:`Bearer ${emulator.token(uid)}`,'Content-Type':'application/json'});
  for (const [uid,status] of [['teacher',200],['other',403],['admin',200]]) assert.equal((await fetch(`${emulator.documents}/learningPaths/${privatePath.id}`,{headers:headersFor(uid)})).status,status);
  assert.equal((await fetch(`${emulator.documents}/learningPaths/${id}`,{headers:headersFor('other')})).status,200);
  await denied(()=>saveLearningPath(db,'teacher',{...values,visibility:'public',requestKey:crypto.randomUUID()}),400);
  await db.doc('modules/a').update({visibility:'private'});
  await denied(()=>saveLearningPath(db,'teacher',{...values,requestKey:crypto.randomUUID()}),409);
  await db.doc('modules/a').update({visibility:'shared'});
  await denied(()=>saveModuleVersion(db,'teacher',{sourceId:'a',revision:1,title:'Module A',description:'',lessonIds:['a'],visibility:'private',requestKey:crypto.randomUUID()}),409);
  await saveLearningPath(db,'admin',{...values,requestKey:crypto.randomUUID()});
  await denied(()=>saveLearningPath(db,'student',{...values,requestKey:crypto.randomUUID()}),403);
  await denied(()=>saveLearningPath(db,'other',{...values,id,revision:1,requestKey:crypto.randomUUID()}),403);
  const dueAt=Date.now()+86400000;
  const assignment={pathId:id,revision:1,classId:'class',moduleIds:['b','a'],mode:'assessment',openAt:null,dueAt,requestKey:crypto.randomUUID()};
  const assigned=await assignLearningPath(db,'teacher',assignment);
  assert.equal((await assignLearningPath(db,'teacher',assignment)).id,assigned.id);
  const links=await db.collection('classes/class/classLessons').orderBy('order').get();
  assert.deepEqual(links.docs.map(item=>item.get('lessonId')),['b','a']);
  assert.ok(links.docs.every(item=>item.get('dueAt').toMillis()===dueAt));
  await denied(()=>assignLearningPath(db,'other',{...assignment,requestKey:crypto.randomUUID()}),403);
  await denied(()=>changeContentLifecycle(db,'teacher',{kind:'learningPath',id,action:'delete'}),409);
  await denied(()=>changeContentLifecycle(db,'admin',{kind:'learningPath',id,action:'delete',reason:'Delete used path'}),409);
  await saveLearningPath(db,'teacher',{...values,id,revision:1,visibility:'private',requestKey:crypto.randomUUID()});
  assert.equal((await db.doc(`learningPaths/${id}`).get()).get('everAssigned'),true);
  assert.equal((await db.collection('classes/class/classLessons').get()).size,2);
  await denied(()=>changeContentLifecycle(db,'teacher',{kind:'learningPath',id,action:'delete'}),409);
  await denied(()=>changeContentLifecycle(db,'admin',{kind:'learningPath',id,action:'archive'}),400);
  await changeContentLifecycle(db,'admin',{kind:'learningPath',id,action:'archive',reason:'Review path'});
  assert.equal((await db.doc(`learningPaths/${id}`).get()).get('archiveModerated'),true);
  assert.equal((await db.collection('users/teacher/contentNotices').get()).size,1);
  assert.equal((await db.collection('classes/class/classLessons').get()).size,2);
  await denied(()=>changeContentLifecycle(db,'teacher',{kind:'learningPath',id,action:'restore'}),403);
  await scheduleLearningPath(db,'teacher',{classId:'class',assignmentId:assigned.id,openAt:null,dueAt:dueAt+86400000});
  assert.ok((await db.collection('classes/class/classLessons').get()).docs.every(item=>item.get('dueAt').toMillis()===dueAt+86400000));
  const unused=await saveLearningPath(db,'teacher',{...values,requestKey:crypto.randomUUID()});
  await changeContentLifecycle(db,'teacher',{kind:'learningPath',id:unused.id,action:'delete'});
  assert.equal((await db.doc(`learningPaths/${unused.id}`).get()).exists,false);
  assert.equal((await db.doc('modules/a').get()).exists,true);
  const legacy = await saveLearningPath(db,'teacher',{...values,requestKey:crypto.randomUUID()});
  await db.doc('classes/class/learningPaths/legacy').set({pathId:legacy.id,title:'Legacy assignment'});
  await denied(()=>changeContentLifecycle(db,'teacher',{kind:'learningPath',id:legacy.id,action:'delete'}),409);
  assert.equal((await db.doc(`learningPaths/${legacy.id}`).get()).exists,true);
  const headers={Authorization:`Bearer ${emulator.token('teacher')}`,'Content-Type':'application/json'};
  const response=await fetch(`${emulator.documents}/learningPaths/forged`,{method:'PATCH',headers,body:JSON.stringify({fields:{title:{stringValue:'Forged'}}})});
  assert.equal(response.status,403);
  console.log('PASS: staff creation, ownership, ordered assignment, shared deadline, idempotent retries, guarded deletion, admin moderation notes/notices, archive preservation, whole-path rescheduling and denied direct writes.');
} finally {await deleteApp(app);await emulator.stop();}
