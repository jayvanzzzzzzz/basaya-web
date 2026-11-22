// Real directory, pagination, confirmation and CSS; isolated API fixtures only.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'audit/teacher-status');
let browser;
const fixture = `
export const auth={},db={};
export const state={teachers:[]};
const teachers=Array.from({length:24},(_,i)=>({id:'teacher'+i,displayName:i===0?'Maria Reyes':'Teacher '+String(i).padStart(2,'0'),email:'teacher'+i+'@school.edu',disabled:i%3===2}));
export const getAllTeachers=async()=>{window.teacherReads=(window.teacherReads||0)+1;state.teachers=teachers.map(t=>({...t}))};
export const $=(s,r=document)=>r.querySelector(s);
export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const page=(title,subtitle,actions)=>{document.querySelector('#header').innerHTML='<h1>'+title+'</h1>'+actions};
export const toast=m=>{window.messages.push(m)};
export const notify=()=>({dismiss(){}}),initials=()=> 'MR',empty=()=>'',openModal=()=>{};
export const doc=()=>{},updateDoc=()=>{},sendPasswordResetEmail=()=>{},sendPasswordReset=()=>{},fieldError=()=>{},genderMarkup=()=>'',titleForGender=()=>'',titleLabel=()=>'',teacherNameFields=()=>'',readTeacherName=()=>{},MIN_LENGTH=8;
export async function postToApi(endpoint,body,options={}){
 window.calls.push(body);
 if(body.action==='statuses') {
  const result={users:teachers.filter(t=>body.userIds.includes(t.id)).map(t=>({uid:t.id,disabled:t.disabled,emailVerified:true}))};
  if(window.statusFailure)throw Error('Status service unavailable');
  if(window.holdStatuses) await new Promise((resolve,reject)=>{window.releaseStatuses=resolve;options.signal?.addEventListener('abort',()=>reject(Error('aborted')),{once:true})});
  return result;
 }
 if(window.holdAccess) await new Promise(resolve=>{window.releaseAccess=()=>{window.holdAccess=false;resolve()}});
 if(window.failAccess) throw Error('Service unavailable. Please retry.');
 const t=teachers.find(t=>t.id===body.userId); t.disabled=body.action==='deactivate'; return {ok:true,disabled:t.disabled};
}`;
const retained = ['../../js/pagination.js','../../js/route-lifecycle.js','../../js/action-confirmation.js'];
const server=http.createServer(async(req,res)=>{
 try {
  const name=new URL(req.url,'http://local').pathname.slice(1);
  let body,type='text/javascript';
  if(name==='fixture.js') body=fixture;
  else if(name==='admin/status-test.html') {
   const original=await fs.readFile(path.join(root,'admin/index.html'),'utf8');
   const styles=[...original.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]).join('');
   body='<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'</head><body data-portal="admin"><div class="content"><header id="header"></header><main id="page-content"></main></div><script type="module">window.calls=[];window.messages=[];import {renderTeachers} from "./views/teachers.js";await renderTeachers();window.ready=true;</script></body></html>'; type='text/html';
  } else {
   const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('path');
   body=await fs.readFile(target);
   type={'.css':'text/css','.png':'image/png','.html':'text/html'}[path.extname(name)]||type;
   if(name==='admin/views/teachers.js') body=body.toString().replace(/from "([^"]+)"/g,(m,s)=>retained.includes(s)?m:'from "/fixture.js"');
  }
  res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
 } catch(e){res.writeHead(404);res.end(e.message)}
});
(async()=>{
 await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const url='http://127.0.0.1:'+server.address().port+'/admin/status-test.html#/teachers';
 await page.goto(url);await page.waitForFunction(()=>window.ready);
 const filter=s=>page.locator('[data-teacher-filter="'+s+'"]');
 const visible=()=>page.locator('tr[data-teacher-name]:visible');
 assert.equal(await page.locator('[data-delete]').count(),0);
 assert.equal(await page.locator('[data-edit], [data-correct-email], #edit-teacher-form').count(),0);
 assert.equal(await visible().count(),10);
 await page.locator('[data-page="next"]').click();
 await filter('deactivated').click();assert.equal(await visible().count(),8);
 await filter('active').click();assert.equal(await visible().count(),10);
 await page.locator('#teacher-name-search').fill('Maria');assert.equal(await visible().count(),1);
 await filter('deactivated').click();assert.ok(await page.locator('.admin-directory-search-empty').isVisible());
 await filter('active').click();
 async function openAccess(){await visible().first().locator('.teacher-table__menu-toggle').click();await page.locator('[data-toggle-access="teacher0"]').click()}
 await openAccess();
 assert.match(await page.getByRole('dialog').textContent(),/removed as teacher from all their classes/);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='deactivate').length),0);
 await openAccess();await page.evaluate(()=>{window.failAccess=true;window.holdAccess=true;});
 await page.getByRole('button',{name:'Deactivate teacher',exact:true}).click();
 await page.locator('[data-teacher-id="teacher0"] .teacher-account-status--loading').first().waitFor({state:'attached'});
 assert.match(await visible().first().textContent(),/Deactivating/);
 assert.ok(await page.locator('[data-toggle-access="teacher0"]').isDisabled());
 for(const theme of ['light','dark'])for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const pending=page.locator('[data-teacher-id="teacher0"] .teacher-account-status--loading:visible');
  assert.equal(await pending.getAttribute('aria-busy'),'true');
  assert.equal(await pending.locator('i').evaluate(el=>getComputedStyle(el).animationName),'teacher-access-spin');
  await page.screenshot({path:path.join(out,'deactivating-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await page.evaluate(()=>window.releaseAccess());
 await page.waitForFunction(()=>window.messages.some(m=>m.includes('Service unavailable')));
 assert.equal(await page.locator('.teacher-account-status--loading').count(),0);
 assert.equal(await visible().count(),1);assert.ok(await page.locator('[data-toggle-access="teacher0"]').isEnabled());
 await page.evaluate(()=>window.failAccess=false);await openAccess();
 await page.getByRole('button',{name:'Deactivate teacher',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.admin-directory-search-empty')?.hidden===false);
 await filter('deactivated').click();assert.equal(await visible().count(),1);
 assert.match(await visible().first().textContent(),/Deactivated/);
 await openAccess();await page.evaluate(()=>window.holdAccess=true);await page.getByRole('button',{name:'Reactivate teacher',exact:true}).click();
 await page.locator('[data-teacher-id="teacher0"] .teacher-account-status--loading').first().waitFor({state:'attached'});
 assert.match(await visible().first().textContent(),/Reactivating/);
 await page.screenshot({path:path.join(out,'reactivating-mobile-dark.png'),fullPage:true});
 await page.evaluate(()=>window.releaseAccess());
 await page.waitForFunction(()=>document.querySelector('.admin-directory-search-empty')?.hidden===false);
 await filter('all').click();assert.equal(await visible().count(),1);
 assert.match(await visible().first().textContent(),/Active/);
 await page.locator('#teacher-name-search').fill('');
 for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow '+width);
  for(const button of await page.locator('[data-teacher-filter]').all()) {
   const label=await button.locator('.teacher-status-filters__label').boundingBox();
   const count=await button.locator('.teacher-status-filters__count').boundingBox();
   const bounds=await button.boundingBox();
   assert.ok(Math.abs(label.y+label.height/2-count.y-count.height/2)<1,'Filter label/count centers align');
   assert.ok(label.x>=bounds.x && count.x+count.width<=bounds.x+bounds.width,'Filter contents stay inside button');
  }
  await page.screenshot({path:path.join(out,'teachers-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await filter('active').focus();assert.notEqual(await filter('active').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
 const pulse=page.locator('.teacher-account-status--mobile i').first();
 assert.equal(await pulse.evaluate(el=>getComputedStyle(el,'::after').animationName),'teacher-status-pulse');
 await page.waitForFunction(()=>{
  const animations=[...document.querySelectorAll('.teacher-account-status i')].filter(el=>el.getBoundingClientRect().width>0).flatMap(el=>el.getAnimations({subtree:true})).filter(a=>a.animationName==='teacher-status-pulse');
  return animations.length>1 && animations.every(a=>a.startTime===0);
 });
 const geometry=await pulse.evaluate(el=>{const s=getComputedStyle(el,'::after');return {width:s.width,height:s.height,left:s.left,top:s.top}});
 assert.equal(geometry.width,geometry.height,'Pulse ring stays circular');
 assert.equal(geometry.left,geometry.top,'Pulse ring stays centered equally on both axes');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await pulse.evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
 await page.evaluate(()=>localStorage.setItem('basaya-theme','dark'));
 await page.reload();await page.waitForFunction(()=>window.ready);
 assert.deepEqual(errors,[]);
 console.log('PASS status counts, search + filters + pagination, cancellation, failure/retry, deactivate/reactivate, both themes at 1440/768/390/320, keyboard focus, pulse/reduced motion; no live accounts changed.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
