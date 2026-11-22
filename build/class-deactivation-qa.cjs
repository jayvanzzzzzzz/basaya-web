// Real admin views and shell, isolated data; no live account changes.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=process.env.BASAYA_QA_ARTIFACTS||path.join(root,'audit/class-deactivation');
const views=['classes'];
const keep=['helpers.js','pagination.js','field-errors.js','password-rules.js','teacherTitle.js','floatingTooltip.js','buttonSaving.js','theme.js','route-lifecycle.js','teacher-name.js','classTeacher.js'];
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
   const routes={classes:renderClasses};
   async function render(){window.ready=false;document.querySelector('#loading-screen').hidden=true;shell('admin-summary','Admin');const route=location.hash.slice(2)||'classes';if(!location.hash)history.replaceState(null,'',location.pathname+location.search+'#/'+route);document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===route));await routes[route]();window.ready=true;}
   window.addEventListener('hashchange',render);await render();
   </script></body>`);type='text/html';
 }else{
  const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('Invalid path');
  body=await fs.readFile(target);type={'.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||type;
  if(views.some(v=>name==='admin/views/'+v+'.js')||name==='admin/views/classTeacher.js')body=rewrite(body.toString());
  if(name==='js/teacherTitle.js')body=body.toString().replace('from "./chat.js?v=removed-preview"','from "/fixture.mjs"');
 }res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
 }catch(e){res.writeHead(404);res.end(e.message);}});
(async()=>{
 rewrite(await fs.readFile(path.join(root,'admin/views/classTeacher.js'),'utf8'));
 for(const v of views)rewrite(await fs.readFile(path.join(root,'admin/views/'+v+'.js'),'utf8'));
 const special={
 postToApi: `async(endpoint,body)=>{window.cleanupCalls??=[];window.cleanupCalls.push(body);if(body.action==='cleanup-classes' && state.teachers.find(t=>t.id===body.userId)?.disabled===true)window.fixtureClasses.forEach(c=>{if(c.teacherId===body.userId)c.teacherId=''});return {ok:true};}`,

 state:`{user:{uid:'admin',email:'admin@school.edu'},profile:{displayName:'Ana Reyes',role:'admin'},teachers:[],allClasses:[],allLessons:[]}`,
 db:'{}',auth:'{currentUser:{uid:"admin",email:"admin@school.edu"}}',secondaryAuth:'{}',
 getAllTeachers:`async()=>{state.teachers=location.search.includes('empty')?[]:[{id:'t1',displayName:'Maria Santos',email:'maria@school.edu',title:'maam'},{id:'t2',displayName:'Juan Reyes',email:'juan@school.edu',title:'sir',disabled:true}]}`,
 getAllClasses:`async()=>{window.fixtureClasses??=location.search.includes('empty')?[]:[{id:'c1',className:'Grade 7 - Rizal',section:'Rizal',gradeLevel:'7',teacherId:'t1'},{id:'c2',className:'Grade 8 - Mabini',section:'Mabini',gradeLevel:'8',teacherId:'t2'}];state.allClasses=structuredClone(window.fixtureClasses)}`,
 getAllLessons:`async()=>{state.allLessons=location.search.includes('empty')?[]:[{id:'l1',title:'Ang Alamat ng Pinya',description:'A story to explore and understand.',difficulty:'madali'},{id:'l2',title:'Pangngalan at Panghalip',description:'Build confidence in Filipino.',difficulty:'masusing aralin'}]}`,
 getDocs:`async()=>({docs:location.search.includes('empty')?[]:[{id:'s1',data:()=>({firstName:'Liza',lastName:'Mendoza',email:'liza@school.edu',classId:'c1'})},{id:'s2',data:()=>({firstName:'Paolo',lastName:'Reyes',email:'paolo@school.edu'})}]})`,
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
 assert.equal(await p.evaluate(()=>window.cleanupCalls.length),1);
 assert.equal(await p.evaluate(()=>window.fixtureClasses.find(c=>c.id==='c2').teacherId),'');
 assert.equal(await p.locator('tr[data-unassigned]').count(),1);
 assert.ok((await p.locator('tr[data-unassigned]').textContent()).includes('Needs a teacher'));
 await p.locator('[data-assign-class="c2"]').click();await p.locator('#assign-teacher-form').waitFor();
 assert.equal(await p.locator('#assign-teacher-form option[value="t2"]').count(),0);
 assert.equal(await p.locator('#assign-teacher-form option[value="t1"]').count(),1);
 await p.locator('[data-cancel]').click();
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.screenshot({path:path.join(out,'unassigned-'+theme+'-'+width+'.png'),fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: existing assignments for deactivated teachers are repaired on All classes; classes show Needs a teacher; inactive teachers excluded from assignment picker; both themes at desktop/mobile. API/data mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
