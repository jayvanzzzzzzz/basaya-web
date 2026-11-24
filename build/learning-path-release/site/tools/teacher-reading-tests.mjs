import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setImmediate as flush } from 'node:timers/promises';
const require=createRequire(new URL('../notify-api/package.json',import.meta.url));
const {parseHTML}=require('linkedom');
const {window,document}=parseHTML('<html><body><div id="page-header"></div><main id="page-content"><section id="old-class">Old class page</section></main></body></html>');
const $=selector=>document.querySelector(selector);
Object.defineProperty(document,'visibilityState',{value:'visible',writable:true});
const timers=new Map();let timerId=0;
const context=vm.createContext({console,window,document,AbortSignal,MutationObserver:window.MutationObserver,setInterval:fn=>{timers.set(++timerId,fn);return timerId},clearInterval:id=>timers.delete(id),FormData:class{
  constructor(form){this.values=[...form.querySelectorAll('[name]')].map(field=>[field.name,field.value])}
  [Symbol.iterator](){return this.values[Symbol.iterator]()}
}});
const module=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[key,value]of Object.entries(exports))this.setExport(key,value)},{context});
const load=async(file,link)=>{const mod=new vm.SourceTextModule(await readFile(new URL(`../${file}`,import.meta.url),'utf8'),{context});await mod.link(link);await mod.evaluate();return mod.namespace};
const latest=await load('js/readingSubmissions.js',()=>{});
const latestModule=module({latestReadingSubmissions:latest.latestReadingSubmissions});
const pagination=await load('js/pagination.js',()=>{});
const paginationModule=module({paginate:pagination.paginate});
window.location={hash:''};
window.confirm=()=>false;
let readAt=100, submissions=[{id:'reading-a',uid:'a',status:'submitted'},{id:'old-reading',uid:'departed',status:'submitted'}], notices=[];
const state={user:{uid:'teacher'}};
const watchers=[];
const firestore=module({collection:(_db,...parts)=>({path:parts.join('/')}),query:(ref,...constraints)=>({...ref,constraints}),where:(...args)=>args,limit:value=>({limit:value}),Timestamp:{fromMillis:value=>value},onSnapshot:(ref,next,error)=>{const watcher={ref,next,error,stopped:false};watchers.push(watcher);return()=>watcher.stopped=true}});
const service=module({postToApi:async()=>({submissions})});
const notifications=await load('teacher/views/studentNotifications.js',name=>name.endsWith('readingSubmissions.js')?latestModule:name.startsWith('https:')?firestore:name.endsWith('firebase.js')?module({db:{}}):name.endsWith('state.js')?module({state}):name.includes('chat.js')?module({lastRead:()=>readAt}):service);
const now=1800000000000, hour=3600000;
const summary=notifications.readingGradingSummary([
  {status:'submitted',lessonId:'soon'}, {status:'submitted',lessonId:'edge'},
  {status:'submitted',lessonId:'later'}, {status:'submitted',lessonId:'past'},
  {status:'graded',lessonId:'soon'}, {status:'draft',lessonId:'soon'},
  {status:'submitted',lessonId:'none'}, {status:'submitted',lessonId:'practice'},
], [
  {lessonId:'soon',dueAt:{toMillis:()=>now+hour}},
  {lessonId:'soon',dueAt:{toMillis:()=>now+hour}},
  {id:'edge',dueAt:now+24*hour}, {lessonId:'later',dueAt:now+24*hour+1},
  {lessonId:'past',dueAt:now}, {lessonId:'practice',mode:'practice',dueAt:now+hour},
],now);
assert.deepEqual(JSON.parse(JSON.stringify(summary)),{total:6,dueSoon:2},'Only submitted readings count; the 24-hour window excludes overdue, practice and unscheduled lessons and counts each submission once');
const students=[{id:'a'},{id:'b'}];
const stop=notifications.watchStudentNotifications('class',notice=>notices.push(notice),students);
await flush();
let current=()=>notices.at(-1);
assert.equal(current().byStudent.get('a').readings,true);
assert.equal(current().byStudent.has('departed'),false,'Only enrolled students receive roster dots');
const watcher=path=>watchers.filter(item=>item.ref.path.endsWith(path)&&!item.stopped).at(-1);
const snapshot=rows=>({empty:!rows.length,docs:rows.map((row,i)=>({id:row.id||String(i),data:()=>row}))});
watcher('/messages').next(snapshot([
  {senderId:'a',role:'student',sentAt:200},
  {senderId:'b',role:'student',sentAt:50},
  {senderId:'b',role:'teacher',sentAt:300},
  {senderId:'b',role:'student',kind:'join',sentAt:300},
  {senderId:'b',role:'student',deleted:true,sentAt:300},
]));
assert.equal(current().byStudent.get('a').messages,true);assert.equal(current().byStudent.get('b').messages,false);
readAt=500;window.dispatchEvent(new window.Event('focus'));await flush();
assert.equal(watcher('/messages').ref.constraints[0][2],500,'Message query follows the teacher read marker');
watcher('/messages').next(snapshot([{senderId:'a',role:'student',sentAt:200},{senderId:'b',role:'student',sentAt:600}]));
assert.equal(current().byStudent.get('a').messages,false);assert.equal(current().byStudent.get('a').readings,true,'Reading dot remains after messages are read');
submissions=[{id:'reading-a',uid:'a',status:'graded'}];await [...timers.values()][0]();
assert.deepEqual([...current().byStudent.get('a').labels],[],'Grading clears the recording notification');
watcher('/students').next(snapshot([{id:'a'},{id:'b',leaveRequest:{requestedAt:1}}]));
assert.equal(current().byStudent.get('b').leave,true);
watcher('/joinRequests').next(snapshot([{id:'new-student'}]));assert.equal(current().joins,true);
const count=notices.length;stop();assert.equal(timers.size,0);assert.ok(watchers.every(item=>item.stopped));
watchers[0].next(snapshot([{id:'late'}]));assert.equal(notices.length,count,'Old class snapshots cannot update a new screen');

