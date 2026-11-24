// Real router and shared access policy; local synthetic enrollment and screens.
const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'enrollment-notice-browser.cjs'),'utf8');
let harness=source.slice(0,source.indexOf('(async()=>{'))
 .replace('audit/enrollment-notice','audit/learning-path-lock')
 .replace("enrollmentStatus:'dropped'","enrollmentStatus:'enrolled'")
 .replace("export const findLesson=async id=>({id}),canOpen=()=>true,loadClassLessons=async()=>student.lessons;", `
import {withPathPrerequisites,canOpenPathLesson} from '/js/learningPathSequence.js';
const raw=[{id:'first',order:1,learningPathAssignmentId:'one',learningPathTitle:'Tekstong Multimodal',lectureFinished:true,gameSkipped:true,activitySkipped:true,pronunciationSkipped:true,quizFinished:false},{id:'second',order:2,learningPathAssignmentId:'two',learningPathTitle:'Susi sa Pag-unawa',openAt:Date.now()-3600000}];
student.lessons=withPathPrerequisites(raw);
window.finishPrevious=()=>student.lessons[0].quizFinished=true;
window.setFuture=()=>student.lessons[1].openAt=Date.now()+86400000;
export const findLesson=async id=>student.lessons.find(item=>item.id===id),canOpen=lesson=>canOpenPathLesson(lesson,student.lessons),loadClassLessons=async()=>student.lessons;`);
const run=`
(async()=>{
 await fs.mkdir(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const url='http://127.0.0.1:'+server.address().port+'/student/enrollment-preview.html';
 for(const part of ['', '/lecture','/game','/activity','/pronunciation','/quiz']) {
  await page.goto(url+'#/lesson/second'+part);await page.waitForFunction(()=>window.ready);
  await page.getByRole('heading',{name:'Naka-lock ang aralin',exact:true}).waitFor();
  assert.match(await page.locator('#page-content').innerText(),/Tekstong Multimodal/);
 }
 for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
  await page.evaluate(t=>{document.documentElement.dataset.theme=t;localStorage.setItem('basaya-theme',t)},theme);await page.setViewportSize({width,height:1000});await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(out,'locked-'+theme+'-'+width+'.png'),fullPage:true});
 }
 await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
 await page.evaluate(()=>{finishPrevious();return refreshEnrollment()});await page.waitForFunction(()=>window.lastScreen==='Quiz');
 await page.evaluate(()=>{setFuture();return refreshEnrollment()});await page.getByRole('heading',{name:'Naka-lock ang aralin',exact:true}).waitFor();
 assert.match(await page.locator('#page-content').innerText(),/Tingnan ang iskedyul/);
 assert.deepEqual(errors,[]);console.log('PASS: real student router blocks direct path and all five part URLs, unlocks after required completion, keeps future schedule blocked, saved theme and 8 responsive light/dark layouts.');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1;server.close()});`;
new Function('require','__dirname',harness+run)(require,__dirname);
