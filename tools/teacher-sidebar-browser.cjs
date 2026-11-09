// Render the real dashboard and teacher shell with local data; no production requests.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'audit/teacher-sidebar');
let browser;
const fixture = `
export const $ = (s, root = document) => root.querySelector(s);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty = new URLSearchParams(location.search).has('empty');
export const state = {user:{uid:'fixture',email:'maria.santos@school.edu'}, profile:{displayName:'Maria Santos'}, allLessons:[{id:'reading',title:'Pagbasa: Ang ating pamayanan'}], classes:empty ? [] : [
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
          import {syncThemeButtons} from '/js/theme.js';
          import {renderAccountSettings} from '/teacher/views/accountSettings.js';
          import {shell} from '/shell.mjs';
          shell();
          window.addEventListener('hashchange', () => { if(location.hash === '#/settings') renderAccountSettings(); else renderDashboard(); });
          ${copyHandler}
          document.querySelector('#loading-screen').hidden = true;
          document.querySelector('#app-view').hidden = false;
          document.querySelector('[data-nav="classes"]').classList.add('active');
          await renderDashboard(); window.ready = true;
          </script></body>`);
      type = 'text/html';
     } else if (name === 'teacher/views/accountSettings.js') {
      body = (await fs.readFile(path.join(root,name),'utf8')).replace(/import[\s\S]*?from\s+["'][^"']+["'];/g,'');
      body = "import {syncThemeButtons} from '/js/theme.js'; import {shell} from '/shell.mjs'; import {$, state, page, escapeHtml, toast, updateDoc, doc, db} from '/fixture.mjs'; import {watchTeacherTooltips} from '/teacher/views/classActions.js'; import {titleChipsMarkup} from '/js/teacherTitle.js'; import {MIN_LENGTH,passwordProblem,passwordRulesMarkup,watchPasswordRules} from '/js/password-rules.js'; import {fieldError,focusFirstError} from '/js/field-errors.js'; const initials=name=>name.split(' ').map(n=>n[0]).slice(0,2).join(''); const teacherName=(name,title)=>title==='maam'?\"Ma'am \"+name.split(' ').at(-1):name; const auth={currentUser:{email:'maria.santos@school.edu'}}; const EmailAuthProvider={credential:()=>({})}; const reauthenticateWithCredential=async()=>{}; const updatePassword=async()=>{};\n" + body;
    } else if (name === 'js/teacherTitle.js') {
      body = (await fs.readFile(path.join(root,name),'utf8')).replace(/import[^;]+;/g,'');
      body = "import {escapeHtml} from '/fixture.mjs'; const TEACHER_TITLES={maam:\"Ma'am\",sir:'Sir'}; const teacherName=name=>name;\n" + body;
    } else if (name === 'shell.mjs') {
      const helpers = await fs.readFile(path.join(root,'js/helpers.js'),'utf8');
      body = "import {$,state} from '/fixture.mjs'; const initials = name=>name.split(' ').map(n=>n[0]).slice(0,2).join(''); const displayName=()=> 'Teacher';\n" + helpers.slice(helpers.indexOf('export function shell('),helpers.indexOf('/**',helpers.indexOf('export function shell(')));
    } else if (name === 'fixture.mjs') {
      const helpers = await fs.readFile(path.join(root, 'js/helpers.js'), 'utf8');
      const page = helpers.slice(helpers.indexOf('export function page('), helpers.indexOf('/** A "'));
      const notices = await fs.readFile(path.join(root, 'teacher/views/dashboardNotifications.js'), 'utf8');
      body = fixture + page + notices.slice(notices.indexOf('export function attentionMarkup'), notices.indexOf('// Separate subscriptions'));
    } else if (name === 'teacher/views/dashboard.js') {
      body = (await fs.readFile(path.join(root, name), 'utf8')).replace(/from\s+(["'])([^"']+)\1/g, (match, quote, source) =>
        source.endsWith('classActions.js') || source.endsWith('pagination.js') ? match : `from '/fixture.mjs'`);
    } else if (/^(css\/|img\/)/.test(name) || ['teacher/views/classActions.js', 'js/floatingTooltip.js', 'js/pagination.js', 'js/theme.js','js/password-rules.js','js/field-errors.js'].includes(name)) {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep) || name.split(/[\\/]/).some(p => p.startsWith('.'))) throw Error('Invalid path');
      body = await fs.readFile(target);
      type = {'.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)] || type;
    } else { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type':type + ';charset=utf-8'}); res.end(body);
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
(async()=>{
  await fs.mkdir(artifacts,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/teacher/preview.html');await page.waitForFunction(()=>window.ready);
  assert.equal(await page.locator('#teacher-summary').textContent(),'Maria Santos');
  assert.equal(await page.locator('#teacher-avatar').textContent(),'MS');
  assert.equal(await page.locator('.sidebar .brand, #teacher-stats, #account-menu-toggle, .sidebar [data-theme-toggle]').count(),0);
  assert.equal(await page.getByRole('button',{name:'Log out',exact:true}).count(),1);
  const create = page.locator('#new-class');
  assert.equal(await create.textContent(),'');
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const background = await page.locator('.app-shell').evaluate(el=>getComputedStyle(el).backgroundColor);
    if (theme === 'light') assert.equal(background,'rgb(255, 255, 255)','Teacher dashboard uses the shared white background');
    else assert.notEqual(background,'rgb(255, 255, 255)','Dark mode keeps its dark background');
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      await create.hover();
      const tip=page.getByRole('tooltip').filter({hasText:'Create class'});
      await tip.waitFor();
      assert.ok(await tip.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0;}));
      assert.ok(await create.locator('svg').evaluate(el=>{const s=getComputedStyle(el);return el.getBoundingClientRect().width>=24&&s.stroke!=='none'&&s.stroke!==s.backgroundColor;}));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(artifacts,'create-class-'+width+'-'+theme+'.png')});
    }
  }
  const stickyCreate = page.locator('.page-header-bar__action');
  for (const theme of ['light','dark']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for (const width of [1440,1024]) {
      await page.setViewportSize({width,height:600});
      await page.evaluate(()=>window.scrollTo(0,document.querySelector('#page-header').offsetTop+document.querySelector('#page-header').offsetHeight+80));
      await page.waitForFunction(()=>document.querySelector('.page-header-bar').classList.contains('is-visible'));
      await stickyCreate.hover();
      const tip=page.getByRole('tooltip').filter({hasText:'Create class'});
      await tip.waitFor();
      assert.equal(await stickyCreate.getAttribute('aria-label'),'Create class');
      assert.ok(await stickyCreate.locator('svg').evaluate(el=>getComputedStyle(el).stroke!=='none'&&el.getBoundingClientRect().width===25));
      assert.ok(await tip.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(artifacts,'sticky-create-'+width+'-'+theme+'.png')});
    }
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  await stickyCreate.hover();
  await page.waitForTimeout(250);
  assert.equal(await stickyCreate.evaluate(el=>getComputedStyle(el).transform),'matrix(1, 0, 0, 1, 0, -2)');
  await stickyCreate.focus();await page.mouse.move(0,0);
  await page.getByRole('tooltip').filter({hasText:'Create class'}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('tooltip').filter({hasText:'Create class'}).waitFor({state:'hidden'});
  await page.keyboard.press('Enter');await page.locator('.modal').waitFor();
  assert.match(await page.locator('.modal').textContent(),/Create class/);
  await page.locator('.modal-backdrop').evaluate(el=>el.remove());
  await page.emulateMedia({reducedMotion:'reduce'});
  await stickyCreate.hover();
  assert.equal(await stickyCreate.evaluate(el=>getComputedStyle(el).transform),'none');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.setViewportSize({width:1440,height:1000});
  await create.focus();await page.mouse.move(0,0);
  await page.getByRole('tooltip').filter({hasText:'Create class'}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('tooltip').filter({hasText:'Create class'}).waitFor({state:'hidden'});
  await create.click();await page.locator('.modal').waitFor();
  assert.match(await page.locator('.modal').textContent(),/Create class/);
  await page.locator('.modal-backdrop').evaluate(el=>el.remove());
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
    await page.screenshot({path:path.join(artifacts,'sidebar-'+width+'.png'),fullPage:true});
  }
  await page.locator('.teacher-profile').click();
  await page.locator('.account-settings').waitFor();
  const toggle=page.locator('.account-settings [data-theme-choice=dark]');
  for(const mode of ['dark','light']){
    await page.locator('[data-theme-choice='+mode+']').click();
    await page.waitForFunction(mode=>document.documentElement.dataset.theme===mode,mode);
    assert.equal(await page.evaluate(()=>localStorage.getItem('basaya-theme')),mode);
    assert.equal(await toggle.getAttribute('aria-pressed'),String(mode==='dark'));
    assert.equal(await page.locator('[data-theme-choice=light]').getAttribute('aria-pressed'),String(mode==='light'));
    await page.locator('[data-theme-choice='+mode+']').click();
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),mode);
    for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings overflow '+width);
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.waitForTimeout(200);
      await page.screenshot({path:path.join(artifacts,'settings-'+width+'-'+mode+'.png'),fullPage:true});
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-settings-section="account-password-form"]').click();
  await page.waitForFunction(()=>document.activeElement?.name==='currentPassword');
  assert.equal(await page.evaluate(()=>location.hash),'#/settings');
  const reveal=page.getByRole('button',{name:'Show current password',exact:true});
  await reveal.hover();
  await page.getByRole('tooltip').filter({hasText:'Show current password'}).waitFor();
  await reveal.click();
  assert.equal(await page.locator('[name=currentPassword]').getAttribute('type'),'text');
  await page.getByRole('button',{name:'Hide current password',exact:true}).click();
  assert.equal(await page.locator('[name=currentPassword]').getAttribute('type'),'password');
  await page.locator('[name=currentPassword]').fill('OldPassword1');
  await page.locator('[name=newPassword]').fill('NewPassword2');
  assert.equal(await page.locator('.password-rules .is-met').count(),4);
  await page.locator('[name=confirmPassword]').fill('WrongPassword3');
  await page.getByRole('button',{name:'Update password',exact:true}).click();
  assert.equal(await page.locator('[name=confirmPassword]').getAttribute('aria-invalid'),'true');
  await page.locator('[name=confirmPassword]').fill('NewPassword2');
  await page.getByRole('button',{name:'Update password',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Password updated.');
  assert.equal(await page.locator('[name=newPassword]').inputValue(),'');
  await page.locator('[name=displayName]').fill('Maria Reyes');
  await page.locator('.title-chips__chip').filter({hasText:"Ma'am"}).click();
  assert.match(await page.locator('[data-title-preview]').textContent(),/Ma'am Reyes/);
  await page.getByRole('button',{name:'Save profile',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.account-settings__hero h2').textContent==='Maria Reyes');
  assert.equal(await page.locator('#teacher-summary').textContent(),'Maria Reyes');
  assert.equal(await page.locator('[name=displayName]').inputValue(),'Maria Reyes');
  assert.equal(await page.locator('[name=title][value=maam]').isChecked(),true);
  await page.locator('[data-nav=classes]').click();await page.locator('.teacher-dashboard').waitFor();
  await page.locator('[data-nav=settings]').click();await toggle.waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'),'false');await toggle.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.emulateMedia({reducedMotion:'no-preference'});
  const motion = await page.evaluate(() => {
    const group=document.querySelector('.theme-options');
    document.querySelector('[data-theme-choice=light]').click();
    return {duration:getComputedStyle(group,'::before').transitionDuration, icon:getComputedStyle(document.querySelector('[data-theme-choice=light] svg')).animationName};
  });
  assert.match(motion.duration,/0.32s/);assert.equal(motion.icon,'theme-icon-enter');
  await page.waitForTimeout(400);
  for (const mode of ['light','dark']) {
    await page.locator('[data-theme-choice='+mode+']').click();
    await page.waitForTimeout(400);
    await page.locator('.theme-options').screenshot({path:path.join(artifacts,'theme-control-'+mode+'.png')});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.theme-options').evaluate(el=>getComputedStyle(el,'::before').transitionDuration),'0s');
  assert.deepEqual(errors,[]);console.log('PASS: profile identity, sidebar removals, logout control, account settings theme clicks and keyboard, persisted preference, route remount, no overflow at 1440/768/390/320. Screenshots: audit/teacher-sidebar');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
