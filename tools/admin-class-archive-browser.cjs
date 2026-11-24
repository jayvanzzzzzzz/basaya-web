const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs/promises'), path = require('node:path');
const {chromium} = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname,'..'), out = path.join(root,'audit/admin-class-archive');
const fixture = `
export const state={user:{uid:'admin'},profile:{role:'admin'},teachers:[{id:'teacher',displayName:'Ana Reyes'}],allClasses:[{id:'active',className:'Grade 7 - Rizal',gradeLevel:'7',teacherId:'teacher'},{id:'archived',className:'Grade 8 - Mabini',gradeLevel:'8',teacherId:'teacher',archived:true,archivedAt:{seconds:1700000000}}]};
export const getAllClasses=async()=>{}; export const getAllTeachers=async()=>{};
export const db={};export const doc=()=>{};export const updateDoc=async()=>{};export const serverTimestamp=()=>0;
export const postToApi=async()=>{};
export const classLifecycle=async(action,id)=>{if(window.failArchive)throw Error('Could not archive this class');const c=state.allClasses.find(c=>c.id===id);c.archived=action==='archive';window.lastArchiveAction=action;};
export const isUnassigned=c=>!c.teacherId;export const teacherLabel=t=>t.displayName;export const teacherOptions=()=>'';export const openAssignTeacherModal=()=>{};
export const captureRoute=()=>()=>true;
export const auth={currentUser:{uid:'admin'}};
`;
const server=http.createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://local').pathname).slice(1);
 let body,type='text/javascript';
 if(name==='fixture.mjs'||name==='js/state.js'||name==='js/firebase.js')body=fixture;
 else if(name==='admin/preview.html'){
  body=(await fs.readFile(path.join(root,'admin/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/type="module"/.test(s)?'':s).replace('</body>',`<script type="module">import {shell} from '/js/helpers.js';import {renderClasses} from '/admin/views/classes.js';import {state} from '/fixture.mjs';window.fixtureState=state;window.ready=false;document.querySelector('#loading-screen').hidden=true;shell('admin-summary','Admin');await renderClasses();window.ready=true;</script></body>`);type='text/html';
 }else{
  const file=path.resolve(root,name);if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  body=await fs.readFile(file);type={'.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.html':'text/html'}[path.extname(name)]||type;
  if(name==='admin/views/classes.js')body=body.toString().replace(/from "(?:https:[^"]+|\.\.\/\.\.\/js\/(?:firebase|state|api|route-lifecycle)\.js|\.\/classTeacher\.js)"/g,'from "/fixture.mjs"');
 }res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
 }catch(e){res.writeHead(404);res.end(e.message);}});
let browser;
(async()=>{
 await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const p=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:'+server.address().port+'/admin/preview.html#/classes';
 await p.goto(url);await p.waitForFunction(()=>window.ready);
 assert.equal(await p.locator('[data-class-name]:visible').count(),1);
 assert.match(await p.locator('[data-class-name]:visible').textContent(),/Rizal/);
 assert.equal(await p.getByText('Delete class',{exact:true}).count(),0);
 for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.setViewportSize({width,height:1000});
  for(const tab of ['active','archived']){
   await p.locator('[data-class-status="'+tab+'"]').click();await p.waitForFunction(t=>document.querySelector('[data-class-status="'+t+'"]').getAttribute('aria-pressed')==='true',tab);
   assert.equal(await p.locator('[data-class-name]:visible').count(),1);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   await p.screenshot({path:path.join(out,tab+'-'+theme+'-'+width+'.png'),fullPage:true});
  }
 }
 await p.setViewportSize({width:1440,height:1000});
 await p.locator('#class-name-search').fill('Rizal');assert.equal(await p.locator('[data-class-name]:visible').count(),0);
 await p.locator('#class-name-search').fill('');
 await p.locator('[data-grade-filter="7"]').click();assert.equal(await p.locator('[data-class-name]:visible').count(),0);
 await p.locator('[data-grade-filter="all"]').click();
 await p.locator('.admin-class-menu-toggle').click();await p.getByText('Restore class',{exact:true}).click();
 await p.locator('.modal [data-confirm]').click();await p.waitForFunction(()=>window.lastArchiveAction==='restore');
 await p.waitForSelector('[data-class-status="active"]');assert.match(await p.locator('#page-content').textContent(),/No archived classes/);
 await p.locator('[data-class-status="active"]').click();assert.equal(await p.locator('[data-class-name]:visible').count(),2);
 await p.locator('[data-class-name]').first().locator('.admin-class-menu-toggle').click();await p.locator('[data-archive-class]').first().click();
 await p.evaluate(()=>window.failArchive=true);await p.locator('.modal [data-confirm]').click();await p.getByText('Could not archive this class',{exact:true}).waitFor();
 assert.equal(await p.locator('.modal [data-confirm]').isEnabled(),true);
 await p.evaluate(()=>window.failArchive=false);await p.locator('.modal [data-confirm]').click();await p.waitForFunction(()=>window.lastArchiveAction==='archive');
 await p.waitForSelector('[data-class-status="archived"]');await p.locator('[data-class-status="archived"]').focus();await p.keyboard.press('Enter');
 await p.waitForSelector('[data-class-name="Grade 7 - Rizal"]');
 await p.evaluate(async()=>{
   window.fixtureState.allClasses.push({id:'older',className:'Older classroom',gradeLevel:'7',teacherId:'teacher',schoolYear:'2025-2026'}, {id:'old-archive',className:'Older archive',gradeLevel:'8',teacherId:'teacher',schoolYear:'2025-2026',archived:true});
   await (await import('/admin/views/classes.js')).renderClasses();
 });
 assert.equal(await p.locator('[data-school-year="2026-2027"]').getAttribute('aria-pressed'),'true');
 assert.equal(await p.locator('[data-class-name="Older archive"]').count(),0);
 await p.locator('[data-school-year="2025-2026"]').click();await p.locator('[data-class-name="Older archive"]').waitFor();
 await p.locator('[data-class-status="active"]').click();await p.locator('[data-class-name="Older classroom"]').waitFor();
 assert.equal(await p.locator('[data-class-name]:visible').count(),1);
 await p.locator('#class-name-search').fill('none');assert.equal(await p.locator('[data-class-name]:visible').count(),0);
 await p.locator('#class-name-search').fill('Older');assert.equal(await p.locator('[data-class-name]:visible').count(),1);
 await p.locator('[data-school-year="all"]').click();await p.waitForFunction(()=>document.querySelectorAll('[data-class-name]').length===2);
 console.log('PASS: admin current-year default, legacy year, multiple years, archives, All years and combined search.');
 assert.deepEqual(errors,[]);console.log('PASS: admin active/archive ribbons, counts, grade/search isolation, archive/restore, empty archive, retry error, keyboard, light/dark at 1440/768/390/320. Data mutations isolated.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
