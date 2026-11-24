import assert from 'node:assert/strict';
import { startFirestoreTestServer } from './firestore-test-server.mjs';
const emulator=await startFirestoreTestServer(...process.argv.slice(2));
const encode=data=>Object.fromEntries(Object.entries(data).map(([key,value])=>[key,typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?{integerValue:value}:{stringValue:value}]));
const patch=(path,data,uid)=>fetch(`${emulator.documents}/${path}?${Object.keys(data).map(key=>'updateMask.fieldPaths='+key).join('&')}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${uid?emulator.token(uid):'owner'}`},body:JSON.stringify({fields:encode(data)})});
const get=(path,uid)=>fetch(`${emulator.documents}/${path}`,{headers:{Authorization:`Bearer ${emulator.token(uid)}`}});
try {
  for(const [path,data] of [
    ['users/admin',{role:'admin'}],['users/teacher',{role:'teacher'}],
    ['users/student',{role:'student',classId:'class1',disabled:false}],
    ['classes/class1',{teacherId:'teacher',className:'Preserved class'}],
    ['classes/class1/students/student',{fullName:'Student'}],
    ['users/student/assignedLessons/lesson',{score:92}],['lessons/lesson',{title:'Preserved lesson'}],
  ]) assert.equal((await patch(path,data)).status,200);
  assert.equal((await get('classes/class1','student')).status,200);
  assert.equal((await get('users/student/assignedLessons/lesson','student')).status,200);
  await patch('users/student',{disabled:true});
  for(const path of ['classes/class1','classes/class1/students/student','users/student/assignedLessons/lesson','lessons/lesson']) assert.equal((await get(path,'student')).status,403,path);
  assert.equal((await get('users/student','student')).status,200,'Own profile stays readable for live deactivation detection');
  assert.equal((await patch('users/student',{disabled:false},'student')).status,403,'Student cannot reactivate themselves');
  assert.equal((await patch('users/student',{firstName:'Changed'},'student')).status,403);
  for(const uid of ['admin','teacher']) assert.equal((await get('users/student/assignedLessons/lesson',uid)).status,200,'Staff retain reporting access');
  await patch('users/student',{disabled:false});
  assert.equal((await get('classes/class1','student')).status,200);
  const progress=await (await get('users/student/assignedLessons/lesson','student')).json();
  assert.equal(Number(progress.fields.score.integerValue),92);
  console.log('PASS: real Firestore rules block deactivated students, prevent self-reactivation, retain own-profile detection and staff reporting, and restore access to preserved class/progress on reactivation.');
} finally { await emulator.stop(); }
