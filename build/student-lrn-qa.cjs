// Real admin views and shell, isolated data; no live account changes.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=process.env.BASAYA_QA_ARTIFACTS||path.join(root,'audit/student-lrn');
const views=['students'];
const keep=['helpers.js','pagination.js','field-errors.js','password-rules.js','teacherTitle.js','floatingTooltip.js','buttonSaving.js','theme.js','route-lifecycle.js','teacher-name.js','create-student.js','student-access.js','action-confirmation.js'];
const names=new Set();
let browser,fixture;
function rewrite(source){return source.replace(/import\s*{([\s\S]*?)}\s*from\s*["']([^"']+)["'];/g,(m,bindings,src)=>{
  if(keep.includes(src.split('/').pop()))return m;
  bindings.split(',').map(v=>v.trim()).filter(Boolean).forEach(v=>names.add(v.split(/\s+as\s+/)[0]));
  return `import {${bindings}} from '/fixture.mjs';`;
});}
const server=http.createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://fixture').pathname).slice(1);let body,type='text/javascript';
 if(name==='fixture.mjs'||name==='js/state.js')body=fixture;
 else if(name==='admin/preview.html'){
  body=(await fs.readFile(path.join(root,'admin/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/type="module"/.test(s)?'':s).replace('</body>',`<script type="module">
   import {shell} from '/js/helpers.js';
   ${views.map(v=>`import {${v==='account'?'renderAccount':'render'+v[0].toUpperCase()+v.slice(1)}} from '/admin/views/${v}.js';`).join('\n')}
   import '/js/admin-design.js';
   import {beginPageLoading} from '/js/page-loading.js';
   const routes={students:renderStudents};
   async function render(){window.ready=false;document.querySelector('#loading-screen').hidden=true;shell('admin-summary','Admin');const route=location.hash.slice(2)||'students';if(!location.hash)history.replaceState(null,'',location.pathname+location.search+'#/'+route);document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===route));const finish=beginPageLoading('/'+route,'admin:fixture','admin-students');await routes[route]();finish();window.ready=true;}
   window.renderStudentsAgain=render;
   window.addEventListener('hashchange',render);await render();
   </script></body>`);type='text/html';
 }else{
  const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('Invalid path');
  body=await fs.readFile(target);type={'.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||type;
  if(views.some(v=>name==='admin/views/'+v+'.js')||name==='admin/views/create-student.js'||name==='admin/views/student-access.js')body=rewrite(body.toString());
  if(name==='js/teacherTitle.js')body=body.toString().replace('from "./chat.js?v=removed-preview"','from "/fixture.mjs"');
 }res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
 }catch(e){res.writeHead(404);res.end(e.message);}});
(async()=>{
 rewrite(await fs.readFile(path.join(root,'admin/views/create-student.js'),'utf8'));
 rewrite(await fs.readFile(path.join(root,'admin/views/student-access.js'),'utf8'));
 for(const v of views)rewrite(await fs.readFile(path.join(root,'admin/views/'+v+'.js'),'utf8'));
 const special={
 postToApi: `async(path,body)=>{if(body.action==='assign-lrn'){window.lrnCalls??=[];window.lrnCalls.push(body);if(window.lrnFailure)throw Error('That LRN is already in use.');if(window.holdLrn)await new Promise(resolve=>window.releaseLrn=resolve);window.fixtureStudents.find(s=>s.id===body.studentId).lrn=body.lrn;return {studentId:body.studentId,lrn:body.lrn};}window.accessCalls??=[];window.accessCalls.push(body);if(window.holdAccess)await new Promise(resolve=>window.releaseAccess=()=>{window.holdAccess=false;resolve()});return {results:body.studentIds.map(studentId=>{if(window.failStudent===studentId)return {studentId,ok:false};const student=window.fixtureStudents.find(s=>s.id===studentId);student.disabled=body.action==='deactivate';return {studentId,ok:true,disabled:student.disabled};})};}`, 

 state:`{user:{uid:'admin',email:'admin@school.edu'},profile:{displayName:'Ana Reyes',role:'admin'},teachers:[],allClasses:[],allLessons:[]}`,
 db:'{}',auth:'{currentUser:{uid:"admin",email:"admin@school.edu"}}',secondaryAuth:'{}',
 getAllTeachers:`async()=>{state.teachers=location.search.includes('empty')?[]:[{id:'t1',displayName:'Maria Santos',email:'maria@school.edu',title:'maam'},{id:'t2',displayName:'Juan Reyes',email:'juan@school.edu',title:'sir'}]}`,
 getAllClasses:`async()=>{state.allClasses=location.search.includes('empty')?[]:[{id:'c1',className:'Grade 7 - Rizal',section:'Rizal',gradeLevel:'7',teacherId:'t1'},{id:'c2',className:'Grade 8 - Mabini',section:'Mabini',gradeLevel:'8',teacherId:''}]}`,
 getAllLessons:`async()=>{state.allLessons=location.search.includes('empty')?[]:[{id:'l1',title:'Ang Alamat ng Pinya',description:'A story to explore and understand.',difficulty:'madali'},{id:'l2',title:'Pangngalan at Panghalip',description:'Build confidence in Filipino.',difficulty:'masusing aralin'}]}`,
 getDocs: `async()=>{window.fixtureStudents??=Array.from({length:24},(_,i)=>({id:'s'+i,firstName:'Student',lastName:String(i).padStart(2,'0'),username:'student_'+i,lrn:String(i).padStart(12,'0'),classId:i%2?'':'c1',disabled:i%3===2}));return {docs:window.fixtureStudents.map(s=>({id:s.id,data:()=>({...s})}))}}`, 
 requestChip:'()=>""',refreshDeletionBadge:'()=>{}',isUnassigned:'c=>!c.teacherId',
 teacherLabel:'t=>t.displayName||t.email',teacherOptions:'()=>"<option value=t1>Maria Santos</option>"',
 requestAdminPasswordChange:'async()=>{}',sendResetLink:'async()=>{}',reauthenticateWithCredential:'async()=>{}',EmailAuthProvider:'{credential:()=>({})}',
 };
 names.add('state');fixture=Object.entries(special).map(([n,v])=>`export const ${n}=${v};`).join('\n');
 fixture+="\nexport const TEACHER_TITLES={maam:\"Ma'am\",sir:'Sir'};export const teacherName=(name)=>name;\n";
 for(const n of names)if(!(n in special))fixture+=`export const ${n}=(...args)=>{};\n`;
 await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:'+server.address().port+'/admin/preview.html';



 await p.goto(url);await p.waitForFunction(()=>window.ready);
 await p.evaluate(()=>{window.fixtureStudents.forEach((s,i)=>{if(i%2===0)delete s.lrn;});});
 await p.evaluate(()=>window.renderStudentsAgain());
 const filter=value=>p.locator('[data-lrn-filter="'+value+'"]');
 const visible=()=>p.locator('tr[data-student]:visible');
 assert.equal((await filter('without').textContent()).trim(),'Without LRN12');
 await filter('without').click();assert.equal(await visible().count(),10);
 await p.locator('[data-page=next]').click();assert.equal(await visible().count(),2);
 await p.locator('[data-student-status-filter=active]').click();assert.equal(await visible().count(),8);
 await p.locator('.student-class-ribbons [data-ribbon=c1]').click();assert.equal(await visible().count(),8);
 await p.locator('#student-search').fill('student_0');assert.equal(await visible().count(),1);
 await p.locator('[data-student=s0] .teacher-table__menu-toggle').click();
 await p.getByRole('button',{name:'Assign LRN',exact:true}).click();
 await p.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await p.evaluate(()=>window.lrnCalls?.length||0),0);
 await p.locator('[data-student=s0] .teacher-table__menu-toggle').click();await p.getByRole('button',{name:'Assign LRN',exact:true}).click();
 const input=p.locator('#assign-lrn-form input');
 await input.fill('123');await p.getByRole('button',{name:'Save LRN',exact:true}).click();
 assert.equal(await p.evaluate(()=>window.lrnCalls?.length||0),0);
 await input.fill('001234567890');await p.evaluate(()=>window.lrnFailure=true);
 await p.getByRole('button',{name:'Save LRN',exact:true}).click();await p.locator('#assign-lrn-error').getByText('That LRN is already in use.').waitFor();assert.equal(await input.isEnabled(),true);
 for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.evaluate(()=>window.scrollTo(0,0));
  await p.screenshot({path:path.join(out,'assign-'+theme+'-'+width+'.png'),fullPage:true});
 }
 await p.evaluate(()=>{window.lrnFailure=false;window.holdLrn=true;});
 await p.getByRole('button',{name:'Save LRN',exact:true}).click();await p.waitForFunction(()=>!!window.releaseLrn);
 assert.equal(await input.isDisabled(),true);await p.keyboard.press('Escape');assert.equal(await p.locator('#assign-lrn-form').count(),1);
 await p.evaluate(()=>window.releaseLrn());await p.locator('#assign-lrn-form').waitFor({state:'detached'});
 await p.waitForFunction(()=>document.querySelector('[data-lrn-filter=without]').textContent.includes('11'));
 assert.equal(await visible().count(),7,'Assigned student leaves Without LRN results');
 assert.equal(await p.locator('[data-student=s0]').isVisible(),false);
 await filter('with').click();assert.equal(await visible().count(),1);
 assert.equal(await p.locator('[data-student=s0] [data-assign-lrn]').count(),0);
 assert.match(await p.locator('[data-student=s0]').textContent(),/001234567890/);
 assert.equal(await p.evaluate(()=>window.fixtureStudents[0].username),'student_0');
 assert.equal(await p.evaluate(()=>window.lrnCalls.at(-1).lrn),'001234567890');
 await p.locator('#student-search').fill('');await p.locator('[data-student-status-filter=all]').click();await p.locator('.student-class-ribbons [data-ribbon=all]').click();await filter('all').click();
 for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.evaluate(()=>window.scrollTo(0,0));
  await p.screenshot({path:path.join(out,'directory-'+theme+'-'+width+'.png'),fullPage:true});
 }
 await p.setViewportSize({width:1440,height:1000});
 await p.evaluate(async()=>{await import('/js/theme.js');});
 // The account theme control lives on a different route; mount its shared attribute here.
 await p.evaluate(()=>{const button=document.createElement('button');button.dataset.themeToggle='';button.textContent='Toggle theme';document.querySelector('#page-content').prepend(button);});
 await p.locator('[data-theme-toggle]').click();
 const saved=await p.evaluate(()=>localStorage.getItem('basaya-theme'));
 assert.ok(['light','dark'].includes(saved));await p.reload();await p.waitForFunction(()=>window.ready);
 assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),saved);
 assert.deepEqual(errors,[]);
 console.log('PASS: LRN filters compose with status/class/search/pagination; menu visibility, cancellation, 12-digit validation, duplicate retry, busy dismissal, successful save and preserved username; responsive light/dark layouts and saved theme. API/data mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
