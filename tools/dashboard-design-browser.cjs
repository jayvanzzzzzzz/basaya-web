// Render the real dashboard and teacher shell with local data; no production requests.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'audit/dashboard-design');
let browser;
const fixture = `
export const $ = (s, root = document) => root.querySelector(s);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty = new URLSearchParams(location.search).has('empty');
export const state = {user:{uid:'fixture'}, profile:{}, allLessons:[{id:'reading',title:'Pagbasa: Ang ating pamayanan'}], classes:empty ? [] : [
{id:'rizal',className:'Grade 7 - Rizal',gradeLevel:'7',section:'Rizal',classCode:'RZ7ABC',description:'Building confident readers, one story at a time.'},
{id:'bonifacio',className:'Grade 8 - Bonifacio',gradeLevel:'8',section:'Bonifacio',classCode:'BN8XYZ',description:'A shared space for Filipino language and literature.'},
{id:'mabini',className:'Grade 9 - Mabini',gradeLevel:'9',section:'Mabini',classCode:'MB9DEF',description:'Discover, read, and reflect together.'}]};
export const db = {};
export const getTeacherClasses = async () => {};
export const getAllLessons = async () => {};
export const collection = (...parts) => parts;
export const getCountFromServer = async () => ({data:()=>({count:28})});
export const getDocs = async () => ({docs:[{id:'reading',data:()=>({mode:'assessment',dueAt:{toMillis:()=>Date.now()+172800000}})}]});
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
        source.endsWith('classActions.js') || source.endsWith('pagination.js') ? match : `from '/fixture.mjs'`);
    } else if (/^(css\/|img\/)/.test(name) || ['teacher/views/classActions.js', 'js/floatingTooltip.js', 'js/pagination.js', 'js/theme.js'].includes(name)) {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep) || name.split(/[\\/]/).some(p => p.startsWith('.'))) throw Error('Invalid path');
      body = await fs.readFile(target);
      type = {'.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)] || type;
    } else { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type':type + ';charset=utf-8'}); res.end(body);
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
(async () => {
  await fs.mkdir(artifacts, {recursive:true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/teacher/preview.html`;
  await page.goto(url); await page.waitForFunction(() => window.ready);
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const saved = () => page.evaluate(() => localStorage.getItem('basaya-theme'));
  const toggle = page.locator('[data-theme-toggle]');
  const waitTheme = value => page.waitForFunction(value => document.documentElement.dataset.theme === value, value);
  assert.equal(await theme(), 'light');
  assert.equal(await saved(), null);
  await page.emulateMedia({colorScheme:'dark'}); await waitTheme('dark');
  assert.equal(await saved(), null, 'System theme must not create a saved preference');
  await page.emulateMedia({colorScheme:'light'}); await waitTheme('light');
  await toggle.click(); await waitTheme('dark');
  assert.equal(await saved(), 'dark');
  await page.reload(); await page.waitForFunction(() => window.ready);
  assert.equal(await theme(), 'dark', 'Saved dark mode survives reload with a light system theme');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await toggle.click(); await waitTheme('light');
  await page.reload(); await page.waitForFunction(() => window.ready);
  assert.equal(await theme(), 'light', 'Saved light mode survives reload');
  await page.emulateMedia({colorScheme:'dark'});
  assert.equal(await theme(), 'light', 'Explicit light preference takes precedence over system dark mode');
  await page.emulateMedia({colorScheme:'light'});
  await page.evaluate(() => document.fonts.ready);
  for (const mode of ['light', 'dark']) {
  if (await theme() !== mode) { await toggle.click(); await waitTheme(mode); }
  await page.waitForTimeout(750); // Let the existing circular theme transition finish.
  await page.mouse.move(0, 0);
  for (const [name, width] of [['desktop',1440],['tablet',900],['mobile',390],['small-mobile',320]]) {
    await page.setViewportSize({width,height:1000});
    await page.screenshot({path:path.join(artifacts, name+(mode === 'dark' ? '-dark' : '')+'.png'),fullPage:true});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name+' must not overflow');
    for (const card of await page.locator('.class-card').all()) {
      assert.ok(await card.evaluate(el => el.scrollWidth <= el.clientWidth),name+' card must not overflow');
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  const menu = page.locator('[data-menu-toggle]').first();
  await menu.hover();
  await page.locator('.floating-tooltip').waitFor({state:'visible'});
  assert.match(await page.locator('.floating-tooltip').textContent(), /Options for Grade/);
  await menu.click();
  await page.locator('[data-edit]').first().waitFor({state:'visible'});
  assert.equal(await page.locator('[data-edit]').first().evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
  await page.locator('#class-search').fill('Bonifacio');
  assert.equal(await page.locator('.class-card').count(),1);
  await page.locator('#class-search').fill('no results');
  assert.match(await page.getByRole('status').first().textContent(),/No classes match/);
  await page.locator('#class-search').fill('');
  const code = page.locator('.class-card__copy').first();
  assert.equal(await code.evaluate(el=>el.tagName),'BUTTON');
  await page.mouse.move(0, 0);
  await code.focus();
  await page.locator('.floating-tooltip').waitFor({state:'visible'});
  assert.match(await page.locator('.floating-tooltip').textContent(),/Copy class code/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.floating-tooltip').isVisible(),false);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {value:{writeText:async text=>window.copiedCode=text},configurable:true}));
  await code.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.copiedCode==='RZ7ABC');
  assert.equal(await code.locator('.code-stub__hint').textContent(),'Copied!');
  await page.waitForFunction(()=>document.querySelector('.code-stub__hint').textContent==='Copy');
  await menu.click(); await page.locator('[data-edit]').first().click();
  assert.equal(await page.locator('#class-form [name="section"]').inputValue(),'Rizal');
  await page.locator('[data-close]').click();
  await page.locator('.class-attention summary').first().click();
  assert.equal(await page.locator('.class-attention').first().evaluate(el=>el.open),true);
  await page.locator('#new-class').click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.locator('#class-form [name="gradeLevel"]').count(),1);
  await page.locator('[data-close]').click();
  await page.mouse.move(0, 0);
  await toggle.focus();
  await page.locator('.floating-tooltip').waitFor({state:'visible'});
  assert.equal(await page.locator('.floating-tooltip').textContent(), `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`);
  const bounds = await page.locator('.floating-tooltip').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 1440, 'Theme tooltip stays within the viewport');
  await page.keyboard.press('Escape');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await menu.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  await page.goto(url+'?empty'); await page.waitForFunction(()=>window.ready);
  assert.equal(await theme(), mode);
  await page.screenshot({path:path.join(artifacts,'empty'+(mode === 'dark' ? '-dark' : '')+'.png'),fullPage:true});
  assert.equal(await page.locator('#new-class-empty').count(),1);
  assert.equal(await page.locator('.class-card').count(),0);
  await page.locator('#new-class-empty').click(); await page.getByRole('dialog').waitFor();
  await page.goto(url); await page.waitForFunction(()=>window.ready);
  await page.emulateMedia({reducedMotion:'no-preference'});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: real theme toggle, saved light/dark preferences across reloads, system-theme fallback and preference precedence; both themes at desktop/tablet/mobile/320px; search, menus, keyboard tooltips, copying, edit/create forms, disclosure, reduced motion and empty states. Screenshots: audit/dashboard-design');
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
