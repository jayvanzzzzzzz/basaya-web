// Reproduce an obsolete theme controller without contacting authentication services.
const fs = require('node:fs/promises'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://local').pathname.slice(1);
    if (!name) return res.writeHead(200, {'Content-Type':'text/html'}).end('<button data-theme-toggle></button><button data-theme-choice="light">Light</button><button data-theme-choice="dark">Dark</button>');
    const target = path.resolve(root, name);
    if (!target.startsWith(root + path.sep)) throw Error('Invalid path');
    let body = await fs.readFile(target, 'utf8');
    if (name === 'teacher/views/accountSettings.js' || name === 'admin/views/account.js') {
      // Keep the real theme import; isolate unrelated Firebase imports. Rendering
      // is covered elsewhere; this regression specifically exercises ESM linking.
      body = body.replace(/import[\s\S]*?from\s+["']([^"']+)["'];/g, (line, url) => url.includes('theme') ? line : '');
    }
    res.writeHead(200, {'Content-Type':'text/javascript'}).end(body);
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const p = await browser.newPage({reducedMotion:'reduce'});
    await p.goto('http://127.0.0.1:' + server.address().port);
    await p.route('**/js/theme.js', route => route.fulfill({contentType:'text/javascript',body:'/* Old cached controller: no named exports. */'}));
    assert.deepEqual(await p.evaluate(async () => {
      const teacher = await import('/teacher/views/accountSettings.js');
      const admin = await import('/admin/views/account.js');
      return [typeof teacher.renderAccountSettings, typeof admin.renderAccount];
    }), ['function','function']);
    await p.unroute('**/js/theme.js');
    await p.evaluate(async () => { document.documentElement.dataset.theme='light'; await import('/js/theme.js?fresh'); });
    const toggle = p.locator('[data-theme-toggle]');
    assert.equal(await toggle.getAttribute('aria-label'), 'Switch to dark mode');
    await toggle.click();
    assert.equal(await p.evaluate(() => localStorage.getItem('basaya-theme')), 'dark');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    await p.locator('[data-theme-choice="light"]').click();
    assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal(await p.locator('[data-theme-choice="light"]').getAttribute('aria-pressed'), 'true');
    await p.reload();
    assert.equal(await p.evaluate(() => localStorage.getItem('basaya-theme')), 'light');
    console.log('PASS: teacher/admin account modules link with an obsolete theme controller; toggles, choices, accessibility labels and saved preferences work.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode=1; });
