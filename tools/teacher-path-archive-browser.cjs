// Real UI with local Firebase/API adapters; no production writes.
const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'content-archive-browser.cjs'), 'utf8');
let harness = source.slice(0, source.indexOf('(async()=>{'))
  .replace("audit/content-archive", "audit/teacher-path-archive")
  .replace("export const serverTimestamp=", `docs.set('learningPaths/reading',{title:'Reading path',ownerId:'teacher',visibility:'shared',revision:1,moduleIds:['own']});
docs.set('learningPaths/archived',{title:'Archived path',ownerId:'teacher',visibility:'private',revision:1,moduleIds:['own'],archived:true});
export const serverTimestamp=`)
  .replace("if(path!=='content-lifecycle')", `if(body?.action==='assign-learning-path'){
 window.assignments=[...(window.assignments||[]),structuredClone(body)];
 const ids=body.moduleIds.flatMap(id=>docs.get('modules/'+id).lessonIds);
 for(const id of ids)docs.set('classes/'+body.classId+'/classLessons/'+id,{lessonId:id,learningPathId:body.pathId,mode:body.mode});
 return {linkIds:ids};
 }
 if(path!=='content-lifecycle')`)
  .replace("body.kind==='module'?'modules':'lessons'", "body.kind==='learningPath'?'learningPaths':body.kind==='module'?'modules':'lessons'")
  .replace("body.kind==='module'?item.ownerId:item.teacherId", "body.kind==='lesson'?item.teacherId:item.ownerId");
const run = `
(async()=>{
 await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const p=await browser.newPage(),base='http://127.0.0.1:'+server.address().port,errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 await p.goto(base+'/fixture.html?role=admin');await p.waitForFunction(()=>window.ready);
 assert.ok(await p.locator('[data-content-lifecycle="delete"]').count()>0);
 await p.goto(base+'/fixture.html?class=1');await p.waitForFunction(()=>window.ready);
 assert.equal(await p.locator('#page-header h1').innerText(),'Add Lesson Path');
 assert.equal(await p.locator('#class-module, #add-class-module').count(),0);
 assert.equal(await p.locator('#assign-class-modules').isDisabled(),true);
 assert.equal(await p.locator('[data-class-path="archived"]').count(),0);
 await p.locator('[data-class-path="reading"]').check();
 assert.match(await p.locator('#class-module-order').innerText(),/own module/);
 for(const width of [1440,390])for(const theme of ['light','dark']){
  await p.setViewportSize({width,height:950});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:path.join(out,'assignment-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await p.locator('#assign-class-modules').click();assert.match(await p.locator('.modal h2').innerText(),/Assign 1 lesson path/);
 await p.locator('#add-lessons-form [type="submit"]').click();
 await p.locator('.action-confirmation').getByRole('button',{name:'Assign lesson paths',exact:true}).click();
 await p.waitForFunction(()=>window.assignments?.length===1);
 assert.deepEqual(await p.evaluate(()=>({pathId:assignments[0].pathId,moduleIds:assignments[0].moduleIds,mode:assignments[0].mode})),{pathId:'reading',moduleIds:['own'],mode:'practice'});
 assert.equal(await p.evaluate(()=>store.get('classes/class/classLessons/pandiwa').learningPathId),'reading');
 await p.goto(base+'/fixture.html');await p.waitForFunction(()=>window.ready);
 await p.evaluate(()=>{for(const key of [...store.keys()])if(key.startsWith('learningPaths/'))store.delete(key);});
 await p.evaluate(async()=>{const {renderAddLessonPage}=await import('/teacher/views/addLesson.js');store.set('classes/class',{teacherId:'teacher',className:'Grade 7'});location.hash='/classes/class/add-lesson';await renderAddLessonPage('class');});
 assert.match(await p.locator('#page-content').innerText(),/No lesson paths to add yet/);
 assert.equal(await p.locator('#class-module, #add-class-module').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: library admin deletion retained, path-only class assignment API, no-path empty state, 4 responsive light/dark layouts and no browser errors.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});`;
new Function('require','__dirname',harness+run)(require,__dirname);
