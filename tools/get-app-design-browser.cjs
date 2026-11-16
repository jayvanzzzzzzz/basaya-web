// Exercise the real download dialogs in isolation from authentication and external services.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'audit/get-app-design');
const download = 'https://github.com/jayvanzzzzzzz/BaSaya/releases/latest/download/BaSaya.apk';
let browser;
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://local').pathname).slice(1) || 'index.html';
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    let body = await fs.readFile(file);
    if (name === 'index.html') body = body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
      .replace('</body>', '<script type="module">import "/js/get-app.js";document.querySelector("#loading-screen").hidden=true;document.querySelector("#login-view").hidden=false;window.ready=true;</script></body>');
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream') + ';charset=utf-8' });
    res.end(body);
  } catch (error) { res.writeHead(404); res.end(error.message); }
});
async function layout(page, selector) {
  const issues = await page.locator(selector).evaluate(root => {
    const issues = [], bounds = root.getBoundingClientRect();
    if (bounds.x < -1 || bounds.y < -1 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1) issues.push('View outside viewport');
    if (root.scrollWidth > root.clientWidth + 1) issues.push('Horizontal overflow');
    for (const el of root.querySelectorAll('*')) {
      if (el.closest('[hidden],.sr-only,svg')) continue;
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      if (!rect.width || !rect.height || style.visibility === 'hidden') continue;
      if (['hidden', 'clip'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 1) issues.push('Clipped: ' + el.className);
      if (el.matches('button,a') && (rect.height < 43 || rect.width < 43) && !el.matches('.get-app__file')) issues.push('Small touch target: ' + el.className);
      if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !el.matches('kbd')) {
        const range = document.createRange(); range.selectNodeContents(el);
        for (const r of range.getClientRects()) if (r.left < bounds.left - 1 || r.right > bounds.right + 1) issues.push('Text outside view: ' + el.className);
      }
    }
    return issues;
  });
  assert.deepEqual(issues, [], selector);
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => window.ready);
  const trigger = page.locator('.get-app-trigger[data-get-app-open]');
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1440, 1000], [1024, 768], [768, 1024], [390, 844], [320, 760], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.reload();
    await page.waitForFunction(() => window.ready);
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await trigger.click();
    assert.equal(await page.locator('.get-app__download').getAttribute('href'), download);
    await layout(page, '.get-app__card');
    await page.keyboard.press('Tab');
    await page.locator('.get-app__close').focus();
    assert.equal(await page.locator('.get-app__close').evaluate(el => getComputedStyle(el, '::after').opacity), '1');
    await page.locator('.get-app__card').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: path.join(out, `download-${width}-${theme}.png`) });
    try { await page.locator('[data-get-app-present]').click({ timeout: 5000 }); }
    catch (error) {
      await page.screenshot({ path: path.join(out, 'failure.png') });
      console.log(await page.locator('#get-app').evaluate(el => ({ open: el.open, classes: el.className, hidden: el.querySelector('.get-app__card').hidden, present: el.querySelector('[data-get-app-presenter]').hidden, active: document.activeElement.outerHTML })));
      throw error;
    }
    assert.ok(await page.locator('.get-app__card').isHidden());
    assert.equal(await page.locator('#get-app').getAttribute('aria-labelledby'), 'get-app-present-title');
    await layout(page, '.get-app__present');
    const fit = await page.locator('.get-app__present').evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight, children: [...el.children].map(e => [e.className,e.getBoundingClientRect().height]), qr: el.querySelector('.get-app__present-qr').getBoundingClientRect().width }));
    assert.ok(fit.scroll <= fit.height + 1, 'Classroom view fits vertically: ' + theme + ' ' + width + 'x' + height + ' ' + JSON.stringify(fit));
    const qr = await page.locator('.get-app__present-qr').boundingBox();
    assert.ok(Math.abs(qr.width - qr.height) < 1, 'Square QR');
    const image = page.locator('.get-app__present-qr img');
    assert.ok(await image.evaluate(el => el.complete && el.naturalWidth > 0), 'QR asset loaded');
    await page.screenshot({ path: path.join(out, `big-qr-${width}-${theme}.png`) });
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await page.evaluate(() => !!document.activeElement.closest('[data-get-app-presenter]') || document.activeElement.id === 'get-app'), 'Focus stays in active dialog');
    }
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('.get-app__card').isVisible());
    assert.ok(await page.locator('[data-get-app-present]').evaluate(el => el === document.activeElement));
    await page.keyboard.press('Escape');
    await page.locator('#get-app').waitFor({ state: 'hidden' });
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await trigger.click();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copiedDownload = value; } } }));
  await page.locator('[data-get-app-copy]').click();
  assert.equal(await page.evaluate(() => window.copiedDownload), download);
  assert.equal(await page.locator('[data-get-app-status]').innerText(), 'Download link copied.');
  await page.evaluate(() => navigator.clipboard.writeText = async () => { throw Error('Unavailable'); });
  await page.locator('[data-get-app-copy]').click();
  assert.equal(await page.evaluate(() => getSelection().toString()), download);
  assert.ok(await page.locator('.get-app__link code').isVisible());
  await layout(page, '.get-app__card');
  await page.locator('[data-get-app-present]').click();
  await page.locator('[data-get-app-present-close]').click();
  await page.locator('[data-get-app-close]').click();
  await page.locator('#get-app').waitFor({ state: 'hidden' });
  await trigger.click(); await page.mouse.click(4, 4);
  await page.locator('#get-app').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.get-app__card').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await trigger.click(); await page.waitForTimeout(280);
  assert.equal(await page.locator('.get-app__card').evaluate(el => getComputedStyle(el).animationDuration), '0.22s');
  await page.locator('[data-get-app-close]').click();
  await page.locator('#get-app').waitFor({ state: 'hidden' });
  for (let i = 0; i < 4; i++) {
    await trigger.click();
    await page.locator('[data-get-app-present]').click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.locator('#get-app').waitFor({ state: 'hidden' });
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
  }
  assert.deepEqual(errors, []);
  console.log('PASS: 24 dialog/theme/viewport layouts, QR asset and square dimensions, classroom view fits vertically, download target, active-view keyboard focus, Escape/back/close/backdrop, opener focus restoration, copy success/fallback, reduced motion, entrance animation and repeated reopening after rapid Escape. No live authentication or downloads. Screenshots: audit/get-app-design');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
