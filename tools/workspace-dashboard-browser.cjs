// Real landing views, routers, navigation, styles and modal; isolated data only.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'audit/workspace-dashboards');
const real = new Set([
  'admin/router.js', 'admin/views/dashboard.js', 'teacher/router.js',
  'teacher/views/landing.js', 'teacher/views/dashboard.js',
  'js/helpers.js', 'js/workspace-dashboard.js', 'js/pagination.js',
  'teacher/views/classActions.js', 'js/floatingTooltip.js', 'js/theme.js', 'js/admin-design.js', 'js/theme-buttons.js',
]);
const names = new Set();
function rewrite(source, name) {
  return source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["'];/g, (full, bindings, src) => {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), src));
    if (real.has(resolved)) return full;
    bindings.split(',').map(v => v.trim()).filter(Boolean).forEach(v => names.add(v.split(/\s+as\s+/)[0]));
    return `import {${bindings}} from '/fixture.mjs';`;
  });
}
let fixture, browser;
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://fixture').pathname).slice(1);
    let body, type = 'text/javascript';
    if (name === 'fixture.mjs' || name === 'js/state.js') body = fixture;
    else if (/^(admin|teacher)\/preview.html$/.test(name)) {
      const portal = name.split('/')[0];
      body = (await fs.readFile(path.join(root, portal, 'index.html'), 'utf8'))
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, s => /type="module"/.test(s) ? '' : s)
        .replace('</body>', `<script type="module">
          import {renderRoute} from '/${portal}/router.js';
          import '/js/theme.js';
          ${portal === 'admin' ? "import '/js/admin-design.js';" : ''}
          document.querySelector('#loading-screen').hidden=true;
          async function render(){window.ready=false;await renderRoute();window.ready=true;}
          window.addEventListener('hashchange',render);await render();
        </script></body>`);
      type = 'text/html';
    } else {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep)) throw Error('Invalid path');
      body = await fs.readFile(target);
      type = { '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(name)] || type;
      if (real.has(name)) body = rewrite(body.toString(), name);
    }
    res.writeHead(200, { 'Content-Type': type + ';charset=utf-8' }); res.end(body);
  } catch (error) { res.writeHead(404); res.end(error.message); }
});
(async () => {
  for (const name of real) rewrite(await fs.readFile(path.join(root, name), 'utf8'), name);
  const special = {
    state: `{user:{uid:'teacher',email:'ana@school.edu'},profile:{displayName:'Ana Reyes',title:'maam'},classes:[],allClasses:[],allLessons:[],teachers:[],lessons:[]}`,
    db: '{}',
    greeting: `()=>"Magandang umaga, Ma'am Reyes"`,
    getTeacherClasses: `async()=>{if(failed)throw Error('Offline');state.classes=empty?[]:classes;}`,
    getTeacherLessons: 'async()=>{}',
    getAllClasses: `async()=>{if(failed)throw Error('Offline');state.allClasses=empty?[]:classes;}`,
    getAllTeachers: `async()=>{if(failed)throw Error('Offline');state.teachers=empty?[]:[{id:'teacher',displayName:'Ana Reyes'}];}`,
    getAllLessons: `async()=>{if(failed)throw Error('Offline');state.allLessons=empty?[]:[{id:'l1',title:'Ang Alamat ng Pinya'},{id:'l2',title:'Pangngalan at Panghalip'}];}`,
    collection: '(...parts)=>parts.filter(v=>typeof v==="string").join("/")',
    query: '(ref)=>ref', where: '()=>{}',
    getCountFromServer: `async ref=>{if(failed||(partial&&ref.includes('/c2/')))throw Error('Offline');return {data:()=>({count:empty?0:ref==='users'?52:28})};}`,
    getDocs: `async ref=>{if(partial&&ref.includes('/c2/'))throw Error('Offline');return {docs:empty?[]:[{id:'l1',data:()=>({lessonId:'l1',mode:'assessment',dueAt:{toMillis:()=>Date.now()+86400000}})},{id:'l2',data:()=>({lessonId:'l2',mode:'practice',dueAt:{toMillis:()=>Date.now()+86400000}})}]};}`,
    linkMode: 'l=>l.mode', linkLessonId: 'l=>l.lessonId||l.id',
    hasUnreadChat: "id=>!empty&&id==='c1'",
    onChatSummaries: 'fn=>{window.chatChanged=fn;}',
    leaveMessages: '()=>{window.chatChanged=null;}',
    watchDashboardNotifications: `(classes,fn)=>{window.emitNotice=fn;classes.forEach(c=>fn(c.id,{className:c.className,joins:c.id==='c1'?2:0,leaves:c.id==='c2'?1:0,grading:{total:c.id==='c1'?3:0,dueSoon:1},error:partial,loading:false}));}`,
    leaveDashboardNotifications: '()=>{window.emitNotice=null;}',
    attentionMarkup: '()=>""', deletionChip: '()=>""',
    setRequestTab: '(id,kind)=>{window.requestTab={id,kind};}',
    renderMessages: 'async()=>{document.querySelector("#page-content").innerHTML="<h2>Messages</h2>";}',
    renderTeachers: 'async()=>{document.querySelector("#page-content").innerHTML="<h2>Teacher accounts</h2>";}',
  };
  fixture = `const params=new URLSearchParams(location.search),empty=params.has('empty'),partial=params.has('partial');let failed=params.has('failed');window.recover=()=>{failed=false;};
    const classes=[{id:'c1',className:'Grade 7 — Rizal',teacherId:'teacher',description:'Building confident readers, one story at a time.',classCode:'RZL123',createdAt:{seconds:3},deletionRequest:{reason:'End of school year'}},{id:'c2',className:'Grade 8 — Bonifacio',teacherId:'missing',classCode:'BNF123',createdAt:{seconds:2}},{id:'c3',className:'<unsafe> A classroom with a very long name to verify wrapping and readability on every screen size',teacherId:'teacher',classCode:'MBN123',createdAt:{seconds:1}}];\n`;
  fixture += Object.entries(special).map(([name, value]) => `export const ${name}=${value};`).join('\n');
  for (const name of names) if (!(name in special)) fixture += `\nexport const ${name}=(...args)=>{};`;
  await fs.mkdir(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  const url = portal => `http://127.0.0.1:${server.address().port}/${portal}/preview.html`;
  const ready = async portal => {
    await page.waitForFunction(() => window.ready);
    await page.locator(portal === 'admin' ? '[data-overview-stat="teachers"]' : '[data-overview-stat="reviews"]').waitFor();
    await page.waitForFunction(() => !document.querySelector('.overview-loading'));
  };
  for (const portal of ['admin', 'teacher']) {
    await page.goto(url(portal)); await ready(portal);
    assert.equal(await page.locator('[data-nav].active').count(), 1);
    assert.equal(await page.locator('[data-nav=dashboard]').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('.workspace-overview unsafe').count(), 0, 'Escape class names');
    assert.equal(await page.locator('[data-overview-stat=classes]').textContent(), '3');
    if (portal === 'admin') {
      assert.equal(await page.locator('[data-overview-stat=students]').textContent(), '52');
      assert.equal(await page.locator('.overview-panel:has(#admin-attention) .overview-row').count(), 2);
    } else {
      assert.equal(await page.locator('[data-overview-stat=students]').textContent(), '84');
      assert.equal(await page.locator('[data-overview-stat=due]').textContent(), '3', 'Practice deadlines excluded');
      assert.equal(await page.locator('[data-overview-stat=reviews]').textContent(), '3');
      assert.equal(await page.locator('[data-overview-attention] .overview-row').count(), 4);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
      for (const width of [1440, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow: ${portal}/${theme}/${width}`);
        if (width <= 860) {
          const hidden = await page.locator('.main-nav [data-nav]').evaluateAll(nodes => nodes.filter(el => { const box=el.getBoundingClientRect(); const label=el.querySelector('strong'); return box.left<0||box.right>innerWidth||getComputedStyle(label.parentElement).display==='none'; }).map(el=>el.dataset.nav));
          assert.deepEqual(hidden, [], 'All mobile destinations have visible labels and fit the viewport');
          assert.deepEqual(await page.locator('.main-nav .nav-item-text strong').evaluateAll(nodes => nodes.filter(el => el.scrollWidth > el.clientWidth+1).map(el=>el.textContent)), [], 'Mobile labels fit without truncation');
        }
        const clipped = await page.locator('.workspace-overview strong, .workspace-overview small, .overview-row__body').evaluateAll(nodes => nodes.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
        assert.deepEqual(clipped, [], `Readable content: ${portal}/${theme}/${width}`);
        await page.screenshot({ path: path.join(output, `${portal}-${width}-${theme}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-nav=dashboard]').focus();
    await page.mouse.move(0,0);
    await page.getByRole('tooltip').filter({hasText:'Dashboard'}).waitFor();
    await page.keyboard.press('Escape');
    if (portal === 'teacher') {
      await page.locator('#overview-create-class').focus(); await page.keyboard.press('Enter');
      await page.locator('#class-form').waitFor();
      await page.locator('[data-close]').click();
      // A live update clears the queue without duplicating urgency counts.
      await page.evaluate(() => window.emitNotice('c1', { joins: 0, grading: { total: 0 }, loading: false }));
      assert.equal(await page.locator('[data-overview-stat=reviews]').textContent(), '0');
      await page.locator('[data-request-kind=leave]').click();
      assert.deepEqual(await page.evaluate(() => window.requestTab), { id: 'c2', kind: 'leave' });
      await page.locator('[data-nav=classes]').click(); await page.locator('#class-search').waitFor();
      assert.equal(await page.locator('[data-nav].active').getAttribute('data-nav'), 'classes');
      await page.locator('#class-search').fill('Bonifacio');
      assert.equal(await page.locator('.class-card').count(), 1);
      await page.locator('[data-nav=dashboard]').click(); await ready(portal);
    }
    await page.goto(url(portal) + '?empty'); await ready(portal);
    assert.equal(await page.locator('[data-overview-stat=classes]').textContent(), '0');
    await page.screenshot({ path: path.join(output, `${portal}-empty.png`), fullPage: true });
    await page.goto(url(portal) + '?failed'); await page.locator('[data-overview-retry]').waitFor();
    assert.equal(await page.locator('.overview-empty').count(), 0, 'Failure must not look like an empty school');
    await page.screenshot({ path: path.join(output, `${portal}-error.png`), fullPage: true });
    await page.evaluate(() => window.recover());
    await page.locator('[data-overview-retry]').click(); await ready(portal);
    assert.equal(await page.locator('[data-overview-stat=classes]').textContent(), '3', 'Retry recovers real data loads');
  }
  await page.goto(url('teacher') + '?partial'); await ready('teacher');
  assert.equal(await page.locator('[data-overview-stat=students]').textContent(), '—');
  assert.equal(await page.locator('[data-overview-stat=due]').textContent(), '—');
  assert.equal(await page.locator('[data-overview-stat=reviews]').textContent(), '—');
  assert.match(await page.locator('[data-overview-attention]').textContent(), /unavailable/);
  assert.equal(await page.locator('[data-overview-deadlines] .overview-row').count(), 2, 'Keep available deadlines');
  assert.deepEqual(errors, []);
  console.log('PASS: both real dashboards and routers; sidebar/default routes; live queues; review/deadline/enrolment counts; escaping; create class; directory search; empty/error/partial states; light/dark at 1440/1024/768/390/320. Data and other management views isolated. Screenshots: audit/workspace-dashboards');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
