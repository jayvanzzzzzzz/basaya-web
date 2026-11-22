import assert from 'node:assert/strict';
import { startFirestoreTestServer } from './firestore-test-server.mjs';
import { createRequire } from 'node:module';
import { reserveUsername } from '../notify-api/lib/usernames.js';
import { createStudentAccount } from '../notify-api/lib/studentAccounts.js';
const emulator=await startFirestoreTestServer(...process.argv.slice(2));
const fields=data=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,{stringValue:v}]));
const patch=(path,data,uid)=>fetch(`${emulator.documents}/${path}?${Object.keys(data).map(k=>'updateMask.fieldPaths='+k).join('&')}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${uid?emulator.token(uid):'owner'}`},body:JSON.stringify({fields:fields(data)})});
try {
  assert.equal((await patch('users/teacher',{role:'teacher',displayName:'Teacher'})).status,200);
  assert.equal((await patch('usernames/teacher_one',{uid:'teacher'})).status,200);
  assert.equal((await patch('users/teacher',{username:'bypass'},'teacher')).status,403);
  assert.equal((await patch('users/teacher',{displayName:'Updated Teacher'},'teacher')).status,200);
  assert.equal((await patch('usernames/teacher_one',{uid:'teacher'},'teacher')).status,403);
  assert.equal((await patch('usernames/another',{uid:'teacher'},'teacher')).status,403);
  for(const headers of [{},{Authorization:`Bearer ${emulator.token('teacher')}`}])assert.equal((await fetch(`${emulator.documents}/usernames/teacher_one`,{headers})).status,403);
  assert.equal((await patch('users/new_student',{role:'student',username:'bypass'},'new_student')).status,403);
  assert.equal((await patch('users/new_student',{role:'student',username:''},'new_student')).status,403);
  assert.equal((await patch('users/student',{role:'student',username:'student_one',lrn:'001234567890'})).status,200);
  assert.equal((await patch('users/student',{lrn:'999999999999'},'student')).status,403);
  assert.equal((await patch('users/student',{username:'changed'},'student')).status,403);
  assert.equal((await patch('users/student',{firstName:'Updated'},'student')).status,200);
  assert.equal((await patch('learnerNumbers/001234567890',{uid:'student'},'student')).status,403);
  assert.equal((await fetch(`${emulator.documents}/learnerNumbers/001234567890`,{headers:{Authorization:`Bearer ${emulator.token('student')}`}})).status,403);
  process.env.FIRESTORE_EMULATOR_HOST=emulator.host;
  const require=createRequire(new URL('../notify-api/package.json',import.meta.url));
  const {initializeApp,deleteApp}=require('firebase-admin/app');
  const {getFirestore}=require('firebase-admin/firestore');
  const app=initializeApp({projectId:emulator.project},'username-concurrency-test');
  const firestore=getFirestore(app);
  try {
    await firestore.doc('users/teacher2').set({role:'teacher'});
    const results=await Promise.allSettled([reserveUsername(firestore,'teacher','same_name'),reserveUsername(firestore,'teacher2','same_name')]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.status===409).length,1);
    const winner=(await firestore.doc('usernames/same_name').get()).get('uid');
    await reserveUsername(firestore,winner,'renamed_teacher');
    assert.equal((await firestore.doc('usernames/same_name').get()).exists,false);
    assert.equal((await firestore.doc(`users/${winner}`).get()).get('username'),'renamed_teacher');
    const createdUsers=new Map();
    const authentication={createUser:async user=>{createdUsers.set(user.uid,user);return user;},deleteUser:async uid=>{createdUsers.delete(uid);}};
    const details={firstName:'Test',lastName:'Student',lrn:'012345678901',username:'student_alpha',password:'TestPassword1'};
    const attempts=await Promise.allSettled([
      createStudentAccount(firestore,authentication,'admin',details),
      createStudentAccount(firestore,authentication,'admin',{...details,username:'student_beta'}),
    ]);
    assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(attempts.filter(result=>result.status==='rejected'&&result.reason.status===409).length,1);
    assert.equal(createdUsers.size,1,'The losing request removes its unprovisioned Auth user');
    const account=attempts.find(result=>result.status==='fulfilled').value;
    assert.equal((await firestore.doc(`learnerNumbers/${details.lrn}`).get()).get('uid'),account.uid);
    assert.equal((await firestore.doc(`usernames/${account.username}`).get()).get('uid'),account.uid);
    assert.equal((await firestore.doc(`users/${account.uid}`).get()).get('lrn'),details.lrn);
  } finally {await firestore.terminate();await deleteApp(app);}
  console.log('PASS: real Firestore rules compile; private aliases and LRNs, denied self-registration and identity changes, preserved profile updates.');
  console.log('PASS: real Firestore transactions resolve simultaneous claims and release old usernames atomically.');
  console.log('PASS: simultaneous student account requests reserve a single LRN and username together; losing Auth user rolls back. Auth creation is mocked; Firestore transactions are real.');
} finally {await emulator.stop();}
