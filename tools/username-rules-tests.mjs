import assert from 'node:assert/strict';
import { startFirestoreTestServer } from './firestore-test-server.mjs';
import { createRequire } from 'node:module';
import { reserveUsername } from '../notify-api/lib/usernames.js';
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
  assert.equal((await patch('users/new_student',{role:'student',username:''},'new_student')).status,200);
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
  } finally {await firestore.terminate();await deleteApp(app);}
  console.log('PASS: real Firestore rules compile; private aliases, denied client username bypass, preserved profile updates and student registration.');
  console.log('PASS: real Firestore transactions resolve simultaneous claims and release old usernames atomically.');
} finally {await emulator.stop();}
