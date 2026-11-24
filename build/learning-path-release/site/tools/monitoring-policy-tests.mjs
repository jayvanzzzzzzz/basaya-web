import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as scoring from '../js/scoring.js';
import * as deadlines from '../js/deadline-policy.js';
const context=vm.createContext({Date,console});
let docs=[];
const dependencies={
 'firebase-firestore.js':{collection:()=>({}),doc:()=>({}),getDoc:async()=>({data:()=>({})}),getDocs:async()=>({docs:docs.map(data=>({id:data.id,data:()=>data}))})},
 '../../js/firebase.js':{db:{}},'../../js/skippedParts.js':{skippedParts:async()=>({})},'../../js/lessonItems.js':{lessonItems:async()=>({items:{}})},
 '../../js/state.js':{state:{allLessons:[]},getAllLessons:async()=>{}},'../../js/scoring.js':scoring,'../../js/deadline-policy.js':deadlines,
};
const module=new vm.SourceTextModule(await readFile(new URL('../teacher/views/progressData.js',import.meta.url),'utf8'),{context});
await module.link(name=>{const exports=name.includes('firebase-firestore.js')?dependencies['firebase-firestore.js']:dependencies[name];assert.ok(exports,name);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});});
await module.evaluate();
const {loadStudentProgress,classReport,completionOf,studentRemarks}=module.namespace;
const due=Date.now()-1000,lesson={id:'lesson',dueAt:due,items:{pagsusulit:10}};
let progress=await loadStudentProgress('student',[lesson],null,{accountProfile:{role:'student',disabled:false,inactivePeriods:[{start:due-1000,end:due+500}]}});
assert.equal(progress.perLesson[0].status,'exempt');assert.equal(progress.summary.skills.pagsusulit.score,null);assert.equal(completionOf(progress).total,0);
const noExemption=await loadStudentProgress('student',[lesson],null,{accountProfile:{role:'student',disabled:false}});
assert.equal(noExemption.summary.skills.pagsusulit.score,0);
docs=[{id:'lesson',quizFinished:true,quizScore:10,quizTotal:10}];
const active=await loadStudentProgress('student',[lesson],null,{accountProfile:{role:'student',disabled:false}});
docs=[{id:'lesson',quizFinished:true,quizScore:0,quizTotal:10}];
const inactive=await loadStudentProgress('student',[lesson],null,{accountProfile:{role:'student',disabled:true,inactivePeriods:[{start:due-1000,end:null}]}});
const report=classReport([{student:{id:'active'},progress:active},{student:{id:'inactive'},progress:inactive}]);
assert.equal(report.skills.find(skill=>skill.key==='pagsusulit').average,100,'Deactivated zero excluded from mean and denominator');
assert.equal(report.readableStudents,1);assert.equal(studentRemarks(inactive)[0].title,'Monitoring paused');
assert.equal(inactive.summary.skills.pagsusulit.score,0,'Actual saved historical result remains preserved');
console.log('PASS reporting: exempt unfinished work is not zero, exempt lessons leave completion totals, deactivated students leave averages and alerts, historical results remain readable.');
