// Real admin views and shell, isolated data; no live account changes.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=process.env.BASAYA_QA_ARTIFACTS||path.join(root,'audit/student-accounts');
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
   const routes={students:renderStudents};
   async function render(){window.ready=false;document.querySelector('#loading-screen').hidden=true;shell('admin-summary','Admin');const route=location.hash.slice(2)||'students';if(!location.hash)history.replaceState(null,'',location.pathname+location.search+'#/'+route);document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===route));await routes[route]();window.ready=true;}
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
 postToApi: `async(path,body)=>{window.creationCalls=(window.creationCalls||0)+1;window.createdBody=body;if(window.failCreate)throw Error('That username is already taken.');return {uid:'new-student',...body,username:'cruz.ana'};}`,

 state:`{user:{uid:'admin',email:'admin@school.edu'},profile:{displayName:'Ana Reyes',role:'admin'},teachers:[],allClasses:[],allLessons:[]}`,
 db:'{}',auth:'{currentUser:{uid:"admin",email:"admin@school.edu"}}',secondaryAuth:'{}',
 getAllTeachers:`async()=>{state.teachers=location.search.includes('empty')?[]:[{id:'t1',displayName:'Maria Santos',email:'maria@school.edu',title:'maam'},{id:'t2',displayName:'Juan Reyes',email:'juan@school.edu',title:'sir'}]}`,
 getAllClasses:`async()=>{state.allClasses=location.search.includes('empty')?[]:[{id:'c1',className:'Grade 7 - Rizal',section:'Rizal',gradeLevel:'7',teacherId:'t1'},{id:'c2',className:'Grade 8 - Mabini',section:'Mabini',gradeLevel:'8',teacherId:''}]}`,
 getAllLessons:`async()=>{state.allLessons=location.search.includes('empty')?[]:[{id:'l1',title:'Ang Alamat ng Pinya',description:'A story to explore and understand.',difficulty:'madali'},{id:'l2',title:'Pangngalan at Panghalip',description:'Build confidence in Filipino.',difficulty:'masusing aralin'}]}`,
 getDocs:`async()=>({docs:location.search.includes('empty')?[]:[{id:'s1',data:()=>({firstName:'Liza',lastName:'Mendoza',email:'',username:'liza_m',lrn:'001234567890',classId:'c1'})},{id:'s2',data:()=>({firstName:'Paolo',lastName:'Reyes',email:'paolo@school.edu'})}]})`,
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
 assert.equal(await p.locator('#create-student').count(),1);
 assert.equal(await p.getByText('Send reset email',{exact:true}).count(),0);
 await p.locator('#student-search').fill('001234567890');
 assert.equal(await p.locator('[data-student]:visible').count(),1);
 await p.locator('#student-search').fill('liza_m');
 assert.equal(await p.locator('[data-student]:visible').count(),1);
 await p.locator('#student-search').fill('');
 await p.locator('#create-student').click();await p.locator('#create-student-form').waitFor();
 assert.equal(await p.locator('#create-student-form [name=email]').count(),0);
 for(const theme of ['light','dark']){
  await p.evaluate(t=>{document.documentElement.dataset.theme=t;localStorage.setItem('basaya-theme',t);},theme);
  for(const width of [1440,768,390,320]){
   await p.setViewportSize({width,height:1000});
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Form overflow '+theme+'/'+width);
   await p.screenshot({path:path.join(out,'create-'+theme+'-'+width+'.png'),fullPage:true});
  }
 }
 const form=p.locator('#create-student-form');
 await form.locator('[name=firstName]').fill('Ana');await form.locator('[name=lastName]').fill('Cruz');
 await form.locator('[name=lrn]').fill('123');await form.locator('[name=password]').fill('TestPassword1');
 await form.locator('[type=submit]').click();assert.equal(await p.evaluate(()=>window.creationCalls||0),0);
 await form.locator('[name=lrn]').fill('001234567890');
 assert.equal(await form.locator('[name=username]').inputValue(),'cruz.ana');
 assert.equal(await form.locator('[name=username]').isEditable(),false);
 await p.evaluate(()=>window.failCreate=true);
 await form.locator('[type=submit]').click();await p.getByText('That username is already taken.',{exact:true}).waitFor();
 assert.equal(await form.locator('[type=submit]').isEnabled(),true);
 await p.evaluate(()=>window.failCreate=false);await form.locator('[type=submit]').click();
 await p.getByRole('heading',{name:'Student account created',exact:true}).waitFor();
 assert.ok((await p.locator('.temp-password').textContent()).includes('001234567890'));
 assert.ok((await p.locator('.temp-password').textContent()).includes('cruz.ana'));
 await p.locator('[data-done]').click();
 await p.goto(url+'?empty#/students');await p.waitForFunction(()=>window.ready);
 await p.locator('#create-student').click();await p.locator('#create-student-form').waitFor();
 await p.keyboard.press('Escape');assert.equal(await p.locator('#create-student-form').count(),0);
 for(const name of ['register.html','complete-profile.html']){
  await p.goto('http://127.0.0.1:'+server.address().port+'/'+name);
  assert.equal(await p.locator('input,form').count(),0);
  assert.ok((await p.locator('body').textContent()).includes('school admin'));
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: admin creation in populated/empty directories; LRN/username search; both themes at desktop/tablet/mobile; input validation, conflict recovery and credentials handoff. API/data mocked; no live users created.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
