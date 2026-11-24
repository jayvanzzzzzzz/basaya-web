import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startFirestoreTestServer } from './firestore-test-server.mjs';
import { archiveClassContent } from '../notify-api/lib/classContentArchive.js';
const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: emulator.project }), db = getFirestore(app);
const run = (body, uid = 'teacher') => archiveClassContent(db, uid, {classId:'class',action:'archive-class-content',...body});
try {
  for (const [path, data] of [
    ['users/teacher',{role:'teacher'}],['users/other',{role:'teacher'}],['users/student',{role:'student'}],
    ['classes/class',{teacherId:'teacher'}],['classes/other',{teacherId:'other'}],
    ['classes/class/learningPaths/path',{title:'Reading path',lessonIds:['a','b'],linkIds:['a','b']}],
    ['classes/class/classLessons/a',{lessonId:'a',learningPathAssignmentId:'path',mode:'assessment',order:1,dueAt:123}],
    ['classes/class/classLessons/b',{lessonId:'b',learningPathAssignmentId:'path',mode:'assessment',order:2}],
    ['classes/class/classLessons/c__practice',{lessonId:'c',mode:'practice',order:3}],
    ['classes/other/classLessons/a',{lessonId:'a',mode:'assessment'}],
    ['lessons/a',{title:'A',archived:false}],['learningPaths/library',{title:'Original path',archived:false}],
    ['users/student/assignedLessons/a',{score:7,lectureFinished:true}],
  ]) await db.doc(path).set(data);
  for(const uid of ['student','other']) await assert.rejects(()=>run({assignmentId:'path'},uid),e=>e.status===403);
  await assert.rejects(()=>run({classId:'other',linkId:'a'}),e=>e.status===403);
  await run({linkId:'a'});
  assert.equal((await db.doc('classes/class/classLessons/a').get()).exists,false);
  assert.equal((await db.doc('classes/class/classLessons/b').get()).exists,true);
  assert.equal((await db.doc('classes/class/learningPaths/path').get()).get('archived'),undefined);
  await run({linkId:'c__practice'});
  assert.equal((await db.collection('classes/class/learningPaths').get()).size,1);
  await run({assignmentId:'path'});
  assert.equal((await db.collection('classes/class/classLessons').get()).size,0);
  assert.equal((await db.doc('classes/class/learningPaths/path').get()).get('archived'),true);
  assert.equal((await run({assignmentId:'path'})).changed,false);
  assert.deepEqual((await db.doc('users/student/assignedLessons/a').get()).data(),{score:7,lectureFinished:true});
  assert.equal((await db.doc('classes/other/classLessons/a').get()).exists,true);
  assert.equal((await db.doc('lessons/a').get()).get('archived'),false);
  assert.equal((await db.doc('learningPaths/library').get()).get('archived'),false);
  await db.doc('classes/class/classLessons/a').set({lessonId:'a',mode:'assessment',newAssignment:true});
  await assert.rejects(()=>run({assignmentId:'path',action:'restore-class-path'}),e=>e.status===409);
  assert.equal((await db.doc('classes/class/classLessons/a').get()).get('newAssignment'),true);
  await db.doc('classes/class/classLessons/a').delete();
  await run({assignmentId:'path',action:'restore-class-path'});
  assert.deepEqual((await db.doc('classes/class/classLessons/a').get()).data(),{lessonId:'a',learningPathAssignmentId:'path',mode:'assessment',order:1,dueAt:123});
  assert.equal((await db.doc('classes/class/classLessons/b').get()).exists,true);
  assert.equal((await db.doc('classes/class/classLessons/c__practice').get()).exists,false);
  assert.equal((await db.doc('users/student/assignedLessons/a').get()).get('score'),7);
  assert.equal((await run({assignmentId:'path',action:'restore-class-path'})).changed,false);
  await db.doc('classes/class').update({archived:true});
  await assert.rejects(()=>run({assignmentId:'path'}),e=>e.status===403);
  console.log('PASS: class ownership, individual/path archive, full-path restore including previously archived child, retry safety, restore conflicts, untouched progress/library/other classes and archived-class denial.');
} finally {await deleteApp(app);await emulator.stop();}
