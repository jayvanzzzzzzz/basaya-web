// Exercise the real teacher logout handler and dialog with isolated authentication.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
let browser;
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://fixture').pathname).slice(1);
    let body, type;
    if (name === 'teacher/preview.html') {
      const app = await fs.readFile(path.join(root, 'teacher/app.js'), 'utf8');
      const handler = app.slice(app.indexOf('$("#logout-button")'), app.indexOf('window.addEventListener("hashchange"'));
      body = (await fs.readFile(path.join(root, 'teacher/index.html'), 'utf8'))
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
        .replace('</body>', `<script type="module">
          import {confirmTeacherLogout} from '/js/teacher-logout.js';
          const $ = s => document.querySelector(s);
          window.result = {signOuts:0, remembered:0, destination:null, toast:null};
          const auth = {currentUser:{uid:'fixture'}}, state = {profile:{}};
          const rememberAccount = () => result.remembered++;
          const signOut = async () => {result.signOuts++; if(window.failSignOut) throw Error('Fixture failure');};
          const toast = message => result.toast = message;
          const window = {location:{replace: value => globalThis.result.destination = value}};
          ${handler}
          $('#loading-screen').hidden = true; $('#app-view').hidden = false;
          globalThis.ready = true;
        </script></body>`).replace('const window =', 'const navigationWindow =').replace('window.location.replace("../index.html");', 'navigationWindow.location.replace("../index.html");');
      type = 'text/html';
    } else {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep) || !/^(css\/|img\/|js\/teacher-logout.js$)/.test(name)) { res.writeHead(404); res.end(); return; }
      body = await fs.readFile(target);
      type = {'.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)] || 'application/octet-stream';
    }
    res.writeHead(200, {'Content-Type':type + ';charset=utf-8'}); res.end(body);
  } catch (error) {res.writeHead(500); res.end(error.message);}
});
(async () => {
  await fs.mkdir(path.join(root, 'audit/teacher-logout'), {recursive:true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page = await browser.newPage({reducedMotion:'reduce'});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/teacher/preview.html`);
  await page.waitForFunction(() => globalThis.ready);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({width,height:900});
    for (const theme of ['light','dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await page.locator('#logout-button').click();
      assert.equal(await page.locator('dialog[open]').count(), 1);
      assert.equal(await page.evaluate(() => result.signOuts), 0);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('basayaSignedOut')), null);
      assert.equal(await page.locator('[autofocus]').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('.teacher-logout-dialog__confirm').evaluate(el => el === document.activeElement), true);
      const bounds = await page.locator('dialog').boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 900);
      await page.screenshot({path:path.join(root, `audit/teacher-logout/${width}-${theme}.png`)});
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog') && !document.querySelector('#logout-button').disabled);
      assert.equal(await page.locator('#logout-button').evaluate(el => el === document.activeElement), true);
    }
  }
  await page.locator('#logout-button').click();
  await page.getByRole('button',{name:'Stay signed in',exact:true}).click();
  assert.equal(await page.evaluate(() => result.remembered),0);
  await page.locator('#logout-button').click();
  await page.mouse.click(1,1);
  await page.waitForFunction(() => !document.querySelector('dialog'));
  await page.evaluate(() => globalThis.failSignOut = true);
  await page.locator('#logout-button').click();
  await page.locator('.teacher-logout-dialog__confirm').click();
  await page.waitForFunction(() => result.toast !== null);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('basayaSignedOut')),null);
  assert.equal(await page.locator('#logout-button').isDisabled(),false);
  await page.evaluate(() => globalThis.failSignOut = false);
  await page.locator('#logout-button').click();
  await page.locator('.teacher-logout-dialog__confirm').click();
  await page.waitForFunction(() => result.destination !== null);
  assert.equal(await page.evaluate(() => result.destination),'../index.html');
  assert.equal(await page.evaluate(() => result.signOuts),2);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('basayaSignedOut')),'true');
  assert.deepEqual(errors,[]);
  console.log('PASS: cancel, Escape, backdrop, focus trap/return, confirmation, sign-out failure/retry, light/dark and 1440/768/390/320 layouts. Screenshots: audit/teacher-logout');
})().catch(error => {console.error(error);process.exitCode = 1;}).finally(async () => {await browser?.close();server.close();});
