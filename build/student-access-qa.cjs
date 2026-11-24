// Real admin views and shell, isolated data; no live account changes.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=process.env.BASAYA_QA_ARTIFACTS||path.join(root,'audit/student-access');
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
 postToApi: `async(path,body)=>{window.accessCalls??=[];window.accessCalls.push(body);if(window.holdAccess)await new Promise(resolve=>window.releaseAccess=()=>{window.holdAccess=false;resolve()});return {results:body.studentIds.map(studentId=>{if(window.failStudent===studentId)return {studentId,ok:false};const student=window.fixtureStudents.find(s=>s.id===studentId);student.disabled=body.action==='deactivate';return {studentId,ok:true,disabled:student.disabled};})};}`, 

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
 const filter=value=>p.locator('[data-student-status-filter="'+value+'"]');
 const visible=()=>p.locator('tr[data-student]:visible');
 assert.equal(await visible().count(),10);
 for(let visit=0;visit<3;visit++){
  await p.locator('[data-page=next]').click();
  await p.evaluate(()=>window.renderStudentsAgain());
  assert.equal(await visible().count(),10,'Returning to student accounts must show the real rows after the loading preview is removed');
  assert.equal(await p.locator('#page-content .pagination:visible').count(),1);
  assert.equal(await visible().first().getAttribute('data-student'),'s0');
 }
 const multi=p.locator('#student-multiselect-toggle');
 assert.equal(await p.locator('#student-select-page').isVisible(),false);
 assert.equal(await p.locator('[data-select-student]:visible').count(),0);
 for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await multi.hover();
  const tip=p.getByRole('tooltip',{name:'Multi-select students',exact:true});await tip.waitFor();
  const box=await tip.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
  await p.screenshot({path:path.join(out,'multiselect-'+theme+'-'+width+'.png'),fullPage:true});
  await multi.click();assert.equal(await multi.getAttribute('aria-pressed'),'true');
  assert.equal(await p.locator('[data-select-student]:visible').count(),10);
  await visible().first().locator('[data-select-student]').check();
  await multi.click();assert.equal(await p.locator('[data-select-student]:checked').count(),0);
  assert.equal(await p.locator('#student-bulk-actions').isVisible(),false);
  assert.equal(await p.locator('#student-select-page').isVisible(),false);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await p.setViewportSize({width:1440,height:1000});
 await p.mouse.move(0,0);await p.locator('#student-search').focus();
 await multi.focus();await p.getByRole('tooltip',{name:'Multi-select students',exact:true}).waitFor();
 await p.keyboard.press('Escape');assert.equal(await p.getByRole('tooltip',{name:'Multi-select students',exact:true}).isVisible(),false);
 await p.keyboard.press('Space');assert.equal(await multi.getAttribute('aria-pressed'),'true');
 assert.equal((await filter('active').textContent()).trim(),'Active16');
 assert.equal((await filter('deactivated').textContent()).trim(),'Deactivated8');
 await filter('deactivated').click();assert.equal(await visible().count(),8);
 await filter('active').click();assert.equal(await visible().count(),10);
 await filter('all').click();
 await p.locator('#student-select-page').check();assert.equal(await p.locator('[data-select-student]:checked').count(),10);
 await p.locator('[data-page=next]').click();assert.equal(await p.locator('#student-select-page').isChecked(),false);
 await visible().first().locator('[data-select-student]').check();assert.equal(await p.locator('[data-select-student]:checked').count(),11);
 await filter('active').click();assert.equal(await p.locator('[data-select-student]:checked').count(),0);
 await filter('all').click();await p.locator('#student-search').fill('student_0');
 assert.equal(await visible().count(),1);await visible().first().locator('[data-select-student]').check();
 await p.locator('[data-bulk-deactivate]').click();await p.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await p.evaluate(()=>window.accessCalls?.length||0),0);
 await p.locator('#student-search').fill('');
 await p.locator('[data-student=s0] [data-select-student]').check();await p.locator('[data-student=s1] [data-select-student]').check();
 await p.evaluate(()=>window.holdAccess=true);await p.locator('[data-bulk-deactivate]').click();
 await p.getByRole('button',{name:'Deactivate students',exact:true}).click();
 await p.locator('[data-student=s0] .teacher-account-status--loading').first().waitFor({state:'attached'});
 assert.ok(await p.locator('[data-student=s0] [data-select-student]').isDisabled());
 for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.screenshot({path:path.join(out,'pending-'+theme+'-'+width+'.png'),fullPage:true});
 }
 await p.evaluate(()=>window.releaseAccess());
 await p.waitForFunction(()=>document.querySelector('[data-student=s0]').dataset.accountStatus==='deactivated');
 assert.equal(await p.locator('[data-select-student]:checked').count(),0);
 assert.equal((await filter('deactivated').textContent()).trim(),'Deactivated10');
 await p.setViewportSize({width:1440,height:1000});
 await filter('deactivated').click();await p.locator('[data-student=s0] [data-select-student]').check();await p.locator('[data-student=s1] [data-select-student]').check();
 await p.evaluate(()=>{window.failStudent='s1';window.holdAccess=true;});
 await p.locator('[data-bulk-reactivate]').click();await p.getByRole('button',{name:'Reactivate students',exact:true}).click();
 await p.locator('[data-student=s0] .teacher-account-status--loading').first().waitFor({state:'attached'});
 assert.match(await p.locator('[data-student=s0]').textContent(),/Reactivating/);
 await p.evaluate(()=>window.releaseAccess());
 await p.waitForFunction(()=>document.querySelector('[data-student=s0]').dataset.accountStatus==='active');
 assert.equal(await p.locator('[data-select-student]:checked').count(),1);
 assert.equal(await p.locator('[data-student=s1] [data-select-student]').isChecked(),true);
 await p.evaluate(()=>window.failStudent=null);await p.locator('[data-bulk-reactivate]').click();
 await p.getByRole('button',{name:'Reactivate student',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('[data-student=s1]').dataset.accountStatus==='active');
 await filter('all').click();await p.locator('[data-student=s0] .teacher-table__menu-toggle').click();await p.locator('[data-student=s0] [data-student-access]').click();
 await p.getByRole('button',{name:'Deactivate student',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('[data-student=s0]').dataset.accountStatus==='deactivated');
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>{document.documentElement.dataset.theme=t;localStorage.setItem('basaya-theme',t)},theme);
  await p.screenshot({path:path.join(out,'directory-'+theme+'-'+width+'.png'),fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: student status counts, combined search/filters, page selection across pagination, selection clearing, cancellation, bulk deactivate/reactivate, pending states, partial failure and retry, individual actions, both themes on desktop/tablet/mobile. API/data mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