let tooltipStops=0;
const actions=await load('teacher/views/classActions.js',()=>module({attachFloatingTooltips:()=>()=>tooltipStops++}));
const actionDocument=parseHTML(`<div>${actions.addLessonAction('add')}${actions.reviewReadingsAction('class/id')}</div>`).document;
assert.equal(actionDocument.querySelector('button').textContent,'');
assert.equal(actionDocument.querySelector('button').getAttribute('aria-label'),'Add lesson');
assert.equal(actionDocument.querySelector('a').getAttribute('href'),'#/classes/class%2Fid/readings');
assert.equal(actionDocument.querySelector('a').textContent,'');
actions.watchTeacherTooltips();actions.leaveTeacherTooltips();assert.equal(tooltipStops,1);

document.body.insertAdjacentHTML('beforeend', `<button id="view-students"><span data-student-requests-dot hidden></span></button>${actions.reviewReadingsAction('class')}<section data-grading-notice hidden><h2 data-grading-total></h2><p data-grading-deadline hidden></p><p data-grading-error hidden></p></section>`);
$('[data-grading-notice]').insertAdjacentHTML('afterbegin','<span data-grading-count hidden></span>');
let paint,stopCount=0,receivedLinks;
const badge=await load('teacher/views/studentRequestsBadge.js',()=>module({watchStudentNotifications:(_id,onChange,_students,links)=>{paint=onChange;receivedLinks=links;return()=>stopCount++}}));
const lessonLinks=[{lessonId:'soon'}];
badge.watchStudentRequestsBadge('class',0,lessonLinks);
assert.equal(receivedLinks,lessonLinks);
const notice={byStudent:new Map(),hasPending:false,grading:{total:5,dueSoon:2}};
paint(notice);
assert.equal($('[data-grading-notice]').hidden,false);
assert.equal($('[data-grading-total]').textContent,'5 readings need to be graded');
assert.equal($('[data-grading-count]').textContent,'5');
assert.equal($('[data-grading-count]').hidden,false);
assert.equal($('[data-grading-deadline]').textContent,'2 ungraded readings are due within 24 hours');
assert.equal($('[data-reading-notice-dot]').textContent,'5');
assert.match($('[data-reading-notice-dot]').parentElement.getAttribute('aria-label'),/5 need grading/);
paint({...notice,grading:{total:1,dueSoon:0}});
assert.equal($('[data-grading-total]').textContent,'1 reading needs to be graded');
assert.equal($('[data-grading-count]').textContent,'1');
assert.equal($('[data-grading-deadline]').hidden,true);
paint({...notice,grading:{total:0,dueSoon:0}});
assert.equal($('[data-grading-notice]').hidden,true);
assert.equal($('[data-grading-count]').hidden,true);
assert.equal($('[data-reading-notice-dot]').hidden,true);
paint({...notice,grading:{total:0,dueSoon:0},readingError:true});
assert.equal($('[data-grading-notice]').hidden,false);
assert.equal($('[data-grading-error]').hidden,false,'A failed count is not presented as an empty queue');
badge.leaveStudentRequestsBadge();assert.equal(stopCount,1);

