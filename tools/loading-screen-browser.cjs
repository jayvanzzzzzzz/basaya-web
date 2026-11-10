// Exercise the real page markup while startup is delayed; no Firebase requests.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'audit/loading-screen');
const baseline = process.argv.includes('--baseline');
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) throw Error('Invalid path');
    let content = await fs.readFile(file);
    if (file.endsWith('.html')) {
      content = content.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<link\b[^>]*href="https:[^>]*>/gi, '');
    } else if (baseline && pathname === '/css/components/loading.css') {
      content = execFileSync('git', ['show', 'HEAD:css/components/loading.css'], { cwd: root });
    }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
let browser;
const coverage = page => page.evaluate(() => {
  const loader = document.querySelector('#loading-screen');
  const rect = loader.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height,
    viewportWidth: innerWidth, viewportHeight: innerHeight, scroll: scrollY,
    covered: [[2, 2], [innerWidth / 2, innerHeight / 2], [innerWidth - 2, innerHeight - 2]]
      .every(([x, y]) => loader.contains(document.elementFromPoint(x, y))) };
});
const assertCovered = value => {
  assert.equal(value.top, 0, 'Loader must stay at the viewport top');
  assert.equal(value.left, 0);
  assert.equal(value.width, value.viewportWidth);
  assert.equal(value.height, value.viewportHeight);
  assert.equal(value.covered, true, 'Dashboard must never show through the loader');
};
(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  let checked = 0;
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const page = await context.newPage();
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      for (const portal of ['student', 'teacher', 'admin', 'login']) {
        const label = `${portal}-${theme}-${viewport.width}`;
        await page.goto(`http://127.0.0.1:${server.address().port}/${portal === 'login' ? 'index.html' : `${portal}/`}`);
        await page.evaluate(theme => {
          document.documentElement.dataset.theme = theme;
          const shell = document.querySelector('#app-view, #login-view');
          shell.hidden = false; // Startup reveals the shell before the awaited route completes.
          const content = document.querySelector('#page-content') || shell;
          const tall = document.createElement('div');
          tall.style.height = '3000px';
          tall.innerHTML = '<button id="dashboard-probe">Dashboard action</button>';
          content.append(tall);
        }, theme);
        if (!baseline) {
          assertCovered(await coverage(page));
          assert.equal(await page.locator('#dashboard-probe').isVisible(), false, label);
        }
        await page.mouse.move(viewport.width / 2, viewport.height / 2);
        await page.mouse.wheel(0, 1400);
        await page.keyboard.press('End');
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.synthesizeScrollGesture', { x: viewport.width / 2, y: viewport.height * .75,
          yDistance: -300, gestureSourceType: 'touch', speed: 3000 });
        await cdp.detach();
        if (baseline) await page.screenshot({ path: path.join(artifacts, 'before.png') });
        assertCovered(await coverage(page));
        assert.equal((await coverage(page)).scroll, 0, `${label}: scroll locked during startup`);
        await page.screenshot({ path: path.join(artifacts, `${label}.png`) });
        await page.evaluate(() => { document.querySelector('#loading-screen').hidden = true; });
        await page.locator('#dashboard-probe').waitFor({ state: 'visible', timeout: 3000 });
        assert.equal(await page.locator('#dashboard-probe').isVisible(), true, label);
        await page.evaluate(() => scrollTo({ top: 800, behavior: 'instant' }));
        assert.ok((await coverage(page)).scroll > 0, `${label}: scrolling returns after startup`);
        await page.evaluate(() => { document.querySelector('#loading-screen').hidden = false; });
        assertCovered(await coverage(page)); // Auth can restart while the dashboard is scrolled.
        const before = (await coverage(page)).scroll;
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(100);
        assert.equal((await coverage(page)).scroll, before, `${label}: repeated loading stays locked`);
        if (['student', 'teacher'].includes(portal) && viewport.height === 390) {
          await page.evaluate(() => {
            const message = document.createElement('p');
            message.textContent = 'Startup error details. '.repeat(200);
            document.querySelector('#loading-screen').replaceChildren(message);
          });
          await page.mouse.wheel(0, 600);
          await page.waitForFunction(() => document.querySelector('#loading-screen').scrollTop > 0);
          assertCovered(await coverage(page)); // Long startup errors remain readable inside the overlay.
        }
        if (portal === 'student') {
          await page.evaluate(() => { document.querySelector('#loading-screen').hidden = true; scrollTo(0, 0); });
          const source = await fs.readFile(path.join(root, 'student/views/activity.js'), 'utf8');
          const loading = source.match(/<div class="st-loading"[^>]*>[\s\S]*?<\/div>/)[0];
          for (const state of ['inline', 'focus']) {
            await page.locator('#page-content').evaluate((el, { loading, state }) => {
              el.innerHTML = state === 'focus' ? '<div class="st-focus-loading">' + loading + '</div>' : loading;
            }, { loading, state });
            assert.equal(await page.locator('.st-loading').getAttribute('role'), 'status');
            assert.equal(await page.locator('.st-loading').evaluate(el => getComputedStyle(el, '::after').content), '"Inihahanda ang gawain..."');
            assert.equal(await page.locator('.st-loading > span').first().evaluate(el => getComputedStyle(el).animationName), 'none');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.screenshot({ path: path.join(artifacts, `student-${state}-${theme}-${viewport.width}.png`) });
          }
        }
        checked++;
      }
      await context.close();
    }
  }
  console.log(`PASS: ${checked} portal/theme/viewport combinations; wheel, touch, keyboard, scroll restoration and repeated loading.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  server.close();
});
