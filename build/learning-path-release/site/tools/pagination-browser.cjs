const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'audit/pagination');
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/fixture') {
      const portal = ['teacher', 'student', 'admin'].includes(url.searchParams.get('portal')) ? url.searchParams.get('portal') : 'teacher';
      const index = await fs.readFile(path.join(root, portal, 'index.html'), 'utf8');
      const css = [...index.matchAll(/<link\b[^>]*href="(\.\.\/css\/[^"?]+)[^"]*"[^>]*>/g)].map(m => `<link rel="stylesheet" href="${m[1].replace('..', '')}">`).join('');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pagination verification</title>${css}<style>body{padding:16px}main{max-width:1100px;margin:auto}.test-rows{list-style:none;margin:0;padding:0}.test-rows li{padding:4px 12px}.pagination{margin:16px 0}input[data-search]{max-width:100%}</style><body data-portal="${portal}"><main class="${portal === 'admin' ? 'admin-workspace' : portal === 'student' ? 'st-dict' : 'students-workspace'}"><h1>Pagination</h1><label>Search <input data-search></label><section><ul class="test-rows" id="rows"></ul></section><section><ul class="test-rows" id="other"></ul></section></main><script type="module">
        import {paginate} from '/js/pagination.js';
        const rows=document.querySelector('#rows'),other=document.querySelector('#other'),search=document.querySelector('[data-search]');
        rows.innerHTML=Array.from({length:120},(_,i)=>'<li>Item '+(i+1)+'</li>').join('');
        other.innerHTML=Array.from({length:80},(_,i)=>'<li>Other '+(i+1)+'</li>').join('');
        search.addEventListener('input',()=>{for(const row of rows.children)row.hidden=!row.textContent.toLowerCase().includes(search.value.toLowerCase())});
        window.changes=[];
        window.pager=paginate({rows:()=>[...rows.children],after:rows,search,onChange:s=>changes.push(s),text:${portal === 'student' ? `{jump:'Pumunta sa pahina',jumpRange:p=>'Maglagay ng pahina mula 1 hanggang '+p+'.',go:'Pumunta',cancel:'Kanselahin'}` : '{}'}});
        paginate({rows:()=>[...other.children],after:other});
        window.ready=true;
      </script></body></html>`);
      return;
    }
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!target.startsWith(root + path.sep) || !/\.(css|js|svg|png|woff2?)$/.test(target)) throw new Error('Invalid path');
    res.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    res.end(await fs.readFile(target));
  } catch { res.writeHead(404); res.end(); }
});
async function main() {
  await fs.mkdir(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    for (const portal of ['teacher', 'student', 'admin']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/fixture?portal=${portal}`);
      await page.waitForFunction(() => window.ready);
      const nav = page.locator('.pagination').first();
      const jump = nav.locator('.pagination__jump');
      const input = jump.locator('input');
      assert.deepEqual(await nav.locator('[data-page]').evaluateAll(nodes => nodes.map(n => n.dataset.page)), ['prev', '1', '2', '3', '4', '12', 'next']);
      assert.equal(await nav.locator('[data-page-jump]').count(), 1);
      await nav.locator('[data-page-jump]').click();
      assert.equal(await input.evaluate(el => el === document.activeElement), true);
      for (const invalid of ['0', '13', '1.5', '']) {
        await input.fill(invalid); await input.press('Enter');
        assert.equal(await input.getAttribute('aria-invalid'), 'true');
        assert.equal(await nav.locator('[aria-current="page"]').innerText(), '1');
        assert.ok(await nav.locator('.pagination__jump-error').isVisible());
      }
      await input.fill('6'); await input.press('Enter');
      assert.equal(await nav.locator('[aria-current="page"]').innerText(), '6');
      assert.equal(await page.locator('#rows > li:not([data-paged-out])').first().innerText(), 'Item 51');
      assert.equal(await nav.locator('[data-page-jump]').count(), 2);
      assert.equal(await page.locator('.pagination').nth(1).locator('[aria-current="page"]').innerText(), '1');
      const gaps = nav.locator('[data-page-jump]');
      await gaps.last().click(); await input.press('Escape');
      assert.equal(await jump.isVisible(), false);
      assert.equal(await gaps.last().evaluate(el => el === document.activeElement), true);
      await gaps.first().click(); await nav.locator('[data-jump-cancel]').click();
      assert.equal(await jump.isVisible(), false);
      await gaps.last().click(); await input.fill('12'); await nav.locator('[data-jump-go]').click();
      assert.ok(await nav.locator('[data-page="next"]').isDisabled());
      assert.equal(await page.locator('#rows > li:not([data-paged-out])').first().innerText(), 'Item 111');
      await nav.locator('select').selectOption('20');
      assert.equal(await nav.locator('[aria-current="page"]').innerText(), '1');
      assert.equal(await page.locator('#rows > li:not([data-paged-out])').count(), 20);
      await nav.locator('select').selectOption('10');
      await page.locator('[data-search]').fill('Item 120');
      assert.equal(await nav.locator('[data-page-jump]').count(), 0);
      assert.ok(await nav.locator('[data-page="next"]').isDisabled());
      await page.locator('[data-search]').fill('no results');
      assert.equal(await nav.isVisible(), false);
      await page.locator('[data-search]').fill('');
      for (const theme of ['light', 'dark']) {
        await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
        for (const width of [1440, 768, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          await nav.locator('[data-page-jump]').first().click();
          await input.fill('999'); await input.press('Enter');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${portal}/${theme}/${width}: overflow`);
          assert.ok(await input.isVisible());
          await page.screenshot({ path: path.join(out, `${portal}-${theme}-${width}.png`), fullPage: true });
          await input.press('Escape');
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`${portal}: page numbers, jump validation, keyboard focus, filters, page size, independent lists and responsive themes passed.`);
    }
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

