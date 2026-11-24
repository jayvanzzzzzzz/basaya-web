import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createStudentAccount, studentDetails, assignStudentLrn } from '../notify-api/lib/studentAccounts.js';
import { changeStudentAccess } from '../notify-api/lib/studentAccess.js';

const body = { firstName:' Ana ', middleName:'', lastName:'Cruz', lrn:'001234567890', username:' Ana_Cruz ', password:'TestPassword1' };
assert.equal(studentDetails(body).lrn,'001234567890');
assert.equal(studentDetails(body).username,'cruz.ana');
assert.equal(studentDetails({...body,username:'ignored'}).username,'cruz.ana');
for (const values of [{lrn:'123'}, {lrn:'1234567890123'}, {lrn:'12345678901a'}, {lrn:123456789012}, {password:'short'}, {lastName:''}]) {
  assert.throws(()=>studentDetails({...body,...values}),e=>e.status===400);
}
const rows=new Map(), users=new Map();
let failTransaction=false, deleted=0;
const firestore={doc:path=>({path}),runTransaction:async run=>{
  const pending=[];
  const result=await run({get:async ref=>({exists:rows.has(ref.path),get:key=>rows.get(ref.path)?.[key]}),set:(ref,value)=>pending.push([ref.path,value])});
  if(failTransaction)throw Error('Offline');
  pending.forEach(([key,value])=>rows.set(key,value));return result;
}};
const auth={createUser:async user=>{users.set(user.uid,user);return user;},deleteUser:async uid=>{deleted++;users.delete(uid);}};
const result=await createStudentAccount(firestore,auth,'admin',body);
assert.equal(users.size,1);
assert.equal(rows.get('learnerNumbers/001234567890').uid,result.uid);
assert.equal(rows.get('usernames/cruz.ana').uid,result.uid);
const profile=rows.get(`users/${result.uid}`);
assert.equal(profile.role,'student');assert.equal(profile.createdBy,'admin');assert.equal(profile.email,'');
assert.equal(profile.password,undefined);assert.equal(result.password,undefined);
assert.match(users.get(result.uid).email,/@students\.basaya\.invalid$/);
await assert.rejects(createStudentAccount(firestore,auth,'admin',body),e=>e.status===409);
await assert.rejects(createStudentAccount(firestore,auth,'admin',{...body,username:'another'}),e=>e.status===409);
assert.equal(users.size,1);assert.equal(deleted,2);
assert.equal(rows.has('usernames/cruz.ana2'),false);
failTransaction=true;
await assert.rejects(createStudentAccount(firestore,auth,'admin',{...body,username:'new_user',lrn:'999999999999'}));
assert.equal(users.size,1);assert.equal(rows.has('usernames/cruz.ana2'),false);
failTransaction=false;
const duplicate=await createStudentAccount(firestore,auth,'admin',{...body,lrn:'555555555555'});
assert.equal(duplicate.username,'cruz.ana2');
assert.equal(rows.get('usernames/cruz.ana2').uid,duplicate.uid);
console.log('PASS: LRN and generated username validation, leading zeros, private credentials, atomic identifier reservations, duplicate rejection and Auth rollback.');

