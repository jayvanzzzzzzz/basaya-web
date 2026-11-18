// Real editor and notification components with local data adapters; no database access.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'build/lesson-save-notification');
const real = new Set(['../../js/action-confirmation.js', '../../js/floatingTooltip.js', '../../js/helpers.js', '../../js/field-errors.js', '../../js/syllables.js', '../../js/pagination.js', './gameLevels.js', './missingChecklist.js', './pronunciationPages.js', './lessonMediaPlayer.js']);
const adapter = `
export const state={allLessons:[]},db={};
export const doc=(...args)=>args,collection=(...args)=>args;
export const getDocs=async()=>({docs:[],size:0}),getAllLessons=async()=>{};
const write=async()=>{window.writes=(window.writes||0)+1;};
export const updateDoc=write,setDoc=write,deleteDoc=write,addDoc=async()=>{await write();return {id:'test'};};
export const writeBatch=()=>({set(){},delete(){},commit:write});
export const serverTimestamp=()=>0,setButtonSaving=()=>{},lookupWord=async()=>({word:'bahay'}),syllablesFor=async word=>word;
export const postToApi=async()=>({missing:window.dictionaryMissing||[]});
export const generateSpeech=()=>{throw Error('Unexpected speech request');},saveSpeech=generateSpeech;
export const openWordModal=()=>{},openLessonViewer=()=>{},openDeleteLesson=()=>{};
export const confirmDuplicateTitle=async()=>true,findDuplicate=()=>null,sameTitle=()=>false;
export const loadLessonSections=async()=>window.sections;
`;
const server = http.createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://local').pathname.slice(1);
    let body, type = 'text/javascript';
    if (name === 'adapter.mjs') body = adapter;
    else if (name === 'fixture.html') {
      const index = await fs.readFile(path.join(root, 'admin/index.html'), 'utf8');
      const styles = [...index.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m => m[0].replaceAll('../', '/')).filter(s => !s.includes('https:')).join('');
      type = 'text/html';
      body = `<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body data-portal="admin"><div id="app-view"><header id="page-header"></header><div id="page-content"></div></div><div id="toast" class="toast"></div><template id="modal-template"><div class="modal-backdrop"><section class="modal"><button class="modal-close" aria-label="Close">×</button><div class="modal-content"></div></section></div></template><script type="module">
      import {openLessonModal} from '/admin/views/lessons.js';
      import {missingChecklist} from '/admin/views/missingChecklist.js';
      import '/js/admin-design.js';
      const audio=text=>({audioUrl:location.origin+'/clip.wav',text,storageKey:'fixture'});
      window.sections={lectures:{pages:[{sentences:['May bahay.'],cloudAudio:[audio('May bahay.')]}]},quiz:{questions:[{question:'Alin ang tahanan?',choices:['Bahay','Puno','Araw'],answer:0}]},activityStatus:{completion:'skipped'},gameStatus:{completion:'skipped'},pronunciation:{words:['bahay'],cloudAudio:[audio('bahay')],pages:[{sentence:'May bahay.',readyWords:['bahay'],cloudAudio:audio('May bahay.')}]}};
      window.openEditor=()=>openLessonModal({id:'test',title:'Ang ating pamayanan',description:'Pagbasa at pagbigkas',difficulty:'madali'});
      window.makeChecklist=()=>missingChecklist(document.querySelector('.modal-backdrop'),{verb:'save',onJump:()=>{window.jumped=true;}});
      await openEditor();window.ready=true;
      </script></body></html>`;
    } else {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep) || name.split('/').some(s => s.startsWith('.'))) throw Error('Invalid path');
      body = await fs.readFile(target);
      type = {'.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(name)] || type;
      if (name === 'admin/views/lessons.js') body = body.toString().replace(/from\s+(["'])([^"']+)\1/g, (m, q, s) => real.has(s) ? m : "from '/adapter.mjs'") + '\nexport {openLessonModal};';
      if (name === 'js/helpers.js') body = body.toString().replace('from "./state.js"', 'from "/adapter.mjs"');
    }
    res.writeHead(200, {'Content-Type':type + ';charset=utf-8'}); res.end(body);
  } catch (e) { res.writeHead(404); res.end(e.message); }
});
(async () => {
  await fs.mkdir(out, {recursive:true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const base = 'http://127.0.0.1:' + server.address().port, errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const layout = selector => page.locator(selector).evaluate(el => {
      const rect = e => e.getBoundingClientRect();
      const box=rect(el), icon=rect(el.querySelector('[data-icon],.notice__badge')), text=rect(el.querySelector('.missing-toast__text,.notice__text')), close=rect(el.querySelector('button'));
      return {width:box.width,right:innerWidth-box.right,bottom:innerHeight-box.bottom,inside:box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,ordered:icon.right<=text.left&&text.right<=close.left,noOverflow:el.scrollWidth<=el.clientWidth};
    });
    for (const width of [1440,768,600,390,320]) for (const theme of ['light','dark']) {
      await page.setViewportSize({width,height:1000});
      await page.goto(base+'/fixture.html');await page.waitForFunction(()=>window.ready);
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.locator('[name="description"]').fill('');
      await page.locator('#lesson-form').evaluate(form=>form.requestSubmit());
      await page.locator('.missing-toast').waitFor();
      assert.equal(await page.evaluate(()=>window.writes||0),0,'Invalid save never writes');
      const warning = await layout('.missing-toast');
      assert.ok(warning.inside&&warning.ordered&&warning.noOverflow,JSON.stringify(warning));
      await page.screenshot({path:path.join(out,`warning-${width}-${theme}.png`),animations:'disabled'});
      await page.locator('[name="description"]').fill('Pagbasa at pagbigkas');
      await page.locator('.missing-toast.is-done').waitFor();
      assert.equal(await page.locator('.missing-toast__groups').isVisible(),false);
      const ready = await layout('.missing-toast');
      assert.equal(ready.width,warning.width);assert.equal(ready.right,warning.right);assert.equal(ready.bottom,warning.bottom);
      assert.ok(ready.inside&&ready.ordered&&ready.noOverflow);
      assert.equal(await page.locator('.missing-toast__icon').evaluate(el=>getComputedStyle(el).animationName),'none','Ready respects reduced motion');
      await page.screenshot({path:path.join(out,`ready-${width}-${theme}.png`),animations:'disabled'});
      await page.locator('#lesson-form').evaluate(form=>form.requestSubmit());
      await page.locator('dialog.action-confirmation button').filter({hasText:'Save changes'}).click();
      await page.locator('.notice--success').waitFor();
      assert.equal(await page.locator('.modal-backdrop,.missing-toast').count(),0,'Saving removes the editor and its checklist');
      assert.equal(await page.locator('.notice').count(),1,'One save result');
      assert.ok(await page.evaluate(()=>window.writes>0));
      const saved = await layout('.notice');
      assert.equal(saved.width,ready.width);assert.equal(saved.right,ready.right);assert.equal(saved.bottom,ready.bottom);
      assert.ok(saved.inside&&saved.ordered&&saved.noOverflow);
      await page.screenshot({path:path.join(out,`saved-${width}-${theme}.png`),animations:'disabled'});
    }
    // Long dictionary feedback remains readable after a successful save.
    await page.evaluate(async()=>{document.querySelector('.notice-stack').remove();window.dictionaryMissing=['napakahabangsalitaparasapagsubok'.repeat(4)];await openEditor();});
    await page.locator('#lesson-form').evaluate(form=>form.requestSubmit());
    await page.locator('dialog.action-confirmation button').filter({hasText:'Save changes'}).click();
    await page.locator('.notice--info').waitFor();
    const info=await layout('.notice');assert.ok(info.inside&&info.ordered&&info.noOverflow);
    await page.screenshot({path:path.join(out,'dictionary-feedback-320.png'),animations:'disabled'});
    // Exercise animated shrink, warning restoration and rapid dismiss/reopen.
    await page.evaluate(async()=>{document.querySelector('.notice-stack').remove();await openEditor();window.checklist=makeChecklist();window.missing=Array.from({length:20},(_,i)=>({group:'Lecture',label:'Sentence '+i}));checklist.show(missing);});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(async()=>{await Promise.all(document.querySelector('.missing-toast').getAnimations({subtree:true}).map(a=>a.finished));checklist.update([]);await Promise.all(document.querySelector('.missing-toast').getAnimations({subtree:true}).map(a=>a.finished));});
    assert.ok((await layout('.missing-toast')).inside);
    await page.evaluate(async()=>{checklist.update(missing);await Promise.all(document.querySelector('.missing-toast').getAnimations({subtree:true}).map(a=>a.finished));});
    assert.equal(await page.locator('[data-jump]').count(),20);
    await page.locator('[data-jump]').first().click();assert.equal(await page.evaluate(()=>window.jumped),true);
    await page.locator('[data-close-checklist]').click();
    await page.evaluate(()=>checklist.show(missing.slice(0,1)));
    await page.waitForFunction(()=>document.querySelectorAll('.missing-toast').length===1);
    assert.equal(await page.locator('[data-jump]').count(),1);
    await page.evaluate(()=>checklist.update([]));await page.locator('.missing-toast').waitFor({state:'detached'});
    assert.deepEqual(errors,[]);
    console.log('PASS: warning → corrected → confirmed save at 1440/768/600/390/320px in light/dark; stable width and anchors, aligned controls, reduced motion, long dictionary feedback, animated resize, warning restoration, jump, dismiss/reopen and auto-dismiss. Local adapters only; no database writes.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
