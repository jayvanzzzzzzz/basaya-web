import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createStudentAccount, studentDetails } from '../notify-api/lib/studentAccounts.js';
import { changeStudentAccess } from '../notify-api/lib/studentAccess.js';

const body = { firstName:' Ana ', middleName:'', lastName:'Cruz', lrn:'001234567890', username:' Ana_Cruz ', password:'TestPassword1' };
assert.equal(studentDetails(body).lrn,'001234567890');
assert.equal(studentDetails(body).username,'ana_cruz');
for (const values of [{lrn:'123'}, {lrn:'1234567890123'}, {lrn:'12345678901a'}, {lrn:123456789012}, {username:'001234567890'}, {username:'../other'}, {password:'short'}, {lastName:''}]) {
  assert.throws(()=>studentDetails({...body,...values}),e=>e.status===400);
}
const rows=new Map(), users=new Map();
let failTransaction=false, deleted=0;
const firestore={doc:path=>({path}),runTransaction:async run=>{
  const pending=[];
  const result=await run({get:async ref=>({exists:rows.has(ref.path)}),set:(ref,value)=>pending.push([ref.path,value])});
  if(failTransaction)throw Error('Offline');
  pending.forEach(([key,value])=>rows.set(key,value));return result;
}};
const auth={createUser:async user=>{users.set(user.uid,user);return user;},deleteUser:async uid=>{deleted++;users.delete(uid);}};
const result=await createStudentAccount(firestore,auth,'admin',body);
assert.equal(users.size,1);
assert.equal(rows.get('learnerNumbers/001234567890').uid,result.uid);
assert.equal(rows.get('usernames/ana_cruz').uid,result.uid);
const profile=rows.get(`users/${result.uid}`);
assert.equal(profile.role,'student');assert.equal(profile.createdBy,'admin');assert.equal(profile.email,'');
assert.equal(profile.password,undefined);assert.equal(result.password,undefined);
assert.match(users.get(result.uid).email,/@students\.basaya\.invalid$/);
await assert.rejects(createStudentAccount(firestore,auth,'admin',body),e=>e.status===409);
await assert.rejects(createStudentAccount(firestore,auth,'admin',{...body,username:'another'}),e=>e.status===409);
assert.equal(users.size,1);assert.equal(deleted,2);
assert.equal(rows.has('usernames/another'),false);
failTransaction=true;
await assert.rejects(createStudentAccount(firestore,auth,'admin',{...body,username:'new_user',lrn:'999999999999'}));
assert.equal(users.size,1);assert.equal(rows.has('usernames/new_user'),false);
console.log('PASS: LRN and username validation, leading zeros, private credentials, atomic identifier reservations, duplicate rejection and Auth rollback.');

let created=0, limited=false;
const context=vm.createContext({console});
const dependencies={
  '../lib/firebase.js':{db:()=>firestore,adminAuth:()=>auth},
  '../lib/http.js':{ID_PATTERN:/^[A-Za-z0-9_-]{1,128}$/,allowCors:()=>{},requireUser:async(req,res)=>{if(req.headers.authorization)return req.headers.authorization;res.status(401).json({error:'Not signed in'});return null;},requireAdmin:async(uid,res)=>{if(uid==='admin')return true;res.status(403).json({error:'Only an admin can do this'});return false;}},
  '../lib/rateLimit.js':{withinRateLimit:async()=>!limited},
  '../lib/studentAccounts.js':{createStudentAccount:async()=>{created++;return {uid:'new-student'};}},
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