let created=0, limited=false;
const context=vm.createContext({console});
const dependencies={
  '../lib/firebase.js':{db:()=>firestore,adminAuth:()=>auth},
  '../lib/http.js':{ID_PATTERN:/^[A-Za-z0-9_-]{1,128}$/,allowCors:()=>{},requireUser:async(req,res)=>{if(req.headers.authorization)return req.headers.authorization;res.status(401).json({error:'Not signed in'});return null;},requireAdmin:async(uid,res)=>{if(uid==='admin')return true;res.status(403).json({error:'Only an admin can do this'});return false;}},
  '../lib/rateLimit.js':{withinRateLimit:async()=>!limited},
  '../lib/studentAccounts.js':{createStudentAccount:async()=>{created++;return {uid:'new-student'};},assignStudentLrn:async(_db,_admin,studentId,lrn)=>({studentId,lrn})},
  '../lib/studentAccess.js':{changeStudentAccess:async(_db,_auth,studentId,disabled)=>{if(studentId==='teacher')throw Object.assign(Error('Student account not found.'),{status:404});return {studentId,ok:true,disabled};}},
};
const handler=new vm.SourceTextModule(await readFile(new URL('../notify-api/handlers/student-accounts.js',import.meta.url),'utf8'),{context});
await handler.link(specifier=>{
  const values=dependencies[specifier];
  return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});
});
await handler.evaluate();
async function request(authorization,method='POST',requestBody=body) {
  const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}};
  await handler.namespace.default({method,headers:{authorization},body:requestBody},res);return res;
}
assert.equal((await request()).code,401);
assert.equal((await request('student')).code,403);
assert.equal((await request('teacher')).code,403);
assert.equal(created,0);
assert.equal((await request('admin','GET')).code,405);
limited=true;assert.equal((await request('admin')).code,429);assert.equal(created,0);
limited=false;const accepted=await request('admin');assert.equal(accepted.code,201);assert.equal(created,1);
assert.equal(accepted.headers['Cache-Control'],'no-store');
console.log('PASS: creation endpoint rejects anonymous users, students and teachers; only admins can create accounts; rate limits and private responses enforced.');

for(const role of [undefined,'student','teacher']) assert.ok([401,403].includes((await request(role,'POST',{action:'deactivate',studentIds:['s1']})).code));
for(const ids of [[],['s1','s1'],['../other'],Array.from({length:51},(_,i)=>`s${i}`)]) assert.equal((await request('admin','POST',{action:'deactivate',studentIds:ids})).code,400);
const partial=await request('admin','POST',{action:'deactivate',studentIds:['s1','teacher','s2']});
assert.equal(partial.code,200);assert.equal(partial.body.results.filter(result=>result.ok).length,2);assert.equal(partial.body.results[1].ok,false);
assert.equal((await request('admin','POST',{action:'reactivate',studentIds:['s1']})).body.results[0].disabled,false);
assert.equal((await request('admin','POST',{action:'delete',studentIds:['s1']})).code,400);
for (const role of [undefined, 'student', 'teacher']) assert.ok([401,403].includes((await request(role,'POST',{action:'assign-lrn',studentId:'s1',lrn:body.lrn})).code));
assert.equal((await request('admin','POST',{action:'assign-lrn',studentId:'../other',lrn:body.lrn})).code,400);
limited=true;
assert.equal((await request('admin','POST',{action:'assign-lrn',studentId:'s1',lrn:body.lrn})).code,429);
limited=false;
assert.equal((await request('admin','POST',{action:'assign-lrn',studentId:'s1',lrn:body.lrn})).body.lrn,body.lrn);

