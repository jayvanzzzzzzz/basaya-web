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
];
(async () => {
 const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const page = await browser.newPage();
 for (const portal of ['admin','teacher']) {
  const html = fs.readFileSync(path.join(root,portal,'index.html'),'utf8');
  const css = [...html.matchAll(/href="\.\.\/(css\/[^"?]+)(?:\?[^"]*)?"/g)].map(m=>fs.readFileSync(path.join(root,m[1]),'utf8')).join('\n');
  for (const theme of ['light','dark']) for (const width of [1440,768,390]) {
   await page.setViewportSize({width,height:900});
   await page.setContent(`<html data-theme="${theme}"><style>${css}</style><body data-portal="${portal}"><main id="page-content">${pairs.map(([c,b,a])=>`<p><button class="${c}" ${a}>Selected ${b?`<span class="${b}">123</span>`:''}</button></p>`).join('')}</main></body></html>`);
   await page.waitForTimeout(300);
   const issues = (await audit(page)).filter(i=>i.type==='contrast');
   assert.deepEqual(issues,[],`${portal}/${theme}/${width} contrast`);
   if(width===1440) {fs.mkdirSync(path.join(root,'audit/ribbon-contrast'),{recursive:true});await page.screenshot({path:path.join(root,`audit/ribbon-contrast/${portal}-${theme}.png`)});}
  }
 }
 console.log('PASS: active ribbon labels and counts meet AA contrast in both portals, both themes, and desktop/tablet/mobile widths.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
