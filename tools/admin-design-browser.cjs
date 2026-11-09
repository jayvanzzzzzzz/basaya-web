// Real admin views and shell, isolated data; no live account changes.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'audit/admin-design');
const views=['teachers','students','classes','lessons','account'];
const keep=['helpers.js','pagination.js','field-errors.js','password-rules.js','teacherTitle.js','floatingTooltip.js','buttonSaving.js','theme.js'];
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
   const routes={teachers:renderTeachers,students:renderStudents,classes:renderClasses,lessons:renderLessons,settings:renderAccount};
   async function render(){window.ready=false;document.querySelector('#loading-screen').hidden=true;shell('admin-summary','Admin');const route=location.hash.slice(2)||'teachers';document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===route));await routes[route]();window.ready=true;}
   window.addEventListener('hashchange',render);await render();
   </script></body>`);type='text/html';
 }else{
  const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('Invalid path');
  body=await fs.readFile(target);type={'.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||type;
  if(views.some(v=>name==='admin/views/'+v+'.js'))body=rewrite(body.toString());
  if(name==='js/teacherTitle.js')body=body.toString().replace('from "./chat.js?v=removed-preview"','from "/fixture.mjs"');
 }res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
 }catch(e){res.writeHead(404);res.end(e.message);}});
(async()=>{
 for(const v of views)rewrite(await fs.readFile(path.join(root,'admin/views/'+v+'.js'),'utf8'));
 const special={
 state:`{user:{uid:'admin',email:'admin@school.edu'},profile:{displayName:'Ana Reyes',role:'admin'},teachers:[],allClasses:[],allLessons:[]}`,
 db:'{}',auth:'{currentUser:{uid:"admin",email:"admin@school.edu"}}',secondaryAuth:'{}',
 getAllTeachers:`async()=>{state.teachers=location.search.includes('empty')?[]:[{id:'t1',displayName:'Maria Santos',email:'maria@school.edu',title:'maam'},{id:'t2',displayName:'Juan Reyes',email:'juan@school.edu',title:'sir'}]}`,
 getAllClasses:`async()=>{state.allClasses=location.search.includes('empty')?[]:[{id:'c1',className:'Grade 7 - Rizal',section:'Rizal',gradeLevel:'7',teacherId:'t1'},{id:'c2',className:'Grade 8 - Mabini',section:'Mabini',gradeLevel:'8',teacherId:''}]}`,
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
 for(const route of ['teachers','students','classes','lessons','settings']){
  await p.evaluate(r=>location.hash='/'+r,route);await p.waitForFunction(()=>window.ready&&document.querySelector('[data-nav].active')?.dataset.nav===location.hash.slice(2));
  if(route==='students') {
   assert.equal(await p.locator('[data-ribbon="c1"] .student-ribbon__label').textContent(),'Grade 7 - Rizal');
   assert.equal(await p.locator('[data-ribbon="c2"] .student-ribbon__label').textContent(),'Grade 8 - Mabini');
  }
  for(const theme of ['light','dark']){
   await p.evaluate(async t=>{document.documentElement.dataset.theme=t;(await import('/js/theme.js')).syncThemeButtons();},theme);
   for(const width of [1440,768,390,320]){
    await p.setViewportSize({width,height:1000});await p.evaluate(()=>scrollTo(0,0));
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+route+'/'+theme+'/'+width);
    await p.screenshot({path:path.join(out,route+'-'+width+'-'+theme+'.png'),fullPage:true});
   }
  }
 }
 await p.setViewportSize({width:1440,height:1000});
 await p.evaluate(()=>location.hash='/teachers');await p.waitForFunction(()=>document.querySelector('#add-teacher'));
 assert.equal(await p.locator('#admin-name, #admin-avatar').count(),0);
 assert.equal(await p.locator('.admin-profile img').getAttribute('src'),'../img/logo.png');
 assert.ok(await p.locator('.page-header__scope').isHidden());
 assert.equal(await p.locator('#add-teacher svg').count(),1);
 await p.locator('#add-teacher').hover();await p.getByRole('tooltip').filter({hasText:'Add teacher'}).waitFor();
 await p.locator('#add-teacher').focus();await p.mouse.move(0,0);await p.getByRole('tooltip').filter({hasText:'Add teacher'}).waitFor();
 await p.locator('#teacher-name-search').fill('Maria');assert.equal(await p.locator('[data-teacher-name]:visible').count(),1);
 await p.locator('#teacher-name-search').fill('');
 await p.locator('.teacher-table__menu-toggle').first().hover();await p.getByRole('tooltip').filter({hasText:'Actions for Maria Santos'}).waitFor();
 await p.locator('.teacher-table__menu-toggle').first().click();await p.locator('[data-edit=t1]').click();await p.locator('.modal').waitFor();
 await p.screenshot({path:path.join(out,'teacher-edit.png'),fullPage:true});await p.locator('.modal-close').click();
 await p.locator('#add-teacher').click();await p.locator('#add-teacher-form').waitFor();
 await p.setViewportSize({width:320,height:800});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await p.screenshot({path:path.join(out,'teacher-create-320.png'),fullPage:true});await p.locator('.modal-close').click();
 await p.locator('[data-nav=classes]').click();await p.locator('[data-grade-filter="8"]').click();assert.equal(await p.locator('[data-class-name]:visible').count(),1);
 await p.locator('[data-nav=lessons]').click();await p.locator('[data-lesson-filter=intermediate]').click();assert.equal(await p.locator('[data-lesson-row]:visible').count(),1);
 assert.equal(await p.locator('.sidebar [data-theme-toggle], #account-menu-toggle').count(),0);
 assert.equal(await p.getByRole('button',{name:'Log out',exact:true}).count(),1);
 await p.locator('[data-nav=settings]').click();
 await p.locator('[data-theme-choice=light]').click();await p.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 assert.equal(await p.evaluate(()=>localStorage.getItem('basaya-theme')),'light');
 await p.locator('[data-theme-choice=dark]').focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 assert.equal(await p.locator('[data-theme-choice=dark]').getAttribute('aria-pressed'),'true');
 await p.locator('[data-theme-choice=light]').click();
 await p.locator('[data-nav=settings]').click();await p.locator('[name=currentPassword]').fill('OldPassword1');await p.locator('[name=newPassword]').fill('NewPassword2');await p.locator('[name=confirmPassword]').fill('DifferentPassword3');
 await p.locator('#admin-password-form [type=submit]').click();assert.equal(await p.locator('[name=confirmPassword]').getAttribute('aria-invalid'),'true');
 for(const route of ['teachers','students','classes','lessons']){await p.goto(url+'?empty#/'+route);await p.waitForFunction(()=>window.ready);assert.ok(await p.locator('#page-content').textContent());}
 assert.deepEqual(errors,[]);console.log('PASS: five admin routes, both themes, 1440/768/390/320, real search/filter/menu/modal interactions, profile identity, tooltip, password validation, empty states. Authentication/data mutations stubbed. Screenshots: audit/admin-design');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
