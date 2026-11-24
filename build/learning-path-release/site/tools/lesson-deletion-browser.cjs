// Test the real lesson editor against synthetic local adapters; never write lesson data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'audit/lesson-deletion');
const fixtures = `
export const state = {allLessons:[]}, db = {};
export const doc = (...args) => args, collection = (...args) => args;
export const getDocs = async () => ({docs:[]}), getAllLessons = async () => {};
const noWrite = () => {throw Error('Unexpected data write during UI test');};
export const addDoc=noWrite, deleteDoc=noWrite, setDoc=noWrite, updateDoc=noWrite, writeBatch=noWrite, postToApi=noWrite, saveSpeech=noWrite;
export const generateSpeech=async()=>{window.audioCalls=(window.audioCalls||0)+1;if(window.audioHold)await new Promise(resolve=>window.releaseAudio=resolve);if(window.audioFailure)throw Error('Synthetic audio failure');return {blob:new Blob(['synthetic audio'],{type:'audio/mpeg'}),wordStarts:[0]};};
export const serverTimestamp = () => 0, setButtonSaving = () => {};
export const lookupWord = async () => ({word:'test'}), syllablesFor = async word => word;
export const openWordModal = () => {}, openLessonViewer = () => {}, openDeleteLesson = () => {};
export const confirmDuplicateTitle = async () => true, findDuplicate = () => null, sameTitle = () => false;
export const loadLessonSections = async () => window.sections;
`;
const realModules = new Set(['../../js/action-confirmation.js', '../../js/floatingTooltip.js', '../../js/helpers.js', '../../js/field-errors.js', '../../js/syllables.js', '../../js/pagination.js', './gameLevels.js', './missingChecklist.js', './pronunciationPages.js', './lessonMediaPlayer.js']);
let browser;
const server = http.createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://local').pathname.slice(1);
    let body, type = 'text/javascript';
    if (name === 'fixture.mjs') body = fixtures;
    else if (name === 'fixture.html') {
      const admin = await fs.readFile(path.join(root, 'admin/index.html'), 'utf8');
      const styles = [...admin.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(match => match[0].replaceAll('../', '/')).filter(tag => !tag.includes('https:')).join('');
      body = `<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body data-portal="admin"><div id="app-view"></div><div id="toast"></div><template id="modal-template"><div class="modal-backdrop"><div class="modal"><button type="button" class="modal-close" aria-label="Close">×</button><div class="modal-content"></div></div></div></template><script type="module">
      import {openLessonModal} from '/admin/views/lessons.js';
      import '/js/admin-design.js';
      window.sections = {
        lectures:{pages:[{sentences:['May bahay.']}]},
        quiz:{questions:[{question:'Alin?',choices:['Bahay','Puno','Araw'],answer:0}]},
        activity:{pages:[{words:['May','bahay.'],correctIndices:[1]}]},
        pronunciation:{words:['May','bahay'],pages:[{sentence:'May bahay.',readyWords:['may','bahay']},{sentence:'May puno.',readyWords:['may']}]},
        game:[{level:1,words:['BAHAY','BAYA','HAYA']}]
      };
      const params = new URLSearchParams(location.search);
      if(params.has('legacy')) delete window.sections.pronunciation.pages;
      await openLessonModal(params.has('edit') ? {id:'test',title:'Aralin',description:'Pagsubok',difficulty:'madali'} : null);
      window.ready=true;
      </script></body></html>`;
      type = 'text/html';
    } else {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep) || name.split('/').some(part => part.startsWith('.'))) throw Error('Invalid path');
      body = await fs.readFile(target);
      type = {'.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(name)] || type;
      if (name === 'admin/views/lessons.js') {
        body = body.toString().replace(/from\s+(["'])([^"']+)\1/g, (match, quote, source) => realModules.has(source) ? match : "from '/fixture.mjs'") + '\nexport {openLessonModal};';
      }
      if (name === 'js/helpers.js') body = body.toString().replace('from "./state.js"', 'from "/fixture.mjs"');
    }
    res.writeHead(200, {'Content-Type': type + ';charset=utf-8'}); res.end(body);
  } catch (error) { res.writeHead(404); res.end(error.message); }
});
(async () => {
  await fs.mkdir(artifacts, {recursive:true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors = []; page.on('pageerror', error => {errors.push(error.message);console.error('Fixture page error:',error.message);});
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const tab = name => page.locator(`[data-step="${name}"]`).click();
  const checkAudioButton = async (button, row) => {
    const label = await button.getAttribute('aria-label');
    assert.equal((await button.textContent()).trim(),'','Generation button is icon-only');
    assert.equal(await button.locator('.audio-generate-symbol').count(),1);
    await button.hover();await page.locator('.floating-tooltip:not([hidden])').waitFor();
    assert.equal(await page.locator('.floating-tooltip:not([hidden])').count(),1);
    assert.equal(await page.locator('.floating-tooltip:not([hidden])').textContent(),label);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>{window.audioHold=true;window.audioFailure=true;window.audioCalls=0;});
    await button.click();
    assert.equal(await button.getAttribute('aria-busy'),'true');
    assert.equal(await button.isDisabled(),true);
    assert.equal(await button.locator('.audio-generate-spinner').isVisible(),true);
    assert.equal(await button.locator('.audio-generate-spinner').evaluate(el=>getComputedStyle(el).animationName),'audio-generate-spin');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await button.locator('.audio-generate-spinner').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.evaluate(()=>window.releaseAudio());
    await page.waitForFunction(el=>!el.hasAttribute('aria-busy'),await button.elementHandle());
    assert.equal(await button.isEnabled(),true,'A failure restores the generation control');
    assert.equal(await button.getAttribute('aria-label'),label);
    assert.equal(await button.locator('.audio-generate-symbol').isVisible(),true);
    await page.evaluate(()=>{window.audioHold=false;window.audioFailure=false;});
    for(let attempt=1;attempt<=5;attempt++) {
      await button.click();
      await page.waitForFunction(el=>!el.hasAttribute('aria-busy'),await button.elementHandle());
      assert.equal((await button.textContent()).trim(),'','Success preserves the SVG-only control');
      assert.equal(await button.isDisabled(),attempt===5);
      if(attempt<5) assert.match(await button.getAttribute('aria-label'),new RegExp((5-attempt)+' left'));
    }
    assert.match(await button.getAttribute('aria-label'),/limit reached/);
    assert.match(await row.locator('.lesson-media__hint').textContent(),/Generation limit reached/);
    assert.equal(await page.evaluate(()=>window.audioCalls),6,'Failed requests do not use a generation allowance');
  };
  const remove = async (trigger, selector) => {
    const before = await page.locator(selector).count();
    await trigger(); await page.getByRole('dialog').waitFor();
    assert.equal(await page.locator(selector).count(), before, 'Nothing is removed before confirmation');
    await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await page.locator(selector).count(), before, 'Cancel preserves the item');
    await trigger(); await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(selector).count(), before, 'Escape preserves the item');
    await trigger(); await page.getByRole('dialog').waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'Remove',exact:true}).click();
    await page.waitForFunction(({selector,before}) => document.querySelectorAll(selector).length === before - 1, {selector,before});
  };
  for (const mode of ['add','edit']) {
    await page.goto(base + '/fixture.html' + (mode === 'edit' ? '?edit' : ''));
    await page.waitForFunction(() => window.ready);
    await tab('lectures');
    await page.locator('[data-sentence-text]').first().fill('May bahay.');
    await checkAudioButton(page.locator('[data-generate-sentence-audio]').first(),page.locator('[data-lecture-sentence]').first());
    await remove(() => page.locator('[data-remove-lecture-sentence]').first().click(), '[data-lecture-sentence]');
    await remove(() => page.locator('[data-remove-lecture-page]').first().click(), '[data-lecture-page]');
    await tab('quiz');
    await remove(() => page.locator('[data-remove-question]').first().click(), '[data-question]');
    await tab('activity');
    await remove(() => page.locator('[data-remove-activity-page]').first().click(), '[data-activity-page]');
    await tab('pronunciation');
    if (mode === 'add') {
      await page.locator('[data-pronunciation-sentence]').fill('May bahay.');
      await page.locator('[data-ready-word="may"]').click();
      await page.locator('[data-ready-word="bahay"]').click();
    }
    const wordTrash = page.locator('[data-pronunciation-word]:visible [data-remove-pronunciation-word]').first();
    await checkAudioButton(page.locator('[data-pronunciation-page]:visible [data-generate-pronunciation-sentence]'),page.locator('[data-pronunciation-page]:visible'));
    await checkAudioButton(page.locator('[data-pronunciation-word]:visible [data-generate-pronunciation-audio]').first(),page.locator('[data-pronunciation-word]:visible').first());
    for (const theme of ['light','dark']) for (const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await wordTrash.hover();
      await page.locator('.floating-tooltip:not([hidden])').waitFor();
      assert.equal(await page.locator('.floating-tooltip:not([hidden])').count(), 1, 'Only one tooltip is shown');
      assert.equal(await wordTrash.evaluate(el => getComputedStyle(el,'::after').content), 'none', 'No duplicate CSS tooltip');
      assert.equal(await wordTrash.getAttribute('title'), null, 'No duplicate browser tooltip');
      const box = await wordTrash.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
      assert.equal(await page.locator('.modal').evaluate(el => el.scrollWidth > el.clientWidth), false, 'No modal overflow');
      if(width !== 320) await page.screenshot({path:path.join(artifacts,`${mode}-${width}-${theme}.png`),animations:'disabled'});
    }
    // Word rows may be shared by other pages, so count the active page's visible cards.
    await remove(() => wordTrash.click(), '[data-pronunciation-word]:not([hidden])');
    if(mode === 'edit') {
      await page.locator('[data-pronunciation-page-ribbon="1"]').click();
      assert.equal(await page.locator('[data-pronunciation-word]:visible [data-pronunciation-text]').inputValue(), 'may', 'Another page keeps the shared word');
    } else await page.locator('[data-add-pronunciation-page]').click();
    await remove(() => page.locator('[data-pronunciation-page]:visible [data-remove-pronunciation-page]').click(), '[data-pronunciation-page]');
    assert.equal(await page.locator('[data-remove-pronunciation-page]').isDisabled(), true, 'Last page stays protected');
    await page.setViewportSize({width:1440,height:1000});
    await tab('game');
    if(mode === 'add') {
      await page.locator('[data-key-word]').fill('BAHAY');
      for(const word of ['BAYA','HAYA']) { await page.locator('[data-word-input]').fill(word); await page.locator('[data-word-input]').press('Enter'); }
    }
    const addGameWord = async () => { await page.locator('[data-word-input]').fill('BAYA'); await page.locator('[data-word-input]').press('Enter'); };
    await remove(() => page.locator('[data-remove-word]').first().click(), '[data-word-chip]');
    await addGameWord();
    await remove(() => page.locator('[data-word-chip]').first().press('Delete'), '[data-word-chip]');
    await addGameWord();
    await page.locator('[data-word-input]').fill('');
    await remove(() => page.locator('[data-word-input]').press('Backspace'), '[data-word-chip]');
    assert.notEqual(await page.locator('[data-word-input]').inputValue(), '', 'Confirmed Backspace returns the word for editing');
    await remove(() => page.locator('[data-remove-game-level]').first().click(), '[data-game-level]');
  }
  await page.goto(base + '/fixture.html?edit&legacy'); await page.waitForFunction(() => window.ready);
  await tab('pronunciation');
  await remove(() => page.locator('[data-remove-pronunciation-word]').first().click(), '[data-pronunciation-word]');
  await page.locator('[data-enable-pronunciation-pages]').click(); await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.locator('[data-panel="pronunciation"]').getAttribute('data-pronunciation-mode'), 'legacy');
  assert.deepEqual(errors, []);
  console.log('PASS: Add/Edit icon-only audio controls, single tooltips, loading/reduced-motion/failure/retry/limit states; confirmed deletion controls and keyboard shortcuts; light/dark desktop/mobile; no external generation or data writes');
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async () => {await browser?.close();server.close();});
