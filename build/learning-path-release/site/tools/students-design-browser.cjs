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
students[4].membershipStatus='dropped';
export const getDocs=async()=>({docs:(location.search.includes('empty')?[]:students).map(s=>({id:s.id,data:()=>s}))});
export const leaveJoinRequests=()=>{};export const leaveLeaveRequests=()=>{};export const leaveStudentNotifications=()=>{};
export const wireLeaveRequests=()=>{document.querySelector('#leave-review-list').innerHTML='<p class="join-review__empty">No pending requests to show</p>'};
export const watchJoinRequests=()=>{document.querySelector('#join-summary-count').textContent='0';document.querySelector('#request-tab-join-count').textContent='0';document.querySelector('#join-review-list').innerHTML='<p class="join-review__empty">No pending requests to show</p>'};
export const watchStudentNotifications=(id,cb,rows)=>cb({byStudent:new Map(rows.map(s=>[s.id,{labels:s.id==='0'?['Recordings awaiting grading','Unread class messages']:[],readings:s.id==='0',messages:s.id==='0'}]))});
export const classLifecycle=async(action,c,s)=>{window.removalCalls=(window.removalCalls||0)+1;if(window.failRemoval)throw Error('QA failure');students.find(student=>student.id===s).membershipStatus=action==='drop'?'dropped':'enrolled';window.removed=[c,s];window.lifecycleAction=action;};
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
 await fs.mkdir(artifacts,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const url='http://127.0.0.1:'+server.address().port+'/teacher/students-preview.html',rosterHash='#/classes/classroom/students';
  await page.goto(url+rosterHash);await page.waitForFunction(()=>window.ready);
  assert.equal(await page.locator('[data-roster-menu-toggle]').count(),26);
  assert.equal(await page.locator('.roster-menu:visible').count(),0);
  const firstToggle=()=>page.locator('[data-roster-menu-toggle]').first();
  const open=()=>page.locator('.roster-menu:visible');
  async function openFirst(){await page.evaluate(hash=>history.replaceState(null,'',hash),rosterHash);await firstToggle().click();await open().waitFor();}
  for(const theme of ['light','dark'])for(const [name,width]of [['desktop',1440],['tablet',768],['mobile',390],['small-mobile',320]]){
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('basaya-theme',theme);},theme);await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await openFirst();
   const bounds=await open().boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=1001,'Menu stays in viewport');
   assert.equal(await open().evaluate(menu=>menu.parentElement===document.body),true,'Menu escapes table clipping');
   assert.equal(await open().getByRole('menuitem',{name:'View progress',exact:true}).count(),1);
   assert.equal(await open().getByRole('menuitem',{name:'Drop student',exact:true}).count(),1);
   await page.screenshot({path:path.join(artifacts,'menu-'+name+'-'+theme+'.png'),fullPage:false});
   await page.keyboard.press('Escape');assert.equal(await open().count(),0);
   assert.ok(await firstToggle().evaluate(button=>button===document.activeElement));
  }
  await page.setViewportSize({width:1440,height:1000});await firstToggle().focus();await page.keyboard.press('ArrowDown');
  assert.equal(await open().locator('[role=menuitem]').first().evaluate(item=>item===document.activeElement),true);
  await page.keyboard.press('End');assert.equal(await open().getByRole('menuitem',{name:'Drop student',exact:true}).evaluate(item=>item===document.activeElement),true);
  await page.keyboard.press('Home');await page.keyboard.press('ArrowUp');assert.equal(await open().getByRole('menuitem',{name:'Drop student',exact:true}).evaluate(item=>item===document.activeElement),true);
  await page.keyboard.press('Escape');
  await openFirst();await page.locator('#student-search').click();assert.equal(await open().count(),0);
  await openFirst();await page.locator('[data-roster-menu-toggle]').nth(1).click();assert.equal(await open().count(),1);assert.equal(await firstToggle().getAttribute('aria-expanded'),'false');await page.keyboard.press('Escape');
  await openFirst();await open().getByRole('menuitem',{name:'View progress',exact:true}).click();assert.ok((await page.evaluate(()=>location.hash)).endsWith('/students/0'));assert.equal(await open().count(),0);
  await openFirst();await open().getByRole('menuitem',{name:'Review readings',exact:true}).click();assert.ok((await page.evaluate(()=>location.hash)).endsWith('/readings/0'));
  await openFirst();await open().getByRole('menuitem',{name:'Read class messages',exact:true}).click();assert.equal(await page.evaluate(()=>location.hash),'#/messages/classroom');
  await page.evaluate(hash=>history.replaceState(null,'',hash),rosterHash);
  await page.locator('#student-search').fill('Cruz');assert.equal(await page.locator('.roster-row:visible').count(),1);
  await page.locator('#student-search').fill('');await page.locator('[data-page=next]').click();assert.ok(await page.locator('[data-page="2"][aria-current=page]').isVisible());
  await page.locator('#student-search').fill('Cruz');assert.equal(await page.locator('[aria-current=page]').innerText(),'1');
  const selectedToggle=page.locator('.roster-row:visible [data-roster-menu-toggle]');
  await selectedToggle.click();await open().getByRole('menuitem',{name:'Drop student',exact:true}).click();
  assert.equal(await open().count(),0);await page.locator('[data-cancel]').waitFor();assert.ok(await page.locator('[data-cancel]').evaluate(button=>button===document.activeElement));
  await page.keyboard.press('Escape');assert.ok(await selectedToggle.evaluate(button=>button===document.activeElement));
  await selectedToggle.click();await open().getByRole('menuitem',{name:'Drop student',exact:true}).click();
  for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width:390,height:1000});await page.screenshot({path:path.join(artifacts,'drop-menu-'+theme+'.png'),fullPage:true});}
  await page.evaluate(()=>window.failRemoval=true);await page.locator('[data-confirm-remove]').click();await page.waitForFunction(()=>document.querySelector('#remove-student-error').textContent.includes('QA failure'));assert.ok(await page.locator('[data-confirm-remove]').isEnabled());
  await page.evaluate(()=>window.failRemoval=false);await page.locator('[data-confirm-remove]').click();await page.waitForFunction(()=>window.removed);assert.deepEqual(await page.evaluate(()=>window.removed),['classroom','1']);
  await page.waitForFunction(()=>document.querySelector('.roster-row:has([data-remove-student="1"]) .roster-membership')?.textContent==='Dropped');
  await page.locator('#student-search').fill('Cruz');
  await page.locator('.roster-row:visible [data-roster-menu-toggle]').click();
  await open().getByRole('menuitem',{name:'Re-enroll student',exact:true}).click();
  await page.locator('[data-confirm-remove]').click();
  await page.waitForFunction(()=>window.lifecycleAction==='reenroll');
  await page.waitForFunction(()=>document.querySelector('.roster-row:has([data-remove-student="1"]) .roster-membership')?.textContent==='Enrolled');
  await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await open().count(),0);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),await page.evaluate(()=>localStorage.getItem('basaya-theme')));
  await page.goto(url+'?empty'+rosterHash);await page.waitForFunction(()=>window.ready);assert.ok(await page.locator('.student-empty').isVisible());
  await page.goto(url+'?unauthorized'+rosterHash);await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>location.hash),'#/dashboard');
  assert.deepEqual(errors,[]);
  console.log('PASS: single student action menu, visible progress/drop labels, conditional reading/messages, viewport positioning, single-menu/outside/Escape dismissal, keyboard navigation, search/pagination, drop focus/cancel/error/retry, saved theme, empty/unauthorized views; both themes at desktop/tablet/mobile. Data/API mocked.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
