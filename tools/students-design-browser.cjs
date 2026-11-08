// Isolated UI QA: real student renderer, helpers, pagination, requests markup and theme.
// Synthetic records exist only in this test server. No Firebase writes are made.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const auditText=require('./text-readability-audit.cjs');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'), artifacts=path.join(root,'audit/students-design');
const fixture=`
export {leaveRequestsPanel,pendingLeaves} from '/teacher/views/leaveRequestsUi.js';
export const state={user:{uid:'teacher'}},db={};
export const doc=(...a)=>a.slice(1).join('/');export const collection=doc;
export const getDoc=async()=>({id:'classroom',exists:()=>true,data:()=>({teacherId:location.search.includes('unauthorized')?'other':'teacher',className:'Grade 7 — Rizal',classCode:'RZ7ABC'})});
const students=Array.from({length:26},(_,i)=>({id:String(i),fullName:i===0?'A learner with a very long full name to check wrapping and readability':i===1?'Cruz, Ana':i===2?'Reyes, Ben': 'Student '+String(i).padStart(2,'0'),leaveRequest:i===2?{reason:'Changing class'}:null}));
export const getDocs=async()=>({docs:(location.search.includes('empty')?[]:students).map(s=>({id:s.id,data:()=>s}))});
export const leaveJoinRequests=()=>{};export const leaveLeaveRequests=()=>{};export const leaveStudentNotifications=()=>{};
export const wireLeaveRequests=()=>{document.querySelector('#leave-review-list').innerHTML='<p class="join-review__empty">No pending requests to show</p>'};
export const watchJoinRequests=()=>{document.querySelector('#join-summary-count').textContent='0';document.querySelector('#request-tab-join-count').textContent='0';document.querySelector('#join-review-list').innerHTML='<p class="join-review__empty">No pending requests to show</p>'};
export const watchStudentNotifications=(id,cb,rows)=>cb({byStudent:new Map(rows.map(s=>[s.id,{labels:s.id==='0'?['Recordings awaiting grading','Unread class messages']:[],readings:s.id==='0',messages:s.id==='0'}]))});
export const removeStudent=async(c,s)=>{window.removalCalls=(window.removalCalls||0)+1;if(window.failRemoval)throw Error('QA failure');window.removed=[c,s]};
`;
const stubs=['js/firebase.js','js/state.js','js/api.js','teacher/views/joinRequests.js','teacher/views/leaveRequests.js','teacher/views/studentNotifications.js'];
const server=http.createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://preview').pathname).slice(1);let body,type='text/javascript';
 if(name==='fixture.mjs')body=fixture;
 else if(name==='teacher/students-preview.html'){
  body=(await fs.readFile(path.join(root,'teacher/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/type="module"/.test(s)?'':s).replace('</body>',`<script type="module">import {renderStudentsPage} from './views/students.js';import '../js/theme.js';document.querySelector('#loading-screen').hidden=true;document.querySelector('#app-view').hidden=false;document.querySelector('[data-nav="classes"]').classList.add('active');await renderStudentsPage('classroom');window.ready=true;</script></body>`);type='text/html';
 }else{
  const target=path.resolve(root,name);if(!target.startsWith(root+path.sep)||name.split(/[\\/]/).some(p=>p.startsWith('.')))throw Error('Invalid path');
  body=await fs.readFile(target);const ext=path.extname(name);type={'.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'}[ext]||type;
  if(ext==='.js')body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,(m,q,src)=>src.startsWith('https://www.gstatic.com/firebasejs/')||stubs.includes(path.posix.normalize(path.posix.join(path.posix.dirname(name),src)))?`from '/fixture.mjs'`:m);
 }
 res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
}catch(e){res.writeHead(404);res.end(e.message)}});
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=`http://127.0.0.1:${server.address().port}/teacher/students-preview.html`;
 const readability=[];
 await page.goto(url);await page.waitForFunction(()=>window.ready);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('.roster-row').count(),26);
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await page.waitForTimeout(350);
  for(const [name,width] of [['desktop',1440],['laptop',1100],['tablet',768],['mobile',390],['small-mobile',320]]){
   await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${name} page overflow`);
   readability.push({theme,name,issues:await auditText(page)});
   await page.screenshot({path:path.join(artifacts,`${name}-${theme}.png`),fullPage:true});
  }
 }
 await fs.writeFile(path.join(artifacts,'readability.json'),JSON.stringify(readability,null,2));
 assert.deepEqual(readability.flatMap(item=>item.issues),[], 'Visible text contrast, size and clipping audit');
 await page.setViewportSize({width:390,height:1000});
 await page.locator('.roster-table-wrap').evaluate(el=>el.scrollLeft=el.scrollWidth);
 await page.locator('[data-view-progress]').first().click();
 assert.ok((await page.evaluate(()=>location.hash)).endsWith('/students/0'));
 await page.screenshot({path:path.join(artifacts,'mobile-actions-dark.png'),fullPage:true});
 await page.locator('.roster-table-wrap').evaluate(el=>el.scrollLeft=0);
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#student-search').focus();
 const progress=page.locator('[data-view-progress]').first();
 for(let tab=0;tab<5 && !await progress.evaluate(el=>el===document.activeElement);tab++) await page.keyboard.press('Tab');
 await page.waitForTimeout(220);
 assert.ok(await progress.evaluate(el=>el===document.activeElement),'Keyboard reaches first student action');
 assert.equal(await page.locator('.floating-tooltip:visible').innerText(),'View progress');
 assert.equal(await progress.evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
 await page.keyboard.press('Escape');assert.equal(await page.locator('.floating-tooltip:visible').count(),0);
 await progress.hover();assert.equal(await page.locator('.floating-tooltip:visible').innerText(),'View progress');
 await page.screenshot({path:path.join(artifacts,'tooltip-dark.png')});
 await progress.click();assert.ok((await page.evaluate(()=>location.hash)).endsWith('/students/0'));
 await page.locator('[data-review-student]').first().click();assert.ok((await page.evaluate(()=>location.hash)).endsWith('/readings/0'));
 await page.locator('[data-message-student]').first().click();assert.equal(await page.evaluate(()=>location.hash),'#/messages/classroom');
 await page.locator('#student-search').fill('Cruz');assert.equal(await page.locator('.roster-row:visible').count(),1);
 await page.locator('#student-search').fill('no matching name');assert.ok(await page.locator('#student-no-results').isVisible());
 await page.locator('#student-search').fill('');
 await page.locator('[data-page="next"]').click();assert.ok(await page.locator('[data-page="2"][aria-current="page"]').isVisible());
 await page.locator('#student-search').fill('Cruz');assert.equal(await page.locator('[aria-current="page"]').innerText(),'1');
 const remove=page.locator('.roster-row:visible [data-remove-student]');await remove.click();
 assert.equal(await page.locator('[role="dialog"]').getAttribute('aria-labelledby'),'roster-remove-title');
 assert.ok(await page.locator('[data-cancel]').evaluate(e=>e===document.activeElement));
 await page.locator('[data-confirm-remove]').focus();await page.keyboard.press('Tab');assert.ok(await page.locator('.modal-close').evaluate(e=>e===document.activeElement));
 await page.screenshot({path:path.join(artifacts,'removal-dark.png')});
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Dialog page overflow');
   const issues=(await auditText(page)).filter(item=>item.label.startsWith('roster-removal')||item.label.startsWith('#roster-remove-title')||item.label.startsWith('BUTTON: Keep')||item.label.startsWith('BUTTON: Remove'));
   assert.deepEqual(issues,[],'Dialog readability');
   await page.screenshot({path:path.join(artifacts,`removal-${width}-${theme}.png`),fullPage:true});
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.keyboard.press('Escape');assert.equal(await page.locator('[role="dialog"]').count(),0);assert.ok(await remove.evaluate(e=>e===document.activeElement));
 await remove.click();await page.evaluate(()=>window.failRemoval=true);await page.locator('[data-confirm-remove]').click();await page.waitForFunction(()=>document.querySelector('#remove-student-error').textContent.includes('QA failure'));assert.ok(await page.locator('[data-confirm-remove]').isEnabled());
 await page.evaluate(()=>window.failRemoval=false);await page.locator('[data-confirm-remove]').click();await page.waitForFunction(()=>window.removed);assert.deepEqual(await page.evaluate(()=>window.removed),['classroom','1']);
 await page.locator('#request-tab-leave').click();assert.ok(await page.locator('#request-panel-leave').isVisible());await page.keyboard.press('ArrowLeft');assert.ok(await page.locator('#request-panel-join').isVisible());
 await page.locator('[data-theme-toggle]').click();const saved=await page.evaluate(()=>localStorage.getItem('basaya-theme'));await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),saved);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.roster-action').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 await page.goto(url+'?empty');await page.waitForFunction(()=>window.ready);assert.ok(await page.locator('.student-empty').isVisible());await page.screenshot({path:path.join(artifacts,'empty.png'),fullPage:true});
 await page.goto(url+'?unauthorized');await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>location.hash),'#/dashboard');assert.equal(await page.locator('.roster-row').count(),0);
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks:'10 responsive/theme screenshots; search, pagination, progress/readings/messages routing, notifications, removal cancel/focus trap/error/success callback, request tabs, saved theme, reduced motion, empty state, ownership redirect',errors},null,2));
 console.log('PASS: student workspace visual and interaction regression checks');
 }finally{await browser.close()}
})().finally(()=>server.close()).catch(e=>{console.error(e);process.exitCode=1});
