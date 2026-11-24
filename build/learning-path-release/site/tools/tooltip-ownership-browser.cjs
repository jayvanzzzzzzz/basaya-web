// Inspect real control markup/styles and tooltip modules without authentication or data writes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
let browser;
const source = file => fs.readFile(path.join(root, file), 'utf8');
const sample = (html, marker, tag = 'button') => {
  const result = [...html.matchAll(new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?</' + tag + '>', 'g'))].find(match => match[0].includes(marker))?.[0];
  if (!result) throw Error('Missing control: ' + marker);
  return result.replace('<' + tag, '<' + tag + ' data-sample');
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/fixture.html') {
      const mode = url.searchParams.get('mode');
      const file = {admin:'admin/index.html',teacher:'teacher/index.html',student:'student/index.html',login:'index.html',register:'register.html',reset:'reset-password.html'}[mode];
      const page = await source(file);
      const styles = [...page.matchAll(/<link\b[^>]*>/g)].map(match => match[0]).filter(tag => tag.includes('rel="stylesheet"') && !tag.includes('https:')).map(tag => tag.replace(/href="(?:\.\.\/)?/, 'href="/')).join('');
      const bodyClass = page.match(/<body[^>]*class="([^"]+)"/)?.[1] || '';
      let controls = '', setup = '';
      if (mode === 'admin') {
        const lesson = await source('admin/views/lessons.js'), game = await source('admin/views/gameLevels.js');
        controls = ['data-add-lecture-page','data-remove-lecture-page','data-remove-question'].map(key => sample(lesson,key)).join('') + sample(game,'data-remove-game-level');
        controls += '<button data-sample id="fallback" aria-label="Open options" title="Browser duplicate">Options</button>';
        controls += '<section class="lesson-preview-modal">' + sample(await source('admin/views/lessonViewer.js'),'class="lv-play"').replaceAll('${escapeHtml(label)}','sentence') + '<button data-sample class="modal-close" aria-label="Close lesson preview" data-tooltip="Close preview">×</button></section>';
        controls += '<button data-sample class="site-info__close" aria-label="Close">×</button>';
        setup = `await import('/js/admin-design.js'); attachFloatingTooltips(document.querySelector('#app-view'));`;
      } else if (mode === 'teacher') {
        const messages = await source('teacher/views/messages.js');
        const selector = messages.match(/const disposeTooltips = attachFloatingTooltips\(document.body, '([^']+)'\)/)?.[1];
        if (!selector) throw Error('Missing Messages tooltip selector');
        controls = '<nav class="main-nav"><a data-sample href="#" data-nav="messages" data-teacher-tooltip aria-label="Messages"><strong>Messages</strong></a></nav><button data-sample data-theme-toggle data-teacher-tooltip aria-label="Theme">Theme</button><button data-sample id="account-menu-toggle" data-teacher-tooltip aria-label="Account menu" title="Teacher">Account</button><section class="teacher-messages"><button data-sample data-floating-tooltip aria-label="Class members">Members</button></section>';
        controls += sample(await source('teacher/views/lessons.js'), 'data-add-sentence');
        setup = `const shell = await import('/teacher/views/classActions.js'); shell.watchTeacherTooltips(); attachFloatingTooltips(document.body, ${JSON.stringify(selector)});`;
      } else if (mode === 'student') {
        controls = '<div class="is-student-hub"><header class="st-topbar">' + sample(page,'st-assistant-link','a') + sample(page,'id="st-dict-link"','a') + sample(page,'data-theme-toggle') + '</header></div>';
        const assistant = await source('student/views/assistant.js');
        controls += sample(assistant,'id="assistant-help-toggle"') + '<div id="assistant-help" hidden><input id="assistant-search"></div>';
        const start = assistant.indexOf('  $("#assistant-help-toggle").addEventListener');
        const end = assistant.indexOf('  input.addEventListener("keydown"', start);
        setup = `const $ = s => document.querySelector(s); ${assistant.slice(start,end)}`;
      } else controls = sample(page,'data-theme-toggle');
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<style>#app-view{display:grid;gap:60px;padding:100px 30px;max-width:100vw}.lesson-preview-modal{position:relative;display:flex;gap:100px;padding:80px}.lesson-preview-modal .modal-close{position:relative;inset:auto}.st-topbar{position:relative!important;display:flex!important;gap:10px}body{min-height:100vh}</style></head><body class="${bodyClass}" ${mode === 'admin' ? 'data-portal="admin"' : ''}><main id="app-view" class="${mode === 'student' ? 'is-student-hub' : ''}">${controls}</main><script type="module">import {attachFloatingTooltips} from '/js/floatingTooltip.js'; import {syncThemeButtons} from '/js/theme-buttons.js'; syncThemeButtons(); ${setup} window.ready=true;</script></body></html>`);
      return;
    }
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!target.startsWith(root + path.sep) || url.pathname.split('/').some(part => part.startsWith('.'))) throw Error('Invalid path');
    const data = await fs.readFile(target);
    res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(target)] || 'application/octet-stream'}).end(data);
  } catch (error) {res.writeHead(404).end(error.message);}
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors = [];page.on('pageerror',error => {errors.push(error.message);console.error(error.message);});
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*',route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const tooltipState = control => control.evaluate(el => {
    const pseudo = ['::before','::after'].filter(name => {
      const style = getComputedStyle(el,name);
      return style.content && !['none','normal','""'].includes(style.content) && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    });
    const floating = [...document.querySelectorAll('[role="tooltip"]')].filter(tip => !tip.hidden && getComputedStyle(tip).display !== 'none');
    return {count:pseudo.length + floating.length,title:el.getAttribute('title'),label:el.getAttribute('aria-label'),overflow:getComputedStyle(el).overflow};
  });
  let checked = 0;
  for (const mode of ['admin','teacher','student','login','register','reset']) {
    await page.goto(`${base}/fixture.html?mode=${mode}`);await page.waitForFunction(() => window.ready);
    for (const theme of ['light','dark']) for (const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(theme => {document.documentElement.dataset.theme=theme;return import('/js/theme-buttons.js').then(m=>m.syncThemeButtons());},theme);
      for (const control of await page.locator('[data-sample]').all()) {
        await page.mouse.move(0,0);await page.locator('body').click({position:{x:1,y:1}});
        await control.hover();
        let result = await tooltipState(control);
        assert.equal(result.count,1,`${mode}/${theme}/${width}: hover ${result.label}: ${JSON.stringify(result)}`);
        assert.equal(result.title,null,`${mode}: no duplicate native title`);
        await page.mouse.move(0,0);await control.focus();
        result = await tooltipState(control);
        assert.equal(result.count,1,`${mode}/${theme}/${width}: focus ${result.label}`);
        if (await control.evaluate(el=>el.matches('.theme-toggle'))) assert.notEqual(result.overflow,'hidden','Theme tooltip is not clipped by its button');
        checked++;
      }
    }
    if (mode === 'student') {
      const guide = page.locator('#assistant-help-toggle');await guide.click();await guide.hover();
      assert.equal(await guide.getAttribute('data-tooltip'),'Isara ang mga gabay');
      assert.equal(await guide.getAttribute('title'),null);
      assert.equal((await tooltipState(guide)).count,1,'Guide label stays single after toggle');
    }
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS: ${checked} hover/focus checks with real controls/styles across admin, teacher Messages shell, student, login, registration and password reset; light/dark desktop/mobile; single CSS/JS tooltip, no native duplicates, live guide labels`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