const lrnRows = new Map([
  ['users/legacy',{role:'student',username:'legacy_student',classId:'class1',progress:92}],
  ['usernames/legacy_student',{uid:'legacy'}],
  ['users/other',{role:'student',lrn:'999999999999'}],
  ['users/teacher',{role:'teacher'}],
]);
const lrnDb = {
  doc: path => ({path}),
  collection: name => ({where:(field,op,value)=>({name,field,value})}),
  runTransaction: async run => {
    const writes=[];
    const result=await run({
      get:async ref => ref.path ? {exists:lrnRows.has(ref.path), get:key=>lrnRows.get(ref.path)?.[key]} :
        {docs:[...lrnRows].filter(([path,value])=>path.startsWith(ref.name+'/')&&value[ref.field]===ref.value).map(([path])=>({id:path.split('/')[1]}))},
      set:(ref,value)=>writes.push(()=>lrnRows.set(ref.path,value)),
      update:(ref,value)=>writes.push(()=>lrnRows.set(ref.path,{...lrnRows.get(ref.path),...value})),
    });
    writes.forEach(write=>write()); return result;
  },
};
for (const lrn of ['123', '12345678901a', 123456789012, '']) await assert.rejects(assignStudentLrn(lrnDb,'admin','legacy',lrn),e=>e.status===400);
for (const id of ['missing','teacher']) await assert.rejects(assignStudentLrn(lrnDb,'admin',id,body.lrn),e=>e.status===404);
await assert.rejects(assignStudentLrn(lrnDb,'admin','legacy','999999999999'),e=>e.status===409);
lrnRows.set('learnerNumbers/888888888888',{uid:'other'});
await assert.rejects(assignStudentLrn(lrnDb,'admin','legacy','888888888888'),e=>e.status===409);
lrnRows.set('usernames/777777777777',{uid:'other'});
await assert.rejects(assignStudentLrn(lrnDb,'admin','legacy','777777777777'),e=>e.status===409);
assert.equal(lrnRows.get('users/legacy').lrn,undefined);
await assignStudentLrn(lrnDb,'admin','legacy',body.lrn);
assert.deepEqual(lrnRows.get('learnerNumbers/'+body.lrn),{uid:'legacy'});
assert.equal(lrnRows.get('users/legacy').lrn,body.lrn);
assert.equal(lrnRows.get('users/legacy').username,'legacy_student');
assert.equal(lrnRows.get('usernames/legacy_student').uid,'legacy');
assert.equal(lrnRows.get('users/legacy').progress,92);
assert.equal(lrnRows.get('users/legacy').classId,'class1');
assert.equal(lrnRows.get('users/legacy').lrnAssignedBy,'admin');
await assignStudentLrn(lrnDb,'admin','legacy',body.lrn);
await assert.rejects(assignStudentLrn(lrnDb,'admin','legacy','666666666666'),e=>e.status===409);
assert.equal(lrnRows.has('learnerNumbers/666666666666'),false);
console.log('PASS: admin-only LRN assignment, validation, duplicate and legacy collision rejection, retry safety, preserved username and learning records.');

const accessRows=new Map([['users/s1',{role:'student',classId:'class1',skillSummary:{score:92}}],['users/t1',{role:'teacher'}],['classes/class1/students/s1',{fullName:'Student'}],['users/s1/assignedLessons/lesson',{score:92}]]);
const accessUsers=new Map([['s1',{uid:'s1',disabled:false}]]);const revoked=[];let writeFails=false;
const accessDb={doc:path=>({path,get:async()=>({get:key=>accessRows.get(path)?.[key]}),update:async data=>{if(writeFails)throw Error('Write failed');accessRows.set(path,{...accessRows.get(path),...data});}})};
accessDb.runTransaction=async run=>{const writes=[];const result=await run({get:ref=>ref.get(),update:(ref,data)=>writes.push({ref,data})});if(writeFails)throw Error('Write failed');for(const {ref,data}of writes)await ref.update(data);return result;};
const accessAuth={getUser:async uid=>accessUsers.get(uid),updateUser:async(uid,data)=>{accessUsers.set(uid,{...accessUsers.get(uid),...data});},revokeRefreshTokens:async uid=>revoked.push(uid)};
await changeStudentAccess(accessDb,accessAuth,'s1',true);
assert.equal(accessRows.get('users/s1').inactivePeriods.length,1);
assert.equal(accessRows.get('users/s1').inactivePeriods[0].end,null);
assert.equal(accessUsers.get('s1').disabled,true);assert.equal(accessRows.get('users/s1').disabled,true);assert.deepEqual(revoked,['s1']);
assert.equal(accessRows.get('users/s1').classId,'class1');assert.equal(accessRows.get('users/s1/assignedLessons/lesson').score,92);assert.equal(accessRows.get('classes/class1/students/s1').fullName,'Student');
await changeStudentAccess(accessDb,accessAuth,'s1',false);assert.equal(accessUsers.get('s1').disabled,false);assert.equal(accessRows.get('users/s1').disabled,false);
assert.ok(accessRows.get('users/s1').inactivePeriods[0].end>=accessRows.get('users/s1').inactivePeriods[0].start);
writeFails=true;await assert.rejects(changeStudentAccess(accessDb,accessAuth,'s1',true));assert.equal(accessUsers.get('s1').disabled,false);
await assert.rejects(changeStudentAccess(accessDb,accessAuth,'t1',true),e=>e.status===404);
console.log('PASS: admin-only bulk access changes, bounded and unique IDs, partial failures, Auth rollback, session revocation, and preserved rosters and progress.');
