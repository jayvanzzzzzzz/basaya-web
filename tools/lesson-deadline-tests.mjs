import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {startFirestoreTestServer} from './firestore-test-server.mjs';
import {lessonDeadline,monitoringTime} from '../js/deadline-policy.js';
import {summarize,withMissed,resultsFrom} from '../js/scoring.js';
import {context as assessmentContext} from '../notify-api/lib/assessments.js';
import {changeStudentAccess} from '../notify-api/lib/studentAccess.js';

const profile={inactivePeriods:[{start:200,end:400}]};
assert.equal(lessonDeadline({id:'l',dueAt:300},{},profile).exempt,true);
assert.equal(lessonDeadline({id:'l',dueAt:500,deadlineHistory:[300]},{},profile).exempt,true,'Elapsed exemption survives later class extension');
assert.equal(lessonDeadline({id:'l',dueAt:300},{deadlineOverrides:{l:{dueAt:600,firstAssignedAt:100}}},profile).exempt,false,'A timely extension supersedes class deadline');
assert.equal(lessonDeadline({id:'l',dueAt:300},{deadlineOverrides:{l:{dueAt:600,firstAssignedAt:450,deadlineHistory:[300]}}},profile).exempt,true,'Extending after reactivation does not remove an earlier exemption');
assert.equal(monitoringTime({disabled:true,inactivePeriods:[{start:200,end:null}]},500),200);
const lessons=[{id:'l',dueAt:300,items:{pagsusulit:10},exempt:true}];
assert.equal(summarize(withMissed(resultsFrom([]),[],lessons,500)).skills.pagsusulit.score,null);
const completed=[{id:'l',quizFinished:true,quizScore:8,quizTotal:10}];
assert.equal(summarize(withMissed(resultsFrom(completed),completed,lessons,500)).skills.pagsusulit.score,80,'Completed results remain saved history');
console.log('PASS pure policy: exemptions, extension precedence, reactivation, frozen monitoring and preserved scores.');

const emulator=await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST=emulator.host;
const require=createRequire(new URL('../notify-api/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const app=initializeApp({projectId:emulator.project},'individual-deadlines'),db=getFirestore(app);
const plain=value=>value instanceof Timestamp?value:Array.isArray(value)?value.map(plain):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,plain(item)])):value;
const wrapper={doc:path=>db.doc(path),runTransaction:run=>db.runTransaction(async tx=>await run({get:ref=>tx.get(ref),update:(ref,data)=>tx.update(ref,plain(data))}))};
const scope=vm.createContext({Date,console});
const definitions={
 'firebase-admin/firestore':{Timestamp},'../lib/firebase.js':{db:()=>wrapper},
 '../lib/http.js':{ID_PATTERN:/^[A-Za-z0-9_-]{1,128}$/,allowCors:()=>{},requireUser:async(req,res)=>{if(req.headers.authorization)return req.headers.authorization;res.status(401).json({error:'Not signed in'});return null;}},
 '../lib/deadlinePolicy.js':{lessonDeadline,deadlineMillis:value=>typeof value==='number'?value:value?.toMillis?.()??null},
};
const module=new vm.SourceTextModule(await readFile(new URL('../notify-api/handlers/lesson-deadlines.js',import.meta.url),'utf8'),{context:scope});
await module.link(name=>{const exports=definitions[name];return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context:scope});});
await module.evaluate();
async function request(body,uid='teacher') {
 const result={code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){}};
 await module.namespace.default({method:'POST',headers:{authorization:uid},body},result);return result;
}
const classId='class1',entryId='lesson',now=Date.now(),future=now+86400000;
try {
 await db.doc('users/teacher').set({role:'teacher'});
 await db.doc('classes/class1').set({teacherId:'teacher'});
 await db.doc('classes/class1/classLessons/lesson').set({lessonId:'lesson',dueAt:Timestamp.fromMillis(now-1000)});
 for(const id of ['s1','s2','s3']) {
   await db.doc(`users/${id}`).set({role:'student',classId,disabled:id==='s2'});
   await db.doc(`classes/class1/students/${id}`).set({fullName:id});
 }
 const body={action:'extend-students',classId,entryId,studentIds:['s1'],dueAt:future};
 assert.equal((await request(body,null)).code,401);
 assert.equal((await request(body,'another-teacher')).code,403);
 assert.equal((await request(body,'s1')).code,403);
 assert.equal((await request({...body,studentIds:['s1','s2']})).code,409);
 assert.equal((await db.doc('classes/class1/students/s1').get()).get('deadlineOverrides'),undefined,'No partial writes for invalid selection');
 assert.equal((await request({...body,studentIds:[]})).code,400);
 const updated=await request(body);assert.equal(updated.code,200);assert.equal(updated.body.updated,1);
 assert.equal((await db.doc('classes/class1/classLessons/lesson').get()).get('dueAt').toMillis(),now-1000,'Class deadline unchanged');
 assert.equal((await db.doc('classes/class1/students/s1').get()).get('deadlineOverrides').lesson.dueAt.toMillis(),future);
 assert.equal((await db.doc('classes/class1/students/s3').get()).get('deadlineOverrides'),undefined);
 const ctx=await db.runTransaction(tx=>assessmentContext(tx,db,'s1',{classId,lessonId:'lesson',progressSession:''}));
 assert.equal(ctx.link.get('dueAt').toMillis(),future,'Submission validation uses individual extension');
 await assert.rejects(db.runTransaction(tx=>assessmentContext(tx,db,'s3',{classId,lessonId:'lesson',progressSession:''})),error=>error.status===403);
 assert.equal((await request({...body,dueAt:future-1})).code,400,'Extensions cannot shorten a personal deadline');
 await db.doc('users/s1').update({disabled:true,inactivePeriods:[{start:now-2000,end:null}],deactivatedAt:now-2000});
 assert.equal((await request({...body,dueAt:future+1000})).code,409,'Deactivated student cannot receive extension');
 const authUser={disabled:true};
 await changeStudentAccess(db,{getUser:async()=>({...authUser}),updateUser:async(_id,data)=>Object.assign(authUser,data),revokeRefreshTokens:async()=>{}},'s1',false);
 const reactivated=(await db.doc('users/s1').get()).data();
 assert.ok(reactivated.inactivePeriods[0].end>=now);
 assert.equal(lessonDeadline({id:'lesson',dueAt:now-1000},{},reactivated).exempt,true);
 const global=await request({action:'schedule',classId,entryId,openAt:null,dueAt:future+10000});
 assert.equal(global.code,200);assert.ok((await db.doc('classes/class1/classLessons/lesson').get()).get('deadlineHistory').includes(now-1000));
 assert.equal((await request({...body,studentIds:['s1','s3'],dueAt:future+20000})).body.updated,2);
 const token=emulator.token('teacher'),base=emulator.documents;
 const write=(path,fields)=>fetch(`${base}/${path}`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({fields})});
 assert.equal((await write('classes/class1/classLessons/lesson',{lessonId:{stringValue:'lesson'},dueAt:{timestampValue:new Date(future).toISOString()}})).status,403,'Client cannot bypass schedule history');
 assert.equal((await write('classes/class1/students/s1',{deadlineOverrides:{mapValue:{fields:{}}}})).status,403,'Client cannot forge individual deadlines');
 console.log('PASS real Firestore: teacher ownership, atomic selection, inactive exclusion, effective submission deadline, untouched class/other students, permanent exemption, bulk extension and protected policy fields.');
} finally {await db.terminate();await deleteApp(app);await emulator.stop();}
