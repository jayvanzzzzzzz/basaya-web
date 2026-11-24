// Compare loading geometry with the actual renderers using isolated read adapters.
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'audit/class-loading-layout');
let browser;
let fixture;
const stubs = new Set(['js/state.js', 'js/firebase.js', 'js/api.js', 'js/modules.js', 'teacher/views/dashboard.js', 'teacher/views/messages.js', 'teacher/views/studentRequestsBadge.js', 'teacher/views/classDeletion.js', 'teacher/views/progressData.js', 'teacher/views/lessons.js', 'admin/views/lessonViewer.js']);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    const name = url.pathname.slice(1);
    let body, type = 'text/javascript';
    if (name === 'fixture.mjs') body = fixture;
    else if (name === 'teacher/loading-preview.html') {
      body = (await fs.readFile(path.join(root, 'teacher/index.html'), 'utf8'))
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, script => /type="module"/.test(script) ? '' : script)
        .replace(/<link\b[^>]*href="https:[^>]*>/g, '')
        .replace('</body>', `<script type="module">
          import {renderClass} from './views/classPage.js';
          import {renderAddLessonPage} from './views/addLesson.js';
          import {beginPageLoading,prepareLoadingHeader} from '/js/page-loading.js';
          import {page} from '/js/helpers.js';
          import {getDoc,state} from '/fixture.mjs';
          import '/js/theme.js';
          document.querySelector('#loading-screen').hidden=true;
          document.querySelector('#app-view').hidden=false;
          document.querySelector('[data-nav="classes"]').classList.add('active');
          window.classroom=(await getDoc()).data();
          window.showLoading=kind=>{
            const route='/classes/classroom'+(kind==='add-lesson'?'/add-lesson':'');
            location.hash=route;
            window.finish=beginPageLoading(route,'teacher:teacher',kind,{classroom:window.classroom});
            page(kind==='add-lesson'?'Add modules':'Classroom','');
            prepareLoadingHeader(kind,{classroom:window.classroom});
          };
          window.showLoaded=async kind=>{
            await (kind==='add-lesson'?renderAddLessonPage('classroom'):renderClass('classroom'));
            window.finish();
          };
          window.ready=true;
        </script></body>`);
      type = 'text/html';
    } else {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep) || name.split('/').some(part => part.startsWith('.'))) throw Error('Invalid path');
      body = await fs.readFile(target);
      const ext = path.extname(name);
      type = { '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' }[ext] || type;
      if (ext === '.js') body = body.toString().replace(/from\s+(["'])([^"']+)\1/g, (match, quote, source) => {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), source));
        return source.startsWith('https://www.gstatic.com/firebasejs/') || stubs.has(resolved) ? "from '/fixture.mjs'" : match;
      });
    }
    res.writeHead(200, { 'Content-Type': type + ';charset=utf-8' }); res.end(body);
  } catch (error) { res.writeHead(404); res.end(error.message); }
});
const measure = page => page.evaluate(() => {
  const selectors = ['#page-header', '#page-header h1', '#page-header .page-header__crumbs', '.class-overview', '.class-overview__stats', '.class-overview__stat', '.class-overview__stat b', '.class-lessons', '.class-lessons__header', '.class-lesson-tabs', '.class-lessons__list', '.class-lesson__content h3', '.lesson-workspace', '.lesson-picker__toolbar', '.lesson-picker__toolbar h2', '.module-class-sequence', '.module-class-sequence h3', '.module-class-sequence select', '.lesson-guide'];
  return Object.fromEntries(selectors.flatMap(selector => {
    const el = document.querySelector(selector); if (!el) return [];
    const { x, y, width, height } = el.getBoundingClientRect(), css = getComputedStyle(el);
    return [[selector, { x, y, width, height, fontSize: css.fontSize, fontFamily: css.fontFamily, lineHeight: css.lineHeight }]];
  }));
});
(async () => {
  const source = await fs.readFile(path.join(root, 'tools/class-design-browser.cjs'), 'utf8');
  fixture = new Function('return `' + source.match(/const fixture = `([\s\S]*?)`;/)[1] + '`')() + `
    export const getAllLessons=async()=>{},loadModules=async()=>[{id:'module-one',title:'Filipino module',lessonIds:['one','two']}];
    export const serverTimestamp=()=>0;
    export const loadClassContext=async()=>({students:[],lessons:[]}),loadStudentProgress=async()=>({}),completionOf=()=>({percent:0});
    export const DIFFICULTY_LABELS={madali:'Beginner', 'masusing aralin':'Intermediate', 'malalim na aralin':'Advanced'};
    export const openLessonViewer=()=>{};
    state.profile={role:'teacher'};
    state.allLessons.forEach(lesson=>lesson.difficulty='madali');
  `;
  await fs.mkdir(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const errors = [], comparisons = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const base = `http://127.0.0.1:${server.address().port}/teacher/loading-preview.html`;
  await page.goto(base); await page.waitForFunction(() => window.ready);
  for (const kind of ['classroom', 'add-lesson']) for (const theme of ['light', 'dark']) for (const width of process.argv.includes('--cold') ? [] : [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base); await page.waitForFunction(() => window.ready);
    await page.evaluate(({ kind, theme }) => { document.documentElement.dataset.theme = theme; window.showLoading(kind); }, { kind, theme });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.page-skeleton__shapes')).visibility === 'visible');
    assert.equal(await page.locator('.page-skeleton :is(button,input,select):not(:disabled)').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Loading overflow ${kind} ${theme} ${width}`);
    const loading = await measure(page);
    await page.screenshot({ path: path.join(out, `${kind}-${theme}-${width}-loading.png`), fullPage: true });
    await page.evaluate(kind => window.showLoaded(kind), kind);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Loaded overflow ${kind} ${theme} ${width}`);
    const loaded = await measure(page);
    await page.screenshot({ path: path.join(out, `${kind}-${theme}-${width}-loaded.png`), fullPage: true });
    for (const selector of Object.keys(loading)) {
      if (!loaded[selector]) continue;
      assert.equal(loading[selector].fontSize, loaded[selector].fontSize, `${kind} ${width} ${selector} font size`);
      assert.equal(loading[selector].fontFamily, loaded[selector].fontFamily, `${kind} ${width} ${selector} font family`);
      assert.equal(loading[selector].lineHeight, loaded[selector].lineHeight, `${kind} ${width} ${selector} line height`);
      if (!['.class-lessons', '.class-lesson__content h3'].includes(selector)) {
        assert.ok(Math.abs(loading[selector].x - loaded[selector].x) < 2, `${kind} ${width} ${selector} x ${loading[selector].x} / ${loaded[selector].x}`);
        assert.ok(Math.abs(loading[selector].y - loaded[selector].y) < 2, `${kind} ${width} ${selector} y ${loading[selector].y} / ${loaded[selector].y}`);
      }
    }
    comparisons.push({ kind, theme, width, loading, loaded });
    if (width === 1440) {
      const action = page.locator(kind === 'classroom' ? '#add-lesson' : '#add-class-module');
      await action.focus();
      assert.equal(await action.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      await action.hover();
    }
  }
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({width:320,height:1000});
    await page.evaluate(theme => {
      const button = document.createElement('button'); button.dataset.themeChoice = theme;
      document.body.append(button); button.click(); button.remove();
    }, theme);
    assert.equal(await page.evaluate(() => localStorage.getItem('basaya-theme')), theme);
    await page.reload(); await page.waitForFunction(() => window.ready);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
    await page.evaluate(() => { window.classroom = undefined; window.showLoading('classroom'); });
    await page.screenshot({path:path.join(out,`cold-${theme}.png`),fullPage:true});
    if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) console.error(await page.evaluate(() => [...document.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({class:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right})).slice(0,20)));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Direct-load skeleton fits without cached class details');
    await page.evaluate(() => window.showLoading('add-lesson'));
    assert.equal(await page.locator('#page-header h1').textContent(), 'Add modules');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
  }
  assert.deepEqual(errors, []);
  if (comparisons.length) await fs.writeFile(path.join(out, 'geometry.json'), JSON.stringify(comparisons, null, 2));
  console.log(process.argv.includes('--cold')
    ? 'PASS: direct loading without cached class details and saved theme preferences at 320px in light/dark. No database writes.'
    : 'PASS: class and Add Modules loading/loaded layouts at 1440/768/390/320 in light/dark; typography, alignment, overflow, inert placeholders, keyboard focus, hover, direct loading, and theme persistence. No database writes.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
