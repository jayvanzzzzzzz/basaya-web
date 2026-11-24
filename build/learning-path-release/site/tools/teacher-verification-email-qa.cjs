// Browser previews and structural checks only; sends no email and uses a dummy action code.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'audit/teacher-verification-email');
let browser;
(async () => {
  const { teacherVerificationEmail } = await import(pathToFileURL(path.join(root, 'notify-api/lib/teacherVerificationEmail.js')));
  const link = 'https://basaya.onrender.com/verify-teacher.html?oobCode=preview-only-not-a-real-code&lang=en';
  const sample = teacherVerificationEmail({ name: 'Maria', email: 'maria.reyes@school.edu', link });
  assert.match(sample.text, /Hi Maria,/);
  assert.ok(sample.text.includes(link));
  assert.ok(Buffer.byteLength(sample.html) < 50000, 'Keep the transactional template compact');
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'preview.html'), sample.html);
  await fs.writeFile(path.join(out, 'preview.txt'), sample.text);
  browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    if (route.request().url().endsWith('/img/logo.png')) return route.fulfill({ contentType: 'image/png', body: await fs.readFile(path.join(root, 'img/logo.png')) });
    return route.abort();
  });
  for (const colorScheme of ['light', 'dark']) for (const width of [320, 390, 720]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme });
    await page.setContent(sample.html);
    await page.locator('img').evaluate(image => image.decode());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}/${colorScheme}`);
    assert.equal(await page.getByRole('link', { name: 'Verify my email' }).getAttribute('href'), link);
    assert.equal(await page.locator('a').filter({ hasText: 'preview-only' }).getAttribute('href'), link);
    assert.ok(await page.getByRole('link', { name: 'Verify my email' }).evaluate(el => el.getBoundingClientRect().height) >= 44);
    await page.screenshot({ path: path.join(out, `${width}-${colorScheme}.png`), fullPage: true });
  }
  // Verify the essential content survives clients stripping the style element and blocking images.
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.setContent(sample.html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<img\b[^>]*>/g, ''));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.getByRole('link', { name: 'Verify my email' }).isVisible());
  assert.match(await page.locator('body').innerText(), /BASAya/);
  await page.screenshot({ path: path.join(out, 'inline-only-no-images.png'), fullPage: true });
  const hostile = teacherVerificationEmail({ name: '<img src=x onerror=alert(1)> & Maria', email: 'a&b@school.edu', link });
  await page.setContent(hostile.html);
  assert.equal(await page.locator('[onerror],script,form,iframe').count(), 0);
  assert.ok((await page.locator('body').innerText()).includes('<img src=x onerror=alert(1)> & Maria'));
  const long = teacherVerificationEmail({ name: 'Maria Ana', email: 'a.very.long.teacher.email.address.for.mobile.layout.testing@school.example.edu', link: link + 'x'.repeat(180) });
  await page.setContent(long.html);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Long recipient/link overflow');
  assert.deepEqual(errors, []);
  console.log('PASS: personalized HTML/text, exact verification links, escaped input, desktop/mobile light/dark previews, long addresses, inline-only fallback, blocked images, and no scripts. No real emails sent.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
