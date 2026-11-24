// Real student home UI with the shared completion policy and local records.
const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'student-hub-browser.cjs'),'utf8');
let harness=source.slice(0,source.indexOf('(async()=>{'))
 .replace('audit/student-hub','audit/learning-path-home')
 .replace("import {resultsFrom, lessonParts}", "import {withPathPrerequisites,canOpenPathLesson} from '/js/learningPathSequence.js';\nimport {resultsFrom, lessonParts}")
 .replace('const records=', `lessons[0].learningPathAssignmentId='first';lessons[0].learningPathTitle='Tekstong Multimodal';lessons[1].learningPathAssignmentId='second';lessons[1].learningPathTitle='Susi sa Pag-unawa';
window.finishPrevious=()=>Object.assign(lessons[0],{lectureFinished:true,gameFinished:true,activityFinished:true,pronunciationFinished:true,quizFinished:true});
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
 assert.equal(await p.locator('[data-student-path]').count(),2);
 assert.equal(await p.locator('[data-lesson]').count(),0);
 assert.equal(await p.locator('[data-student-path="second"]').evaluate(el=>el.classList.contains('is-locked')),true);
 await p.locator('[data-student-path=second]').click();await p.getByRole('heading',{name:'Naka-lock ang lesson path',exact:true}).waitFor();
 assert.match(await p.locator('.st-dialog').innerText(),/Tekstong Multimodal/);await p.locator('[data-answer="primary"]').click();
 for(const width of [1440,768,390,320])for(const theme of ['light','dark']) {
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(250);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:path.join(artifacts,'home-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await p.locator('[data-student-path="first"]').click();await p.locator('[data-student-module]').first().click();
 assert.equal(await p.locator('[data-lesson="continue"]').count(),1);
 assert.equal(await p.locator('[data-lesson=new]').count(),0);
 await p.locator('#home-back-path').click();await p.locator('#home-back-path').click();assert.equal(await p.locator('[data-lesson]').count(),0);
 await p.locator('#home-search').fill('Susi');assert.equal(await p.locator('[data-student-path]').count(),1);await p.locator('#home-search').fill('');
 await p.evaluate(async()=>{finishPrevious();await show('home')});
 assert.equal(await p.locator('[data-student-path=second]').evaluate(el=>el.classList.contains('is-locked')),false);
 await p.locator('[data-student-path=second]').click();await p.locator('[data-student-module]').first().click();assert.equal(await p.locator('[data-lesson=new]').count(),1);await p.locator('#home-back-path').click();await p.locator('#home-back-path').click();
 await p.evaluate(async()=>{window.qaEmpty=true;await show('home')});assert.equal(await p.locator('[data-student-path]').count(),0);assert.match(await p.locator('#home-list').innerText(),/Wala pang nakatalagang lesson path/);
 await p.addInitScript(()=>{const original=window.matchMedia.bind(window);window.matchMedia=query=>query==='(display-mode: standalone)'?{matches:true,addEventListener(){},removeEventListener(){}}:original(query);});
 await p.reload();await p.waitForFunction(()=>window.ready);
 assert.equal(await p.locator('[data-lesson]').count(),0);
 await p.locator('[data-student-path=first]').click();await p.locator('[data-student-module]').first().click();
 assert.equal(await p.locator('[data-download=continue]').count(),1);
 await p.locator('.st-download-menu summary').click();assert.equal(await p.locator('[data-download=continue]').isVisible(),true);
 await p.locator('#home-back-path').click();await p.locator('#home-back-path').click();assert.equal(await p.locator('[data-download]').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: path-only student list and counts, search, drilldown/back, preserved prerequisite explanation and completion unlock; 8 responsive light/dark layouts.');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1;server.close()});`;
new Function('require','__dirname',harness+run)(require,__dirname);
