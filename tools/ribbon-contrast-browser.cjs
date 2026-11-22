const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const audit = require('./text-readability-audit.cjs');
const root = path.resolve(__dirname, '..');
const pairs = [
 ['student-ribbon', 'student-ribbon__count', 'aria-pressed="true"'],
 ['lesson-picker__ribbon', 'lesson-picker__ribbon-count', 'aria-pressed="true"'],
 ['lecture-page-ribbon active', '', ''],
 ['admin-class-filter is-active', 'admin-class-filter__count', 'data-empty'],
 ['admin-class-filter admin-class-filter--alert is-active', 'admin-class-filter__count', ''],
 ['admin-lesson-filter is-active', 'admin-lesson-filter__count', ''],
 ['class-lesson-tab is-active', 'class-lesson-tab__count', ''],
 ['request-ribbon request-ribbon--leave', 'request-ribbon__count', 'aria-selected="true"'],
 ['reading-filter-button', 'reading-filter-count', 'aria-pressed="true"'],
];
const wrappers = ['student-ribbons', 'teacher-add-lesson-page lesson-picker__ribbons',
 'lecture-page-ribbons', 'admin-class-filters', 'admin-class-filters',
 'admin-lesson-filters', 'teacher-class-page class-lesson-tabs',
 'students-workspace request-ribbons', 'reading-review reading-filter-ribbon'];
(async () => {
 const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const page = await browser.newPage();
 for (const portal of ['admin','teacher']) {
  const html = fs.readFileSync(path.join(root,portal,'index.html'),'utf8');
  const css = [...html.matchAll(/href="\.\.\/(css\/[^"?]+)(?:\?[^"]*)?"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n');
  for (const theme of ['light','dark']) for (const width of [1440,768,390,320]) {
   await page.setViewportSize({width,height:900});
   await page.setContent(`<html data-theme="${theme}"><style>${css}</style><body data-portal="${portal}"><main id="page-content">${pairs.map(([c,b,a],i)=>`<section class="${wrappers[i]}" style="margin:12px;max-width:calc(100% - 24px)"><button data-selected class="${c}" ${a}>Selected ${b?`<span class="${b}">123</span>`:''}</button><button class="${c.replace(/ is-active| active/g,'')}" ${a.replace('true','false')}>Other ${b?`<span class="${b}">0</span>`:''}</button></section>`).join('')}</main></body></html>`);
   await page.waitForTimeout(300);
   const issues = (await audit(page)).filter(i=>i.type==='contrast');
   assert.deepEqual(issues,[],`${portal}/${theme}/${width} contrast`);
   const expected = theme === 'dark' ? 'rgb(192, 188, 241)' : 'rgb(31, 37, 89)';
   for (const selected of await page.locator('[data-selected]').all()) {
    assert.equal(await selected.evaluate(el=>getComputedStyle(el).backgroundColor),expected);
    await selected.hover();
    assert.equal(await selected.evaluate(el=>getComputedStyle(el).backgroundColor),expected,'selection survives hover');
    await selected.focus();
    assert.equal(await selected.evaluate(el=>getComputedStyle(el).outlineStyle),'solid','visible keyboard focus');
   }
   await page.mouse.move(0,0);
   await page.evaluate(()=>document.activeElement.blur());
   await page.evaluate(()=>document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark');
   await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
   assert.equal(await page.locator('[data-selected]').first().evaluate(el=>getComputedStyle(el).backgroundColor),expected,'theme toggle updates');
   fs.mkdirSync(path.join(root,'audit/ribbon-visibility'),{recursive:true});
   await page.screenshot({path:path.join(root,`audit/ribbon-visibility/${portal}-${theme}-${width}.png`),fullPage:true});
  }
 }
 console.log('PASS: selected and unselected ribbon contrast, solid selection, hover, keyboard focus and theme switching in both portals/themes at 1440, 768, 390 and 320px.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
