// Real student router and theme, synthetic enrollment only; no Firebase writes.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'audit/enrollment-notice');
const fixture=`export const student={uid:'student',profile:{classId:'class1',className:'Grade 7 - Rizal',enrollmentStatus:'dropped'},classroom:{},lessons:[]};window.student=student;
export {pathBlocker} from '/js/learningPathSequence.js';
export const findLesson=async id=>({id}),canOpen=()=>true,loadClassLessons=async()=>student.lessons;
export const enrollmentBlocked=()=>student.profile.enrollmentStatus==='dropped'||student.classroom.membershipClosed===true;
export const $=(s,r=document)=>r.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
export const escapeHtml=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const navigate=route=>location.hash='#'+route;
const show=label=>async()=>{$('#page-content').innerHTML='<p>'+label+'</p>';window.lastScreen=label};
export const renderHome=show('Active lessons'),renderJoin=show('Join class'),renderLessonPath=show('Lesson path'),renderLecture=show('Lecture'),renderGame=show('Game'),renderActivity=show('Activity'),renderPronunciation=show('Pronunciation'),renderQuiz=show('Quiz'),renderProgress=show('Progress'),renderChat=show('Contact teacher screen'),renderNotifications=show('Notifications'),renderAccount=show('Account'),renderDictionary=show('Dictionary'),renderAssistant=show('Assistant');
export const watchChatBadge=async()=>{},refreshBell=async()=>{};`;
const server=http.createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://preview').pathname).slice(1);let body,type='text/javascript';
 if(name==='fixture.mjs')body=fixture;
 else if(name==='student/enrollment-preview.html'){
  body=(await fs.readFile(path.join(root,'student/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/type="module"/.test(s)?'':s).replace('</body>',`<script type="module">import {renderRoute,refreshEnrollment} from './router.js';import '../js/theme.js';document.querySelector('#loading-screen').hidden=true;document.querySelector('#app-view').hidden=false;window.refreshEnrollment=refreshEnrollment;window.addEventListener('hashchange',renderRoute);await renderRoute();window.ready=true;</script></body>`);type='text/html';
 }else{
  const target=path.resolve(root,name);if(!target.startsWith(root+path.sep)||name.split(/[\\/]/).some(p=>p.startsWith('.')))throw Error('Invalid path');
  body=await fs.readFile(target);type={'.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||type;
  if(name==='student/router.js')body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,()=>"from '/fixture.mjs'");
 }
 res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
}catch(error){res.writeHead(404);res.end(error.message)}});
(async()=>{
 await fs.mkdir(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const url='http://127.0.0.1:'+server.address().port+'/student/enrollment-preview.html';
  await page.goto(url+'#/home');await page.waitForFunction(()=>window.ready);
  for(const theme of ['light','dark'])for(const width of [1440,390,320]){
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('basaya-theme',theme)},theme);await page.setViewportSize({width,height:1000});
   assert.ok(await page.getByRole('heading',{name:'Dropped ang iyong enrollment',exact:true}).isVisible());
   assert.ok(await page.getByRole('link',{name:'Makipag-ugnayan sa guro',exact:true}).isVisible());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(out,'dropped-'+theme+'-'+width+'.png'),fullPage:true});
  }
  await page.getByRole('link',{name:'Makipag-ugnayan sa guro',exact:true}).click();await page.waitForFunction(()=>window.lastScreen==='Contact teacher screen');
  await page.evaluate(()=>location.hash='#/lesson/one/quiz');await page.getByRole('heading',{name:'Dropped ang iyong enrollment',exact:true}).waitFor();assert.notEqual(await page.evaluate(()=>window.lastScreen),'Quiz');
  await page.evaluate(()=>{window.student.profile.enrollmentStatus='enrolled';return window.refreshEnrollment()});await page.waitForFunction(()=>window.lastScreen==='Quiz');
  await page.evaluate(()=>{window.student.classroom={membershipClosed:true};return window.refreshEnrollment()});await page.getByRole('heading',{name:'Naka-archive ang klase',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'archived-dark-mobile.png'),fullPage:true});
  await page.evaluate(()=>{window.student.classroom={membershipClosed:false};return window.refreshEnrollment()});await page.waitForFunction(()=>window.lastScreen==='Active lessons');
  await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');assert.deepEqual(errors,[]);
  console.log('PASS: real student router drop/archive notices, direct lesson blocking, teacher-contact navigation, re-enrollment/restoration, saved theme, desktop/mobile/320px in both themes. Enrollment/data mocked.');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1;server.close()});
