// Real assignment UI and schedule validation with local Firebase/API adapters.
const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'content-archive-browser.cjs'), 'utf8');
let harness = source.slice(0, source.indexOf('(async()=>{'))
  .replace('audit/content-archive', 'audit/class-path-batch')
  .replace("'js/schedule.js',", '')
  .replace('export const serverTimestamp=', `
export const Timestamp={fromDate:date=>({toMillis:()=>date.getTime()})};
for(const n of [10,2,1]) {
 docs.set('lessons/batch'+n,{title:'Lesson '+n,teacherId:'teacher',visibility:'shared'});
 docs.set('modules/batch'+n,{title:'Module '+n,ownerId:'teacher',visibility:'shared',revision:1,lessonIds:['batch'+n]});
 docs.set('learningPaths/path'+n,{title:'Path '+n,ownerId:'teacher',visibility:'shared',revision:1,moduleIds:['batch'+n]});
}
docs.set('learningPaths/archived',{title:'Archived path',ownerId:'teacher',archived:true,moduleIds:['own']});
export const serverTimestamp=`)
  .replace("if(path!=='content-lifecycle')", `
if(body?.action==='assign-learning-path') {
 window.attempts=[...(window.attempts||[]),structuredClone(body)];
 if(window.failPath===body.pathId)throw Error('Synthetic path failure');
 window.assignments=[...(window.assignments||[]),structuredClone(body)];
 const ids=body.moduleIds.flatMap(id=>docs.get('modules/'+id).lessonIds);
 for(const id of ids)docs.set('classes/'+body.classId+'/classLessons/'+id,{lessonId:id,learningPathId:body.pathId,mode:body.mode});
 return {linkIds:ids};
}
if(path!=='content-lifecycle')`);
const run = `
(async()=>{
 await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),base='http://127.0.0.1:'+server.address().port,errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 const load=async()=>{await p.goto(base+'/fixture.html?class=1');await p.waitForFunction(()=>window.ready);};
 const open=async()=>{await p.locator('#assign-class-modules').click();};
 const confirm=async()=>{await p.locator('#add-lessons-form [type="submit"]').click();await p.locator('.action-confirmation').getByRole('button',{name:'Assign lesson paths',exact:true}).click();};
 await load();
 assert.deepEqual(await p.locator('[data-class-path]').evaluateAll(items=>items.map(item=>item.dataset.classPath)),['path1','path2','path10']);
 assert.equal(await p.locator('#class-learning-path').count(),0);
 assert.equal(await p.locator('#assign-class-modules').isDisabled(),true);
 await p.locator('[data-class-path="path10"]').check();await p.locator('[data-class-path="path2"]').check();
 assert.deepEqual(await p.locator('.class-path-module-label').allTextContents(),['Path 10','Path 2']);
 await p.locator('[data-path-move="1"][data-direction="-1"]').click();
 assert.deepEqual(await p.locator('.class-path-module-label').allTextContents(),['Path 2','Path 10']);
 await p.locator('#clear-class-path').click();assert.equal(await p.locator('[data-class-path]:checked').count(),0);
 await p.locator('#select-all-paths').click();assert.equal(await p.locator('[data-class-path]:checked').count(),3);
 for(const width of [1440,768,390,320])for(const theme of ['light','dark']){
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(350);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:path.join(out,'picker-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await open();assert.equal(await p.locator('[data-path-schedule]').count(),3);
 const d=new Date();d.setDate(d.getDate()+7);d.setHours(12,0,0,0);
 const date=(offset)=>{const v=new Date(d);v.setDate(v.getDate()+offset);const pad=n=>String(n).padStart(2,'0');return v.getFullYear()+'-'+pad(v.getMonth()+1)+'-'+pad(v.getDate())+'T12:00';};
 const dues=[date(3),date(4),date(5)];
 const opens=[date(0),date(1),date(2)];
 for(let i=0;i<3;i++)await p.locator('[data-path-schedule]').nth(i).locator('[name="openAt"]').fill(opens[i]);
 assert.equal(await p.locator('[data-path-schedule="path2"] [name="openAt"]').getAttribute('min'),date(1).slice(0,10)+'T00:00');
 await p.locator('[data-path-schedule="path2"] [name="openAt"]').fill(date(0));
 assert.equal(await p.locator('[data-path-schedule="path2"] [name="openAt"]').evaluate(input=>input.checkValidity()),false);
 await p.locator('[data-path-schedule="path2"] [name="openAt"]').fill(opens[1]);
 for(let i=0;i<3;i++)await p.locator('[data-path-schedule]').nth(i).locator('[name="dueAt"]').fill(dues[i]);
 await p.locator('[data-cancel]').click();await open();
 assert.deepEqual(await p.locator('[data-path-schedule] [name="dueAt"]').evaluateAll(items=>items.map(item=>item.value)),dues);
 // Validate dates with the real schedule reader, bypassing native validation only for this assertion.
 await p.locator('[data-path-schedule="path10"] [name="dueAt"]').fill(date(1));
 await p.evaluate(()=>document.querySelector('#add-lessons-form').noValidate=true);
 await p.locator('#add-lessons-form [type="submit"]').click();
 assert.match(await p.locator('#toast').innerText(),/deadline must be after/);
 assert.equal(await p.locator('.action-confirmation').count(),0);
 await p.locator('[data-path-schedule="path10"] [name="dueAt"]').fill(dues[2]);
 for(const width of [1440,768,390,320])for(const theme of ['light','dark']){
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(350);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:path.join(out,'dates-'+width+'-'+theme+'.png'),fullPage:true});
 }
 // Canceling the order preview leaves all dates intact.
 await p.locator('#add-lessons-form [type="submit"]').click();
 await p.locator('.action-confirmation').getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await p.locator('#add-lessons-form [type="submit"]').isEnabled(),true);
 assert.equal(await p.evaluate(()=>window.assignments?.length||0),0);
 // A failure on path 2 must preserve path 1 and retry only paths 2 and 10.
 await p.evaluate(()=>window.failPath='path2');await confirm();
 await p.waitForFunction(()=>document.querySelector('#assign-class-modules').textContent==='Retry remaining paths');
 assert.deepEqual(await p.evaluate(()=>assignments.map(a=>a.pathId)),['path1']);
 assert.match(await p.locator('#toast').innerText(),/1 paths already added/);
 await p.evaluate(()=>window.failPath=null);await open();assert.equal(await p.locator('[data-path-schedule]').count(),2);
 await confirm();await p.waitForFunction(()=>window.assignments?.length===3);
 assert.deepEqual(await p.evaluate(()=>assignments.map(a=>a.pathId)),['path1','path2','path10']);
 assert.deepEqual(await p.evaluate(()=>assignments.map(a=>a.dueAt)),dues.map(v=>new Date(v).getTime()));
 const attempts=await p.evaluate(()=>attempts);assert.equal(attempts[1].requestKey,attempts[2].requestKey);
 // Shared lessons must be caught before any save, and an existing assignment blocks its type.
 await load();await p.evaluate(async()=>{
  store.set('learningPaths/overlap',{title:'Path 3',ownerId:'teacher',visibility:'shared',revision:1,moduleIds:['batch2']});
  const {renderAddLessonPage}=await import('/teacher/views/addLesson.js');await renderAddLessonPage('class');
 });
 await p.locator('[data-class-path="path2"]').check();await p.locator('[data-class-path="overlap"]').check();await open();
 assert.equal(await p.locator('#add-lessons-form [type="submit"]').isDisabled(),true);
 assert.match(await p.locator('#add-lessons-skipped').innerText(),/share a lesson/);
 await p.locator('[data-cancel]').click();await p.locator('[data-class-path="overlap"]').uncheck();
 await p.evaluate(async()=>{store.set('classes/class/classLessons/batch2',{lessonId:'batch2',mode:'assessment'});const {renderAddLessonPage}=await import('/teacher/views/addLesson.js');await renderAddLessonPage('class');});
 await p.locator('[data-class-path="path2"]').check();await open();
 await p.locator('[name="mode"][value="assessment"]').check();
 assert.equal(await p.locator('#add-lessons-form [type="submit"]').isDisabled(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: teacher-defined path order, multiselect and clear, blocked calendar days and manually typed opening dates, per-path dates and validation, cancel preservation, 16 light/dark responsive layouts, partial failure retry without duplicates, stable retry keys, overlap and existing-assignment validation.');
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});`;
new Function('require','__dirname',harness+run)(require,__dirname);
