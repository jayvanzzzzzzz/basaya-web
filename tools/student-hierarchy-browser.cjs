const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'student-hub-browser.cjs'),'utf8');
let harness=source.slice(0,source.indexOf('(async()=>{'))
 .replace('audit/student-hub','audit/student-hierarchy')
 .replace("import {resultsFrom, lessonParts}", "import {withPathPrerequisites,canOpenPathLesson} from '/js/learningPathSequence.js';\nimport {resultsFrom, lessonParts}")
 .replace('const records=', `lessons.splice(4);lessons.forEach((x,i)=>Object.assign(x,{learningPathAssignmentId:i<3?'first':'second',learningPathTitle:i<3?'Pag-unawa':'Paglalakbay',learningPathOrder:i<3?1:2,moduleId:i<2?'words':'stories',moduleTitle:i<2?'Mga Salita':'Mga Kuwento',learningPathModuleOrder:i<2?1:2,openAt:null,dueAt:null,lectureFinished:false,gameFinished:false,activityFinished:false,pronunciationFinished:false,quizFinished:false}));
window.finishLesson=id=>Object.assign(lessons.find(x=>x.id===id),{lectureFinished:true,gameFinished:true,activityFinished:true,pronunciationFinished:true,quizFinished:true});
window.setOpening=time=>lessons[3].openAt=time;
const records=`)
 .replace('student.lessons=window.qaEmpty?[]:lessons;', 'student.lessons=window.qaEmpty?[]:withPathPrerequisites(lessons);')
 .replace("canOpen=x=>availability(x)==='open'||isComplete(x)", 'canOpen=x=>canOpenPathLesson(x,student.lessons)');
const run=`
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await p.goto('http://127.0.0.1:'+server.address().port+'/student/hub-preview.html');await p.waitForFunction(()=>window.ready);
 const locked=selector=>p.locator(selector).evaluate(el=>el.classList.contains('is-locked'));
 const reset=async()=>{await p.evaluate(()=>show('home'));while(await p.locator('#home-back-path').isVisible())await p.locator('#home-back-path').click()};
 const openPath=()=>p.locator('[data-student-path=first]').click();
 const openModule=()=>p.locator('[data-student-module=words]').click();
 assert.equal(await p.locator('[data-student-path]').count(),2);
 assert.equal(await locked('[data-student-path=second]'),true);
 assert.equal(await p.locator('.st-lesson__eyebrow').count(),0);
 const capture=async level=>{for(const width of [1440,768,390,320])for(const theme of ['light','dark']) {
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await p.evaluate(()=>scrollTo(0,0));
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:path.join(artifacts,level+'-'+width+'-'+theme+'.png'),fullPage:true});
 }};
 await capture('paths');await openPath();
 assert.equal(await p.locator('[data-student-module]').count(),2);assert.equal(await p.locator('[data-lesson]').count(),0);
 assert.equal(await locked('[data-student-module=stories]'),true);await capture('modules');
 await openModule();assert.equal(await p.locator('[data-lesson]').count(),2);
 await p.evaluate(()=>show('home'));assert.equal(await p.locator('[data-lesson]').count(),2,'Returning from the dashboard retains the module');
 assert.equal(await locked('[data-lesson=continue]'),false);assert.equal(await locked('[data-lesson=new]'),true);
 await p.locator('[data-lesson=new]').click();await p.getByRole('heading',{name:'Naka-lock',exact:true}).waitFor();
 await p.locator('[data-answer=primary]').click();await capture('lessons');
 await p.locator('#home-back-path').click();assert.equal(await p.locator('[data-student-module]').count(),2);
 await p.locator('#home-back-path').click();assert.equal(await p.locator('[data-student-path]').count(),2);
 await p.evaluate(()=>finishLesson('continue'));await reset();await openPath();await openModule();
 assert.equal(await locked('[data-lesson=new]'),false);
 await p.evaluate(()=>finishLesson('new'));await reset();await openPath();assert.equal(await locked('[data-student-module=stories]'),false);
 await p.evaluate(()=>{finishLesson('done');setOpening(Date.now()+86400000)});await reset();
 assert.equal(await locked('[data-student-path=second]'),true,'Future opening still locks a path after prerequisites finish');
 await p.evaluate(()=>setOpening(Date.now()-1000));await reset();assert.equal(await locked('[data-student-path=second]'),false);
 assert.deepEqual(errors,[]);console.log('PASS: path > modules > lessons, locks at every level, completion unlocks, future opening, back navigation, no numbered labels; 24 responsive light/dark screenshots.');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1;server.close()});`;
new Function('require','__dirname',harness+run)(require,__dirname);
