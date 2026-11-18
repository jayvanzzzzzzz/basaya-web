// Real lesson editor, synthetic audio and local adapters; no database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const auditText = require('./text-readability-audit.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'audit/lesson-media');
const wav = Buffer.alloc(44 + 16000 * 12);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const fixture = `
export const state={allLessons:[]},db={};
export const doc=(...args)=>args,collection=(...args)=>args,getDocs=async()=>({docs:[]}),getAllLessons=async()=>{};
const noWrite=()=>{throw Error('Unexpected data write')};
export const addDoc=noWrite,deleteDoc=noWrite,setDoc=noWrite,updateDoc=noWrite,writeBatch=noWrite,postToApi=noWrite,saveSpeech=noWrite;
export const generateSpeech=async()=>{await new Promise(r=>setTimeout(r,200));return {blob:await (await fetch('/clip.wav')).blob()}};
export const serverTimestamp=()=>0,setButtonSaving=()=>{},lookupWord=async()=>window.dictionaryMissing?null:({word:'test'}),syllablesFor=async word=>word;
export const openWordModal=()=>{},openLessonViewer=()=>{},openDeleteLesson=()=>{},confirmDuplicateTitle=async()=>true,findDuplicate=()=>null,sameTitle=()=>false;
export const loadLessonSections=async()=>window.sections;
`;
const real = new Set(['../../js/action-confirmation.js','../../js/floatingTooltip.js','../../js/helpers.js','../../js/field-errors.js','../../js/syllables.js','../../js/pagination.js','./gameLevels.js','./missingChecklist.js','./pronunciationPages.js','./lessonMediaPlayer.js']);
const server = http.createServer(async (req,res) => {
  try {
    const name = new URL(req.url,'http://local').pathname.slice(1);
    if(name==='clip.wav'){
      const range=req.headers.range?.match(/bytes=(\d+)-(\d*)/);
      if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),wav.length-1):wav.length-1;res.writeHead(206,{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${wav.length}`,'Content-Length':end-start+1});res.end(wav.subarray(start,end+1));}
      else {res.writeHead(200,{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':wav.length});res.end(wav);}return;
    }
    let body, type='text/javascript';
    if(name==='fixture.mjs') body=fixture;
    else if(name==='fixture.html') {
      const admin=await fs.readFile(path.join(root,'admin/index.html'),'utf8');
      const styles=[...admin.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>m[0].replaceAll('../','/')).filter(s=>!s.includes('https:')).join('');
      type='text/html';body=`<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body data-portal="admin"><div id="app-view"></div><div id="toast"></div><template id="modal-template"><div class="modal-backdrop"><div class="modal"><button type="button" class="modal-close" aria-label="Close">×</button><div class="modal-content"></div></div></div></template><script type="module">
      import {openLessonModal,editorSnapshot} from '/admin/views/lessons.js';import '/js/admin-design.js';
      const clip=text=>({audioUrl:location.origin+'/clip.wav',text});
      window.sections={lectures:{pages:[{sentences:['May bahay.','Maganda ang ating paaralan.'],cloudAudio:[clip('May bahay.'),clip('Maganda ang ating paaralan.')]},{sentences:['May puno.'],cloudAudio:[clip('May puno.')]}]},pronunciation:{words:['may','bahay'],cloudAudio:[clip('may'),clip('bahay')],pages:[{sentence:'May bahay.',readyWords:['may','bahay'],cloudAudio:clip('May bahay.')},{sentence:'May puno.',readyWords:['may'],cloudAudio:clip('May puno.')}]}};
      await openLessonModal(location.search.includes('edit')?{id:'test',title:'Ang ating pamayanan',description:'Pagbasa at pagbigkas',difficulty:'madali'}:null);
      window.getSnapshot=()=>editorSnapshot(document.querySelector('#lesson-form'));window.ready=true;
      </script></body></html>`;
    } else {
      const target=path.resolve(root,name);if(!target.startsWith(root+path.sep)||name.split('/').some(s=>s.startsWith('.')))throw Error('Invalid path');
      body=await fs.readFile(target);type={'.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(name)]||type;
      if(name==='admin/views/lessons.js') body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,(m,q,s)=>real.has(s)?m:"from '/fixture.mjs'")+'\nexport {openLessonModal,editorSnapshot};';
      if(name==='js/helpers.js') body=body.toString().replace('from "./state.js"','from "/fixture.mjs"');
    }
    res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
  } catch(e){res.writeHead(404);res.end(e.message);}
});
(async()=>{
  await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
    p.on('pageerror',e=>errors.push(e.message));const base='http://127.0.0.1:'+server.address().port;
    await p.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    const tab=name=>p.locator(`[data-step="${name}"]`).click();
    const paused=async()=>assert.ok(await p.locator('audio').evaluateAll(nodes=>nodes.every(a=>a.paused)));
    const generate=async(row,selector)=>{
      await row.locator(selector).click();assert.equal(await row.locator(selector).getAttribute('aria-busy'),'true');
      await row.locator('[data-media-status]').filter({hasText:'Preview ready'}).waitFor();
      await row.locator('[data-media-seek]:not(:disabled)').waitFor();
    };
    for(const mode of ['edit','add']) {
      await p.goto(base+'/fixture.html'+(mode==='edit'?'?edit':''));await p.waitForFunction(()=>window.ready);
      await tab('lectures');let first=p.locator('[data-lecture-sentence]:visible').first();
      if(mode==='add') {
        assert.ok(await first.locator('[data-media-toggle]').isDisabled());
        await first.locator('textarea').fill('May bahay.');await generate(first,'[data-generate-sentence-audio]');
      } else await first.locator('[data-media-seek]:not(:disabled)').waitFor();
      const snapshot=await p.evaluate(()=>getSnapshot());
      await first.locator('[data-media-toggle]').focus();await p.keyboard.press('Enter');
      await first.locator('.is-playing').waitFor();assert.match(await first.locator('[data-media-toggle]').getAttribute('aria-label'),/^Pause/);
      await first.locator('[data-media-toggle]').click();await paused();
      await first.locator('[data-media-speed]').selectOption('1.5');assert.equal(await first.locator('audio').evaluate(a=>a.playbackRate),1.5);
      await first.locator('[data-media-seek]').focus();await p.keyboard.press('ArrowRight');
      assert.ok(Number(await first.locator('[data-media-seek]').inputValue())>0, 'Arrow keys move the seek slider');
      await p.waitForFunction(()=>document.querySelector('[data-lecture-sentence] audio').currentTime>0);
      assert.equal(await p.evaluate(()=>getSnapshot()),snapshot,'Playback controls do not dirty the lesson');
      await first.locator('[data-media-toggle]').click();
      if(mode==='edit') {
        const second=p.locator('[data-lecture-sentence]:visible').nth(1);await second.locator('[data-media-toggle]').click();
        assert.ok(await first.locator('audio').evaluate(a=>a.paused));
        await p.locator('[data-lecture-page-ribbon="1"]').click();await paused();await p.locator('[data-lecture-page-ribbon="0"]').click();
      }
      await tab('pronunciation');await paused();
      const sentence=p.locator('[data-pronunciation-page]:visible');
      if(mode==='add') {await sentence.locator('textarea').fill('May bahay.');await generate(sentence,'[data-generate-pronunciation-sentence]');await p.locator('[data-ready-word="may"]').click();}
      await sentence.locator('[data-media-toggle]').click();await sentence.locator('.is-playing').waitFor();
      const word=p.locator('[data-pronunciation-word]:visible').first();
      if(mode==='add') await generate(word,'[data-generate-pronunciation-audio]');
      await word.locator('[data-media-toggle]').click();await word.locator('.is-playing').waitFor();assert.ok(await sentence.locator('audio').evaluate(a=>a.paused));
      await word.locator('[data-media-toggle]').click();
      if(mode==='edit') {await p.locator('[data-pronunciation-page-ribbon="1"]').click();await paused();await p.locator('[data-pronunciation-page-ribbon="0"]').click();}
      await p.evaluate(()=>window.dictionaryMissing=true);
      const wordField=word.locator('[data-pronunciation-text]');await wordField.fill(await wordField.inputValue());
      await word.locator('[data-dict-missing]').waitFor();
      for(const section of ['lectures','pronunciation']) {
        await tab(section);
        for(const theme of ['light','dark']) for(const width of [1440,768,390,320]) {
          await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
          const player=p.locator('[data-panel].active .lesson-media').first();await player.scrollIntoViewIfNeeded();
          if(!await p.locator('.modal').evaluate(e=>e.scrollWidth<=e.clientWidth)) {
            await p.screenshot({path:path.join(out,'overflow.png')});
            console.log(mode,section,theme,width,await p.locator('.modal').evaluate(e=>[...e.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).map(n=>({name:n.className||n.tagName,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right})).slice(0,20)));
          }
          assert.ok(await p.locator('.modal').evaluate(e=>e.scrollWidth<=e.clientWidth));
          assert.ok(await player.evaluate(e=>e.scrollWidth<=e.clientWidth));
          const issues=(await auditText(p)).filter(i=>i.label.startsWith('lesson-media'));checks.push({mode,section,theme,width,issues});assert.deepEqual(issues,[]);
          const toggle=player.locator('[data-media-toggle]');await toggle.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');
          assert.notEqual(await toggle.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
          await p.locator('.floating-tooltip:not([hidden])').waitFor();
          const box=await p.locator('.floating-tooltip:not([hidden])').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
          await p.screenshot({path:path.join(out,`${mode}-${section}-${width}-${theme}.png`),animations:'disabled'});
          if(section==='pronunciation') {
            await word.scrollIntoViewIfNeeded();
            const layout=await word.evaluate(row=>{
              const box=selector=>row.querySelector(selector).getBoundingClientRect();
              const input=box('[data-pronunciation-text]'),generate=box('[data-generate-pronunciation-audio]'),remove=box('[data-remove-pronunciation-word]'),warning=box('[data-dict-missing]'),icon=box('.audio-generate-symbol');
              return {aligned:Math.abs(generate.y-remove.y)<1&&Math.abs(input.bottom-generate.bottom)<2,ordered:input.right<=generate.x&&generate.right<=remove.x,warningBelow:warning.y>=input.bottom,generateWidth:generate.width,generateHeight:generate.height,iconWidth:icon.width,overflow:row.scrollWidth>row.clientWidth};
            });
            assert.deepEqual(layout,{aligned:true,ordered:true,warningBelow:true,generateWidth:44,generateHeight:44,iconWidth:26,overflow:false});
            await p.screenshot({path:path.join(out,`${mode}-word-actions-${width}-${theme}.png`),animations:'disabled'});
          }
        }
      }
      await p.setViewportSize({width:1440,height:1000});await tab('lectures');
      first=p.locator('[data-lecture-sentence]:visible').first();
      for(let i=mode==='add'?1:0;i<5;i++) await generate(first,'[data-generate-sentence-audio]');
      assert.ok(await first.locator('[data-generate-sentence-audio]').isDisabled());assert.match(await first.locator('.lesson-media__hint').textContent(),/limit reached/);
      await first.locator('[data-media-toggle]').click();await first.locator('.is-playing').waitFor();
      await p.evaluate(()=>{window.lastAudio=document.querySelector('[data-lecture-sentence] audio');document.querySelector('.modal-backdrop').remove();});
      await p.waitForFunction(()=>lastAudio.paused);assert.equal(await p.locator('.floating-tooltip:not([hidden])').count(),0);
    }
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'report.json'),JSON.stringify(checks,null,2));
    console.log('PASS: 32 Add/Edit lecture/pronunciation previews, light/dark at desktop/tablet/mobile/320px; real WAV playback, pause, seek, speed, one clip at a time, page/tab/close cleanup, generation spinner and limits, word previews, focus/tooltips, readability and no overflow. No database writes.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