let grade,played=0,failGrade=false,failPlayback=false;
window.Element.prototype.pause=function(){};
window.Element.prototype.play=async function(){played++};
window.Element.prototype.load=function(){};
const reviewService=module({postToApi:async(_path,body)=>{
  if(body.operation==='fluency-list')return{submissions:[{id:'b-record',uid:'b',name:'B student',lessonId:'other',title:'Other lesson',status:'submitted',submittedAt:100},{id:'a-old',uid:'a',name:'A student',lessonId:'lesson',title:'Old attempt',status:'submitted',submittedAt:1},{id:'a-record',uid:'a',name:'A student',lessonId:'lesson',title:'My lesson',status:grade?'graded':'submitted',submittedAt:200}]};
  if(body.operation==='fluency-play'){if(failPlayback)throw Error('Recording unavailable');return{pages:[{sentence:'May bahay.',recordingUrl:'https://private/model'}]};}
  if(failGrade)throw Error('Could not save grade');
  grade=body;return{};
}});
const review=await load('teacher/views/fluencyReview.js',name=>name.endsWith('pagination.js')?paginationModule:name.endsWith('floatingTooltip.js')?module({attachFloatingTooltips:()=>()=>{}}):name.endsWith('readingSubmissions.js')?latestModule:name.endsWith('readingRoster.js')?module({readingLessonTitles:async()=>({lesson:'My lesson',other:'Other lesson'}),readingRoster:async()=>({className:'Grade 4',students:[{uid:'a',name:'A student'},{uid:'b',name:'B student'},{uid:'c',name:'No submissions'}]})}):name.endsWith('helpers.js')?module({$,escapeHtml:value=>String(value),page:(title,subtitle)=>{$('#page-header').textContent=title+' '+subtitle}}):reviewService);
const titleReads=[];
const titleRoster=await load('teacher/views/readingRoster.js',name=>name.startsWith('https:')?module({collection:()=>{},getDocs:async()=>({docs:[]}),doc:(_db,...parts)=>parts.join('/'),getDoc:async path=>{titleReads.push(path);if(path==='lessons/unavailable')throw Error('Unavailable');return{data:()=>path==='lessons/actual'?{title:'Mga Idyoma'}:{}};}}):module({db:{}}));
const exactTitles=await titleRoster.readingLessonTitles(['actual','actual','missing','unavailable','bad/path']);
assert.deepEqual(JSON.parse(JSON.stringify(exactTitles)),{actual:'Mga Idyoma'});
assert.deepEqual(titleReads.sort(),['lessons/actual','lessons/missing','lessons/unavailable']);
await review.renderFluencyReview('class');
assert.equal(document.querySelectorAll('.reading-row').length,3,'All enrolled students appear, including those without submissions');
assert.equal($('#reading-grade'),null,'The student directory never opens grading automatically');
assert.match(document.querySelector('.reading-row').textContent,/1 lesson to review/,'Only the newest attempt counts');
await review.renderFluencyReview('class','a');
assert.equal($('#old-class'),null,'Review replaces the old class page rather than appending below it');
assert.equal(document.querySelectorAll('#reading-review').length,1);
assert.match($('#page-header').textContent,/A student Grade 4/);assert.doesNotMatch($('#reading-review').textContent,/B student|Old attempt/);
assert.equal(document.querySelectorAll('.reading-row').length,1,'Student lessons exclude duplicate attempts');
await flush();assert.match($('#reading-review').textContent,/1 recording/);
assert.equal($('#reading-grade'),null);
await review.renderFluencyReview('class','a','a-old');
assert.match($('#reading-review').textContent,/Submission unavailable/,'A direct link cannot reopen an older attempt');
await review.renderFluencyReview('class','a','b-record');
assert.match($('#reading-review').textContent,/Submission unavailable/,'A lesson route cannot open another student’s attempt');
failPlayback=true;
await review.renderFluencyReview('class','a','a-record');
assert.match($('#reading-review').textContent,/Recording unavailable/);
failPlayback=false;
await $('#reading-review button').onclick();
assert.ok($('#reading-grade'),'Recording failures can be retried');
await review.renderFluencyReview('class','a','a-record');
assert.equal(document.querySelector('audio').getAttribute('preload'),'metadata','Read duration metadata before Play');
assert.match($('[data-recording-state]').textContent,/Loading recording/);
const recording=document.querySelector('audio');
Object.defineProperty(recording,'duration',{value:17,configurable:true});
recording.dispatchEvent(new window.Event('loadedmetadata'));
assert.equal($('[data-recording-state]').textContent,'');
assert.equal($('.reading-audio-state').hidden,true,'Ready recordings show only the native player');
recording.dispatchEvent(new window.Event('error'));
assert.equal($('.reading-audio-state').hidden,false,'Playback errors and retry remain visible');
assert.equal($('[data-recording-retry]').hidden,false);
assert.match($('[data-recording-state]').textContent,/could not load/);
await $('[data-recording-retry]').onclick();
assert.equal($('[data-recording-retry]').hidden,true);
assert.equal(recording.src,'https://private/model');
recording.dispatchEvent(new window.Event('loadedmetadata'));
assert.equal($('[data-recording-state]').textContent,'');
$('[data-review-play-all]').onclick();await flush();assert.equal(played,1);
for(const select of document.querySelectorAll('#reading-grade select'))select.querySelector('[value="3"]').setAttribute('selected','');
failGrade=true;
await $('#reading-grade').onsubmit({preventDefault(){},submitter:null,currentTarget:$('#reading-grade')});
assert.match($('#reading-review-error').textContent,/Could not save grade/);
assert.equal($('#reading-grade [type="submit"]').disabled,false,'Save can be retried');
failGrade=false;
await $('#reading-grade').onsubmit({preventDefault(){},submitter:null,currentTarget:$('#reading-grade')});
assert.equal(grade.operation,'fluency-grade');assert.equal(grade.submissionId,'a-record');
assert.deepEqual(JSON.parse(JSON.stringify(grade.grade)),{accuracy:3,smoothness:3,expression:3});
assert.equal(window.location.hash,'#/classes/class/readings/a','Saving returns to the student lesson route');
await review.renderFluencyReview('class','a');
assert.match($('#reading-review').textContent,/Reviewed/);
await review.renderFluencyReview('class');
assert.equal([...document.querySelectorAll('.reading-row')].some(row=>row.textContent.includes('A student')),true,'A graded student stays visible in the roster');
const reviewNow=1800000000000, window48=48*3600000;
assert.equal(review.lessonReviewState(false,reviewNow+window48,reviewNow).label,'Due soon');
assert.equal(review.lessonReviewState(false,reviewNow+window48+1,reviewNow).label,'Upcoming');
assert.equal(review.lessonReviewState(false,reviewNow-1,reviewNow).label,'Overdue');
assert.equal(review.lessonReviewState(false,null,reviewNow).label,'No deadline');
assert.equal(review.lessonReviewState(true,reviewNow-1,reviewNow).label,'Reviewed');
const queueReaders=['far','edge','overdue','unscheduled','mixed','cleared'].map(uid=>({uid,name:uid}));
const queueRows=queueReaders.map(({uid})=>({uid,lessonId:uid,status:uid==='cleared'?'graded':'submitted'}));
queueRows.push({uid:'mixed',lessonId:'edge',status:'submitted'},{uid:'far',lessonId:'overdue',status:'graded'});
const queueLinks=[{id:'far',dueAt:{toMillis:()=>reviewNow+window48+1}},{id:'far__practice',lessonId:'far',mode:'practice',dueAt:reviewNow+1},{id:'edge',dueAt:reviewNow+window48},{id:'overdue',dueAt:reviewNow-1},{id:'mixed',dueAt:reviewNow+72*3600000}];
const deadlineQueue=review.readingReviewQueue(queueReaders,queueRows,queueLinks,reviewNow);
assert.deepEqual([...deadlineQueue].map(row=>row.uid),['cleared','edge','far','mixed','overdue','unscheduled']);
assert.equal(deadlineQueue.find(row=>row.uid==='far').urgent,false,'Beyond 48 hours stays orange; graded lessons do not affect urgency');
assert.equal(deadlineQueue.find(row=>row.uid==='edge').urgent,true,'Exactly 48 hours is red');
assert.equal(deadlineQueue.find(row=>row.uid==='overdue').urgent,true,'Overdue readings remain red');
assert.equal(deadlineQueue.find(row=>row.uid==='mixed').urgent,true,'Any pending lesson within 48 hours makes the student urgent');
assert.equal(deadlineQueue.find(row=>row.uid==='unscheduled').urgent,false,'Missing deadlines are not invented');
assert.equal(review.readingReviewQueue(queueReaders,queueRows,queueLinks,reviewNow+60000).find(row=>row.uid==='far').urgent,true,'A pending reading becomes urgent as its deadline enters the 48-hour window');
const deduped=latest.latestReadingSubmissions([{id:'old',uid:'a',lessonId:'x',submittedAt:10,status:'submitted'},{id:'new',uid:'a',lessonId:'x',submittedAt:20,status:'graded'},{id:'other',uid:'b',lessonId:'x',submittedAt:10,status:'submitted'}]);
assert.deepEqual([...deduped].map(row=>row.id),['new','other']);
assert.equal(notifications.readingGradingSummary(deduped,[]).total,1,'Graded newest attempts suppress old pending counts');
console.log('PASS: student → newest lessons → grading, page counts, roster empty states, stale/cross-student routes, playback, save return/count updates, notifications and watcher cleanup');
