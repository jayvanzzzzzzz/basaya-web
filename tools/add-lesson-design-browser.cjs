// Render the real teacher page with isolated local data; no Firebase writes.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'audit/add-lesson-design');
let browser;
const fixture = `
export const $ = (s,root=document) => root.querySelector(s);
export const $$ = (s,root=document) => [...root.querySelectorAll(s)];
export const safeHttpUrl = value => /^https?:\\/\\//.test(value||'')?value:'';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty = new URLSearchParams(location.search).has('empty');
export const state = {user:{uid:'teacher'},allLessons:empty?[]:Array.from({length:14},(_,i)=>({id:'lesson'+i,title:['Ang ating pamayanan','Mga pangngalan sa paligid','Pag-unawa sa maikling kuwento','Mga salitang magkasingkahulugan'][i%4]+' '+(i+1),description:i===3?'Isang masusing pagtalakay sa mga salita, pangungusap, at kuwentong bahagi ng ating pang-araw-araw na buhay.':'Tuklasin ang wikang Filipino sa pamamagitan ng pagbasa at pagsasanay.',activityType:i%2?'Quiz':'Pagbasa',difficulty:['beginner','intermediate','advanced'][i%3]}))};
export const db = {};
export const getAllLessons = async () => {};
export const doc = (...args) => args;
export const collection = (...args) => args;
export const getDoc = async () => ({exists:()=>true,id:'class',data:()=>({teacherId:'teacher',className:'Grade 7 — Rizal'})});
const sections={
 lectures:{title:'Pagbasa: Ang ating pamayanan',pages:[{sentences:['Ang <b>paaralan</b> ay bahagi ng ating pamayanan.','Sama-sama tayong nag-aaral at nagtutulungan.'],cloudAudio:[{audioUrl:'https://example.test/one.mp3'},{audioUrl:'https://example.test/two.mp3'}]}]},
 quiz:{title:'Suriin ang iyong natutuhan',questions:[{question:'Alin ang mga bahagi ng ating pamayanan?',choices:['Paaralan','Aklatan','Isang kathang-isip na lugar'],answers:[0,1],multiple:true}]},
 activity:{title:'Kilalanin ang mga pangngalan',instruction:'Piliin ang tamang salita sa pangungusap.',explanation:'Ang pangngalan ay tumutukoy sa tao, bagay, hayop, lugar, o pangyayari.',pages:[{words:['Ang','paaralan','ay','mahalaga.'],correctIndices:[1]}]},
 pronunciation:{title:'Bigkasin natin',words:['paaralan','pamayanan','pagkakaisa'],cloudAudio:[{audioUrl:'https://example.test/word.mp3'}]},
 game:{level:1,words:['BAYANI','BAYAN','IBA']}
};
export const getDocs = async ref => {
 if(sections[ref.at(-1)]) {if(window.viewerFail) throw Error('Fixture load error'); return {docs:window.viewerEmpty?[]:[{id:'content',data:()=>sections[ref.at(-1)]}]};}
 return {docs:[{id:'lesson0',data:()=>({lessonId:'lesson0',mode:'assessment'})},{id:'lesson1',data:()=>({lessonId:'lesson1',mode:'assessment'})},{id:'lesson1__practice',data:()=>({lessonId:'lesson1',mode:'practice'})}]};
};
export const serverTimestamp = () => 0;
export const writeBatch = () => {throw Error('Unexpected write during visual QA');};
export const linkMode = link => link.mode;
export const linkLessonId = link => link.lessonId;
export const practiceLinkId = id => id+'__practice';
export const readSchedule = () => ({});
export const notifyStudents = async () => {};
export const navigate = route => {location.hash=route;};
export const toast = message => {window.lastToast=message;};
export const DIFFICULTY_LABELS = {beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced'};
export const openLessonModal = () => {window.created=true;};
export {openLessonViewer} from '/admin/views/lessonViewer.js';
`;
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://local');
    const name = decodeURIComponent(url.pathname).slice(1);
    let body, type='text/javascript';
    if(name==='teacher/preview.html') {
      body=(await fs.readFile(path.join(root,'teacher/index.html'),'utf8'))
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')
        .replace('</body>',`<script type="module">import {renderAddLessonPage} from '/teacher/views/addLesson.js'; document.querySelector('#loading-screen').hidden=true; document.querySelector('#app-view').hidden=false; document.querySelector('[data-nav="classes"]').classList.add('active'); await renderAddLessonPage('class'); window.ready=true;</script></body>`);
      type='text/html';
    } else if(name==='teacher/views/addLesson.js') {
      body=(await fs.readFile(path.join(root,name),'utf8')).replace(/from\s+(["'])([^"']+)\1/g,(match,q,source)=>source.endsWith('pagination.js')||source.endsWith('lessonViewer.js')?match:"from '/fixture.mjs'");
    } else if(['admin/views/lessonViewer.js','admin/views/gameLevels.js'].includes(name)) {
      body=(await fs.readFile(path.join(root,name),'utf8')).replace(/from\s+(["'])([^"']+)\1/g,(match,q,source)=>source.endsWith('gameLevels.js')?match:"from '/fixture.mjs'");
    } else if(name==='fixture.mjs') {
      const helpers=await fs.readFile(path.join(root,'js/helpers.js'),'utf8');
      body=fixture+helpers.slice(helpers.indexOf('export function page('),helpers.indexOf('// Slim bar')).replace('syncHeaderBar(title);','')+helpers.slice(helpers.indexOf('export function openModal('));
    } else if(/^(css\/|img\/)/.test(name)||name==='js/pagination.js') {
      const target=path.resolve(root,name);
      if(!target.startsWith(root+path.sep)) throw Error('Invalid path');
      body=await fs.readFile(target);
      type={'.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||type;
    } else {res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
  } catch(e) {res.writeHead(500);res.end(e.message);}
});
(async()=>{
  await fs.mkdir(artifacts,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await page.addInitScript(()=>{
    window.Audio=class extends EventTarget {
      constructor(){super();this.duration=2;this.currentTime=0;}
      play(){window.audioPlays=(window.audioPlays||0)+1;return Promise.resolve();}
      pause(){window.audioPauses=(window.audioPauses||0)+1;}
    };
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port+'/teacher/preview.html';
  await page.goto(base);await page.waitForFunction(()=>window.ready);
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+theme+' '+width);
      await page.screenshot({path:path.join(artifacts,'picker-'+width+'-'+theme+'.png'),fullPage:true});
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#lesson-search').fill('no such lesson');
  await page.locator('#lesson-no-results').waitFor({state:'visible'});
  await page.locator('#lesson-search').fill('');
  await page.locator('.lesson-picker__ribbon[data-level=advanced]').click();
  assert.equal(await page.locator('[data-lesson-row]:not([hidden]):not([data-paged-out])').count(),4);
  await page.locator('.lesson-picker__ribbon[data-level=all]').click();
  assert.equal(await page.locator('[name=lesson][value=lesson1]').isDisabled(),true);
  await page.locator('[data-view=lesson0]').click();
  const modal=page.locator('.lesson-preview-modal');
  await modal.locator('.lv-lecture').waitFor();
  assert.equal(await modal.locator('[data-edit-lesson]').count(),0);
  assert.equal(await modal.locator('[role=tabpanel]').getAttribute('aria-busy'),'false');
  await modal.locator('[data-audio]').first().click();
  assert.equal(await page.evaluate(()=>window.audioPlays),1);
  assert.match(await modal.locator('[data-audio]').first().getAttribute('aria-label'),/^Pause /);
  await modal.locator('[data-audio]').first().click();
  assert.match(await modal.locator('[data-audio]').first().getAttribute('aria-label'),/^Play /);
  await modal.locator('[data-play-page]').click();
  assert.equal(await page.evaluate(()=>window.audioPlays),2);
  await modal.locator('[data-tab=lectures]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await modal.locator('[data-tab=quiz]').getAttribute('aria-selected'),'true');
  assert.equal(await modal.locator('.lv-choice.is-correct').count(),2);
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      for(const section of ['lectures','quiz','activity','pronunciation','game']) {
        await modal.locator('[data-tab='+section+']').click();
        assert.ok(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth),'preview overflow '+theme+' '+width+' '+section);
        assert.ok(await modal.locator('.lv-body').evaluate(el=>el.scrollWidth<=el.clientWidth),'body overflow '+theme+' '+width+' '+section);
        if(width===1440||width===390||section==='lectures') await modal.screenshot({path:path.join(artifacts,'preview-'+section+'-'+width+'-'+theme+'.png')});
      }
    }
  }
  await modal.locator('[data-close-viewer]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await modal.locator('.modal-close').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');
  await modal.waitFor({state:'detached'});
  assert.equal(await page.locator('[data-view=lesson0]').evaluate(el=>el===document.activeElement),true);
  await page.evaluate(()=>window.viewerEmpty=true);
  await page.locator('[data-view=lesson0]').click();
  await page.locator('.lv-empty').waitFor();
  await modal.screenshot({path:path.join(artifacts,'preview-empty-320-dark.png')});
  await modal.locator('[data-close-viewer]').click();
  await page.evaluate(()=>{window.viewerEmpty=false;window.viewerFail=true;});
  await page.locator('[data-view=lesson0]').click();
  await page.getByText("We couldn't load this lesson's content. Close and try again.").waitFor();
  await modal.screenshot({path:path.join(artifacts,'preview-error-320-dark.png')});
  await modal.locator('[data-close-viewer]').click();
  await page.evaluate(()=>window.viewerFail=false);
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-view=lesson0]').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('[data-view=lesson0] .lesson-picker__tooltip').evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.locator('[name=lesson][value=lesson0]').check({force:true});
  await page.locator('[name=lesson][value=lesson4]').check({force:true});
  assert.equal(await page.locator('#lesson-selected-count').textContent(),'2');
  await page.locator('#add-selected-lessons').click();
  await page.locator('#add-lessons-form').waitFor();
  assert.match(await page.locator('#add-lessons-skipped').textContent(),/already in this class/);
  await page.locator('[name=mode][value=practice]').check();
  assert.equal(await page.locator('[data-confirm]').textContent(),'Add 2 lessons');
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'modal overflow '+theme+' '+width);
      assert.ok(await page.locator('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth),'modal content overflow '+width);
      await page.screenshot({path:path.join(artifacts,'schedule-'+width+'-'+theme+'.png'),fullPage:true});
    }
  }
  await page.locator('[data-cancel]').click();
  assert.equal(await page.locator('#lesson-selected-count').textContent(),'2');
  await page.goto(base+'?empty');await page.waitForFunction(()=>window.ready);
  await page.locator('#create-lesson-empty').click();
  assert.equal(await page.evaluate(()=>window.created),true);
  await page.screenshot({path:path.join(artifacts,'empty-320.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: light/dark at 1440/768/390/320, five real preview sections, crossword, audio control states with mock Audio, arrow-key tabs, focus containment, Escape and focus return, preview empty/error, no overflow, search, filters, selection, scheduling dialog. No database writes.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
