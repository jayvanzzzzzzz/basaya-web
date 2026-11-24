import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startFirestoreTestServer } from './firestore-test-server.mjs';
import { changeContentLifecycle } from '../notify-api/lib/contentLifecycle.js';
import { createHash } from 'node:crypto';

const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: emulator.project });
const db = getFirestore(app);
const run = (uid, kind, id, action, reason) => changeContentLifecycle(db, uid, { kind, id, action, reason });
const headers = uid => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${emulator.token(uid)}` });
const denied = async (uid, kind, id, action, status = 403, reason) => assert.rejects(() => run(uid, kind, id, action, reason), error => error.status === status);
try {
  for (const [path, data] of [
    ['users/teacher', {role:'teacher'}], ['users/other', {role:'teacher'}], ['users/admin',{role:'admin'}],
    ['users/disabled',{role:'teacher',disabled:true}], ['users/student',{role:'student',classId:'class'}],
    ['lessons/own',{title:'Original',teacherId:'teacher',visibility:'shared'}],
    ['lessons/copy',{title:'Copy',teacherId:'teacher',visibility:'private',sourceLessonId:'own'}],
    ['lessons/other',{title:'Other',teacherId:'other',visibility:'shared'}],
    ['lessons/other-private',{title:'Private',teacherId:'other',visibility:'private'}],
    ['lessons/own/lectures/content',{title:'Lecture'}],
    ['modules/own',{title:'Module',ownerId:'teacher',visibility:'private',revision:1,lessonIds:['own'],createdAt:Timestamp.now()}],
    ['classes/class',{teacherId:'teacher'}], ['classes/class/students/student',{membershipStatus:'enrolled'}],
    ['classes/class/classLessons/own',{lessonId:'own',moduleId:'own'}],
    ['users/student/assignedLessons/own',{lectureFinished:true,score:5}],
  ]) await db.doc(path).set(data);
  await denied('other','lesson','own','archive');
  await denied('student','lesson','own','archive');
  await denied('disabled','lesson','own','archive');
  await denied('admin','lesson','other-private','archive');
  await denied('teacher','module','missing','archive',404);
  await denied('teacher','lesson','own','delete',409);
  await run('teacher','lesson','copy','archive');
  assert.equal((await db.doc('lessons/own').get()).get('archived'),undefined);
  await run('teacher','lesson','copy','restore');
  assert.equal((await db.doc('lessons/copy').get()).get('visibility'),'private');
  await run('teacher','module','own','archive');
  assert.equal((await db.doc('lessons/own').get()).get('archived'),undefined);
  await run('teacher','module','own','restore');
  assert.equal((await db.doc('modules/own').get()).get('revision'),3);
  await denied('admin','lesson','own','archive',400);
  await run('admin','lesson','own','archive','Review the examples.');
  assert.equal((await db.doc('lessons/own').get()).get('archiveModerated'),true);
  assert.equal((await db.collection('users/teacher/contentNotices').get()).size,1);
  await denied('teacher','lesson','own','restore');
  await denied('teacher','lesson','own','delete');
  const historyCount = (await db.collection('contentLifecycleEvents').get()).size;
  assert.equal((await run('admin','lesson','own','archive','Repeat')).changed,false);
  assert.equal((await db.collection('contentLifecycleEvents').get()).size,historyCount);
  for (const uid of ['admin','teacher']) {
    const response = await fetch(`${emulator.documents}/lessons/own?updateMask.fieldPaths=archived`, {method:'PATCH',headers:headers(uid),body:JSON.stringify({fields:{archived:{booleanValue:false}}})});
    assert.equal(response.status,403);
    assert.equal((await fetch(`${emulator.documents}/lessons/own`, {method:'DELETE',headers:headers(uid)})).status,403);
  }
  assert.equal((await fetch(`${emulator.documents}/lessons/own/lectures/content`, {headers:headers('student')})).status,200);
  const assignment = await fetch(`${emulator.documents}/classes/class/classLessons/own__practice`, {method:'PATCH',headers:headers('teacher'),body:JSON.stringify({fields:{lessonId:{stringValue:'own'},mode:{stringValue:'practice'}}})});
  assert.equal(assignment.status,403);
  const patchFields = (path, fields, uid) => fetch(`${emulator.documents}/${path}?${Object.keys(fields).map(key=>'updateMask.fieldPaths='+key).join('&')}`, {method:'PATCH',headers:headers(uid),body:JSON.stringify({fields})});
  assert.equal((await patchFields('lessons/forged-admin',{title:{stringValue:'Forged'},teacherId:{stringValue:'teacher'},adminManaged:{booleanValue:true}},'teacher')).status,403);
  assert.equal((await patchFields('lessons/copy',{adminManaged:{booleanValue:true}},'teacher')).status,403);
  await db.doc('lessons/legacy-private-guard').set({title:'Legacy guard',visibility:'shared',adminManaged:true});
  assert.equal((await patchFields('lessons/legacy-private-guard',{visibility:{stringValue:'private'}},'admin')).status,403);
  assert.equal((await patchFields('lessons/legacy-private-guard',{visibility:{stringValue:'private'},teacherId:{stringValue:'admin'},adminManaged:{booleanValue:false}},'admin')).status,200);
  assert.equal((await fetch(`${emulator.documents}/lessons/legacy-private-guard`,{headers:headers('admin')})).status,200);
  assert.equal((await fetch(`${emulator.documents}/lessons/legacy-private-guard`,{headers:headers('teacher')})).status,403);
  assert.deepEqual((await db.doc('users/student/assignedLessons/own').get()).data(),{lectureFinished:true,score:5});
  await run('admin','lesson','own','restore','Examples reviewed.');
  assert.equal((await db.doc('lessons/own').get()).get('visibility'),'shared');
  assert.equal((await db.doc('lessons/own').get()).get('archived'),false);
  assert.equal((await db.collection('users/teacher/contentNotices').get()).size,2);
  for (const [path, data] of [
    ['lessons/adminOwn',{title:'Admin original',teacherId:'admin',visibility:'shared'}],
    ['lessons/legacy',{title:'Idyoma',visibility:'shared'}],
    ['lessons/unused',{title:'Unused',teacherId:'teacher',visibility:'private'}],
    ['lessons/unused/lectures/content',{title:'Unused lecture'}],
    ['lessons/unused/lectures/content/notes/extra',{text:'Nested content'}],
    ['modules/unused',{title:'Unused module',ownerId:'teacher',visibility:'private',lessonIds:['unused'],revision:1}],
    ['lessons/historical',{title:'Historical lesson',teacherId:'teacher',visibility:'shared'}],
    ['users/student/classProgress/old/archives/saved/lessons/historical',{score:3}],
    ['lessons/source',{title:'Source',teacherId:'teacher',visibility:'shared'}],
    ['lessons/dependent',{title:'Dependent',teacherId:'teacher',visibility:'shared',sourceLessonId:'source'}],
    ['lessons/adminDelete',{title:'Admin unused',teacherId:'admin',visibility:'shared'}],
    ['lessons/byAdmin',{title:'Earlier creator field',createdBy:'admin',visibility:'shared'}],
    ['modules/unassigned-arrangement',{title:'Unassigned arrangement',ownerId:'teacher',visibility:'private',lessonIds:['own'],revision:1}],
  ]) await db.doc(path).set(data);
  await run('admin','lesson','adminOwn','archive');
  assert.equal((await db.doc('lessons/adminOwn').get()).get('archiveModerated'),false);
  await run('admin','lesson','adminOwn','restore');
  await run('admin','lesson','byAdmin','archive');
  assert.equal((await db.doc('lessons/byAdmin').get()).get('archiveModerated'),false);
  await run('admin','lesson','legacy','archive');
  assert.equal((await db.doc('lessons/legacy').get()).get('archiveModerated'),false);
  assert.equal((await db.doc('lessons/legacy').get()).get('teacherId'),undefined);
  await run('admin','lesson','legacy','delete');
  await run('admin','lesson','adminDelete','delete');
  await denied('other','lesson','unused','delete');
  await denied('admin','lesson','unused','delete');
  await denied('teacher','lesson','unused','delete',409);
  await denied('teacher','lesson','historical','delete',409);
  await denied('teacher','module','own','delete',409);
  await run('teacher','module','unassigned-arrangement','delete');
  assert.equal((await db.doc('lessons/own').get()).exists,true);
  await db.doc('modules/version-source').set({title:'Module source',ownerId:'teacher',visibility:'private',lessonIds:['own'],revision:1});
  await db.doc('modules/version-child').set({title:'Module source - 1.1',ownerId:'teacher',visibility:'private',lessonIds:['own'],revision:1,sourceModuleId:'version-source',copiedFromModuleId:'version-source'});
  await denied('teacher','module','version-source','delete',409);
  await denied('teacher','lesson','source','delete',409);
  await run('teacher','module','unused','delete');
  assert.equal((await db.doc('lessons/unused').get()).exists,true);
  await run('teacher','lesson','unused','delete');
  assert.equal((await db.doc('lessons/unused').get()).exists,false);
  assert.equal((await db.doc('lessons/unused/lectures/content/notes/extra').get()).exists,false);
  await denied('admin','lesson','other','delete',400);
  await run('admin','lesson','other','delete','Unused duplicate.');
  assert.equal((await db.collection('users/other/contentNotices').get()).size,1);
  // Interrupted child cleanup stays locked, and a retry finishes the same deletion.
  await db.doc('lessons/retry').set({title:'Retry',teacherId:'teacher',visibility:'private'});
  await db.doc('lessons/retry/lectures/content').set({title:'Child'});
  const failingCleanup = {
    doc:db.doc.bind(db), collection:db.collection.bind(db), collectionGroup:db.collectionGroup.bind(db),
    runTransaction:db.runTransaction.bind(db), recursiveDelete:async()=>{throw Error('Synthetic cleanup failure');},
  };
  await assert.rejects(() => changeContentLifecycle(failingCleanup,'teacher',{kind:'lesson',id:'retry',action:'delete'}), /Synthetic cleanup/);
  assert.equal((await db.doc('lessons/retry').get()).get('deletionPending'),true);
  await denied('teacher','lesson','retry','restore',409);
  await run('teacher','lesson','retry','delete');
  assert.equal((await db.doc('lessons/retry').get()).exists,false);
  assert.equal((await db.collection('contentLifecycleEvents').where('contentId','==','retry').get()).size,1);
  // An in-flight assignment must either win and block deletion, or be denied.
  await db.doc('lessons/race').set({title:'Race',teacherId:'teacher',visibility:'private'});
  const [deletion, assignmentRace] = await Promise.allSettled([
    run('teacher','lesson','race','delete'),
    fetch(`${emulator.documents}/classes/class/classLessons/race`, {method:'PATCH',headers:headers('teacher'),body:JSON.stringify({fields:{lessonId:{stringValue:'race'}}})}),
  ]);
  if (assignmentRace.value.status === 200) {
    assert.equal(deletion.status,'rejected'); assert.equal(deletion.reason.status,409);
    assert.equal((await db.doc('lessons/race').get()).exists,true);
  } else { assert.equal(assignmentRace.value.status,403); assert.equal(deletion.status,'fulfilled'); }
  // Unknown legacy attempts must not be silently discarded or guessed.
  await db.doc('lessons/blocked').set({title:'Blocked',teacherId:'teacher',visibility:'private'});
  await db.doc('users/student/assessmentAttempts/unknown').set({parts:{}});
  await denied('teacher','lesson','blocked','delete',409);
  await db.doc('users/student/assessmentAttempts/unknown').delete();
  const key = createHash('sha256').update(JSON.stringify(['oldclass','session','historical'])).digest('hex');
  await db.doc('users/student/classProgress/old/archives/saved').set({classId:'oldclass',progressSession:'session'});
  await db.doc(`users/student/assessmentAttempts/${key}`).set({parts:{}});
  await run('teacher','lesson','blocked','delete');
  console.log('PASS: owner/legacy confirmation policy, moderation, archive access, deletion usage/progress/reference guards, recursive cleanup, modules preserve lessons, assignment/deletion race and legacy attempt safety.');
} finally { await db.terminate(); await deleteApp(app); await emulator.stop(); }
