import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { assignLearningPath, scheduleLearningPath } from '../notify-api/lib/learningPaths.js';
import { assessmentOperation } from '../notify-api/lib/assessments.js';
import { archiveClassContent } from '../notify-api/lib/classContentArchive.js';
import { withPathPrerequisites, pathBlocker, orderedPathAssignments, openingDay, sequenceBlocker, canOpenPathLesson } from '../js/learningPathSequence.js';
import { startFirestoreTestServer } from './firestore-test-server.mjs';
assert.equal((await readFile(new URL('../js/learningPathSequence.js',import.meta.url),'utf8')).replace(/^\uFEFF/,''),await readFile(new URL('../notify-api/lib/learningPathSequence.js',import.meta.url),'utf8'));
const first={id:'a',order:1,learningPathAssignmentId:'one',learningPathTitle:'Tekstong Multimodal',lectureFinished:true,gameSkipped:true,activitySkipped:true,pronunciationSkipped:true,quizFinished:false};
const second={id:'b',order:2,learningPathAssignmentId:'two',learningPathTitle:'Susi sa Pag-unawa'};
let lessons=withPathPrerequisites([first,second]);
assert.equal(pathBlocker(lessons[1],lessons).title,'Tekstong Multimodal');
lessons[0].quizFinished=true;assert.equal(pathBlocker(lessons[1],lessons),null);
assert.ok(pathBlocker(lessons[1],[lessons[1]]),'Missing offline prerequisite fails closed');
assert.equal(pathBlocker(withPathPrerequisites([{...first,practice:true},second])[1],[]),null,'Practice does not block progression');
assert.equal(openingDay(Date.parse('2026-11-25T16:00:00Z')),'2026-11-26');
const within = withPathPrerequisites([
 { ...first, id:'within-a', moduleId:'one', moduleTitle:'Mga Salita', order:1 },
 { ...first, id:'within-b', moduleId:'one', moduleTitle:'Mga Salita', order:2 },
 { ...first, id:'within-c', moduleId:'two', moduleTitle:'Mga Kuwento', order:3 },
]);
assert.equal(canOpenPathLesson(within[1],within),false,'Next lesson waits for completion');
assert.equal(sequenceBlocker(within[2],within).kind,'module','Next module waits for every previous lesson');
assert.equal(canOpenPathLesson(within[1],[within[1]]),false,'Missing offline lesson prerequisite fails closed');
within[0].quizFinished=true;assert.equal(canOpenPathLesson(within[1],within),true);
within[1].quizFinished=true;assert.equal(canOpenPathLesson(within[2],within),true);
const emulator=await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST=emulator.host;
const require=createRequire(new URL('../notify-api/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const app=initializeApp({projectId:emulator.project}),db=getFirestore(app);
const day=offset=>{const date=new Date();date.setUTCHours(4,0,0,0);date.setUTCDate(date.getUTCDate()+offset);return date.getTime();};
const denied=async(fn,pattern)=>assert.rejects(fn,error=>error.status>=400&&(!pattern||pattern.test(error.message)));
const assign=(path,offset,extra={})=>assignLearningPath(db,'teacher',{pathId:path,revision:1,classId:'class',moduleIds:[path],mode:'assessment',openAt:day(offset),dueAt:day(20),requestKey:crypto.randomUUID(),...extra});
const op=(lesson,operation='content',extra={})=>assessmentOperation(db,'student',{classId:'class',progressSession:'',lessonId:lesson,operation,...extra});
try {
 for(const [path,data] of [
  ['users/teacher',{role:'teacher'}],['users/student',{role:'student',classId:'class',progressSession:''}],
  ['classes/class',{teacherId:'teacher'}],['classes/class/students/student',{joinedAt:Timestamp.fromMillis(day(-10))}],
 ])await db.doc(path).set(data);
 for(const id of ['a','b','c','d','e','f']) {
  await db.doc('lessons/'+id).set({title:id,teacherId:'teacher',visibility:'shared'});
  await db.doc('modules/'+id).set({title:'Module '+id,ownerId:'teacher',visibility:'shared',revision:1,lessonIds:[id]});
  await db.doc('learningPaths/'+id).set({title:id==='a'?'Tekstong Multimodal':'Susi '+id,ownerId:'teacher',visibility:'shared',revision:1,moduleIds:[id]});
  for(const part of ['activity','pronunciation','quiz'])await db.doc('lessons/'+id+'/'+part+'/status').set({completion:'skipped'});
 }
 const a=await assign('a',-3);
 for(const openAt of [day(-4),day(-3),day(-3)+3600000])await denied(()=>assign('b',-2,{openAt}),/later calendar day/);
 const request={requestKey:crypto.randomUUID()};
 const b=await assign('b',-2,request);assert.equal((await assign('b',-2,request)).id,b.id);
 assert.deepEqual(orderedPathAssignments((await db.collection('classes/class/learningPaths').get()).docs.map(d=>({id:d.id,...d.data()}))).map(p=>p.pathId),['a','b']);
 await denied(()=>op('b'),/Finish Tekstong Multimodal/);
 await denied(()=>op('b','begin',{part:'quiz'}),/Finish Tekstong Multimodal/);
 // Metadata remains available for progress rendering while access is locked.
 await op('b','metadata');await assessmentOperation(db,'student',{classId:'class',progressSession:'',operation:'metadata-list'});
 await db.doc('users/student/assignedLessons/a').set({lectureFinished:true});
 await op('b'); // All other parts of a are skipped.
 const c=await assign('c',-1);
 await denied(()=>op('c'),/Finish Susi b/);
 await db.doc('lessons/b/pronunciation/status').delete();
 await db.doc('users/student/assignedLessons/b').set({lectureFinished:true,pronunciationReviewStatus:'pending'});
 await denied(()=>op('c'),/Finish Susi b/);
 await db.doc('users/student/assignedLessons/b').update({pronunciationFinished:true});await op('c');
 await denied(()=>scheduleLearningPath(db,'teacher',{classId:'class',assignmentId:b.id,openAt:day(-3),dueAt:day(20)}),/later calendar day/);
 await denied(()=>scheduleLearningPath(db,'teacher',{classId:'class',assignmentId:b.id,openAt:day(-1),dueAt:day(20)}),/earlier calendar day/);
 await scheduleLearningPath(db,'teacher',{classId:'class',assignmentId:b.id,openAt:day(-2)+3600000,dueAt:day(20)});
 assert.equal((await db.doc('classes/class/classLessons/b').get()).get('openAt').toMillis(),day(-2)+3600000);
 // Completion is necessary even if all schedules are already open. Opening time is also necessary.
 await db.doc('users/student/assignedLessons/c').set({lectureFinished:true});
 const d=await assign('d',2);await denied(()=>op('d'),/not opened yet/);
 // Archiving a prerequisite removes its gate without deleting progress, then restores its position.
 await db.doc('users/student/assignedLessons/a').delete();
 await denied(()=>op('c'),/Tekstong Multimodal/);
 await archiveClassContent(db,'teacher',{classId:'class',assignmentId:a.id,action:'archive-class-content'});await op('c');
 await archiveClassContent(db,'teacher',{classId:'class',assignmentId:a.id,action:'restore-class-path'});
 await denied(()=>op('c'),/Tekstong Multimodal/);
 const concurrent = await Promise.allSettled([assign('e',3), assign('f',3)]);
 assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(concurrent.filter(result=>result.status==='rejected' && /later calendar day/.test(result.reason.message)).length,1);
 // Direct writes cannot forge the sequence or its effective opening date.
 const response=await fetch(emulator.documents+'/classes/class/classLessons/b?updateMask.fieldPaths=sequenceOpenAt',{method:'PATCH',headers:{Authorization:'Bearer '+emulator.token('teacher'),'Content-Type':'application/json'},body:JSON.stringify({fields:{sequenceOpenAt:{timestampValue:new Date().toISOString()}}})});
 assert.equal(response.status,403);
 // One path with multiple lessons and modules: direct content requests must obey the hierarchy.
 await db.doc('users/hierarchyStudent').set({role:'student',classId:'hierarchyClass',progressSession:''});
 await db.doc('classes/hierarchyClass').set({teacherId:'teacher'});
 await db.doc('classes/hierarchyClass/students/hierarchyStudent').set({joinedAt:Timestamp.fromMillis(day(-10))});
 for(const [index,lessonId] of ['a','b','c'].entries()) await db.doc('classes/hierarchyClass/classLessons/'+lessonId).set({
  lessonId,mode:'assessment',order:index+1,learningPathAssignmentId:'hierarchy',learningPathTitle:'Pag-unawa',learningPathOrder:1,
  moduleId:index<2?'words':'stories',moduleTitle:index<2?'Mga Salita':'Mga Kuwento',learningPathModuleOrder:index<2?1:2,
  openAt:Timestamp.fromMillis(day(-3)),dueAt:Timestamp.fromMillis(day(20)),
 });
 const hierarchical=lessonId=>assessmentOperation(db,'hierarchyStudent',{classId:'hierarchyClass',progressSession:'',lessonId,operation:'content'});
 await hierarchical('a');await denied(()=>hierarchical('b'),/Finish Mga Salita/);await denied(()=>hierarchical('c'),/Finish Mga Salita/);
 await db.doc('users/hierarchyStudent/assignedLessons/a').set({lectureFinished:true});
 await hierarchical('b');await denied(()=>hierarchical('c'),/Finish Mga Salita/);
 await db.doc('users/hierarchyStudent/assignedLessons/b').set({lectureFinished:true,pronunciationFinished:true});await hierarchical('c');
 console.log('PASS: shared frontend/API policy; path, module and lesson completion gates; missing offline prerequisites; skipped sections and pending review; schedules; API bypass rejection; archive/restore and protected metadata.');
} finally {await db.terminate();await deleteApp(app);await emulator.stop();}
