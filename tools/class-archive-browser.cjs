// Render the real dashboard and teacher shell with local data; no production requests.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'audit/class-archive');
let browser;
const fixture = `
export const $ = (s, root = document) => root.querySelector(s);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty = new URLSearchParams(location.search).has('empty');
export const state = {user:{uid:'fixture'}, profile:{}, allLessons:[{id:'reading',title:'Pagbasa: Ang ating pamayanan'}], classes:empty ? [] : [
{id:'rizal',className:'Grade 7 - Rizal',gradeLevel:'7',section:'Rizal',classCode:'RZ7ABC',description:'Building confident readers, one story at a time.'},
{id:'bonifacio',className:'Grade 8 - Bonifacio',gradeLevel:'8',section:'Bonifacio',classCode:'BN8XYZ',description:'A shared space for Filipino language and literature.'},
{id:'mabini',archived:true,className:'Grade 9 - Mabini',gradeLevel:'9',section:'Mabini',classCode:'MB9DEF',description:'Discover, read, and reflect together.'}]};
export const db = {};
export const captureRoute = () => () => true;
export const skeleton = () => '';
export const classLifecycle = async(action,id)=>{if(window.failLifecycle)throw Error('QA archive error');state.classes.find(c=>c.id===id).archived=action==='archive';window.lastClassAction=action;};
export const getTeacherClasses = async () => {};
export const getAllLessons = async () => {};
export const collection = (...parts) => parts;
export const getCountFromServer = async () => ({data:()=>({count:28})});
export const getDocs = async () => ({docs:[{get:()=>null,id:'reading',data:()=>({mode:'assessment',dueAt:{toMillis:()=>Date.now()+172800000}})}]});
export const doc = () => {};
export const addDoc = async () => {};
export const updateDoc = async () => {};
export const serverTimestamp = () => 0;
export const linkMode = link => link.mode;
export const linkLessonId = link => link.id;
export const toast = message => { $('#toast').textContent = message; };
export const navigate = route => { location.hash = '#' + route; };
export const joinCode = () => 'NEW123';
export const renderRoute = () => {};
export const confirmCancelRequest = () => {};
export const openRequestDeletionModal = () => {};
export const deletionChip = () => '';
export const hasUnreadChat = id => id === 'rizal';
export const onChatSummaries = () => {};
export const greeting = () => 'Magandang araw, Teacher Ana';
export const setRequestTab = () => {};
export const watchDashboardNotifications = (classes, callback) => classes.forEach(c => callback(c.id, {className:c.className,joins:c.id === 'rizal' ? 2 : 0}));
export function openModal(html, mount) {
  const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = '<section class="modal" role="dialog" aria-modal="true"><div class="modal-content">'+html+'</div></section>';
  document.body.append(backdrop); mount?.(backdrop, () => backdrop.remove());
}
`;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://fixture');
    const name = decodeURIComponent(url.pathname).slice(1);
    let body, type = 'text/javascript';
    if (name === 'teacher/preview.html') {
      const app = await fs.readFile(path.join(root, 'teacher/app.js'), 'utf8');
      const copyHandler = app.slice(app.indexOf('// Class-code copy-to-clipboard'), app.indexOf('$("#logout-button")'));
      body = (await fs.readFile(path.join(root, 'teacher/index.html'), 'utf8'))
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, script => /type="module"/.test(script) ? '' : script)
        .replace('</body>', `<script type="module">
          import {renderDashboard} from '/teacher/views/dashboard.js';
          import {toast} from '/fixture.mjs';
          import '/js/theme.js';
          ${copyHandler}
          document.querySelector('#loading-screen').hidden = true;
          document.querySelector('#app-view').hidden = false;
          document.querySelector('[data-nav="classes"]').classList.add('active');
          await renderDashboard(); window.ready = true;
          </script></body>`);
      type = 'text/html';
    } else if (name === 'fixture.mjs') {
      const helpers = await fs.readFile(path.join(root, 'js/helpers.js'), 'utf8');
      const page = helpers.slice(helpers.indexOf('export function page('), helpers.indexOf('// Slim bar'))
        .replace('syncHeaderBar(title);', '');
      const notices = await fs.readFile(path.join(root, 'teacher/views/dashboardNotifications.js'), 'utf8');
      body = fixture + page + notices.slice(notices.indexOf('export function attentionMarkup'), notices.indexOf('// Separate subscriptions'));
    } else if (name === 'teacher/views/dashboard.js') {
      body = (await fs.readFile(path.join(root, name), 'utf8')).replace(/from\s+(["'])([^"']+)\1/g, (match, quote, source) =>
        source.endsWith('classDeletion.js') || source.endsWith('classActions.js') || source.endsWith('pagination.js') ? match : `from '/fixture.mjs'`);
     } else if (name === 'teacher/views/classDeletion.js') {
      body=(await fs.readFile(path.join(root,name),'utf8')).replace(/from\s+(["'])([^"']+)\1/g,()=>"from '/fixture.mjs'");
    } else if (/^(css\/|img\/)/.test(name) || ['teacher/views/classActions.js', 'js/floatingTooltip.js', 'js/pagination.js', 'js/theme.js', 'js/theme-buttons.js'].includes(name)) {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep) || name.split(/[\\/]/).some(p => p.startsWith('.'))) throw Error('Invalid path');
      body = await fs.readFile(target);
      type = {'.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)] || type;
    } else { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type':type + ';charset=utf-8'}); res.end(body);
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
 page.on('console',msg=>{if(msg.type()==='error')console.error('Console:',msg.text())});page.on('response',response=>{if(response.status()>=400)console.error('HTTP:',response.status(),response.url())});page.on('requestfailed',request=>console.error('Request:',request.url(),request.failure()));
 page.on('pageerror',error=>{errors.push(error.message);console.error('Browser:',error.message)});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const url='http://127.0.0.1:'+server.address().port+'/teacher/preview.html';
 await page.goto(url+'#/classes');await page.waitForFunction(()=>window.ready);
 assert.equal(await page.locator('.class-card').count(),2);
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('basaya-theme',theme)},theme);await page.setViewportSize({width,height:1000});
  await page.getByRole('button',{name:'Archived (1)',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.class-card').length===1);
  assert.equal(await page.locator('[data-edit]').count(),0);assert.equal(await page.locator('[data-menu] button').filter({hasText:'Restore class'}).count(),1);
  const colors=await page.locator('[data-class-tab=archived]').evaluate(button=>({ink:getComputedStyle(button).color,bg:getComputedStyle(button).backgroundColor}));assert.notEqual(colors.ink,colors.bg,'Selected tab label remains visible');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:require('node:path').join(artifacts,'archived-'+theme+'-'+width+'.png'),fullPage:true});
  await page.getByRole('button',{name:'Active (2)',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.class-card').length===2);
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('[data-menu-toggle="rizal"]').click();await page.getByRole('button',{name:'Archive class',exact:true}).first().click();
 assert.ok(await page.getByRole('dialog').isVisible());assert.match(await page.getByRole('dialog').innerText(),/preserved/);
 await page.evaluate(()=>window.failLifecycle=true);await page.locator('[data-confirm]').click();await page.waitForFunction(()=>document.querySelector('.form-error').textContent.includes('QA archive error'));
 await page.evaluate(()=>window.failLifecycle=false);await page.locator('[data-confirm]').click();await page.waitForFunction(()=>window.lastClassAction==='archive');
 await page.getByRole('button',{name:'Archived (2)',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.class-card').length===2);
 await page.locator('[data-menu-toggle="rizal"]').click();await page.locator('[data-menu="rizal"] button').click();await page.locator('[data-confirm]').click();await page.waitForFunction(()=>window.lastClassAction==='restore');
 await page.getByRole('button',{name:'Active (2)',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.class-card').length===2);
 await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
 assert.deepEqual(errors,[]);console.log('PASS: real class directory Active/Archived filtering, actual archive/restore confirmation, API failure/retry, saved theme, no overflow in light/dark at 1440/390/320. API/data mocked.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});