// Exercise real workspace, repository and lesson editor with in-memory Firebase adapters.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'audit/module-lessons');
const fixture = `
export const db={}, state={user:{uid:'teacher'},profile:{role:new URLSearchParams(location.search).get('role')||'teacher'},allLessons:[]};
const audio=text=>({audioUrl:location.origin+'/clip.wav',text});
const docs=new Map([
 ['lessons/pandiwa',{title:'Pandiwa',description:'Kilalanin ang salitang kilos.',difficulty:'madali'}],
 ['lessons/pangngalan',{title:'Pangngalan',description:'Kilalanin ang mga pangngalan.',difficulty:'madali'}],
 ['lessons/pandiwa/lectures/content',{title:'Ano ang Pandiwa?',pages:[{sentences:['Si Ana ay tumatakbo.'],cloudAudio:[audio('Si Ana ay tumatakbo.')]}]}],
 ['lessons/pandiwa/quiz/content',{title:'Pagsusulit',questions:[{question:'Alin ang pandiwa?',choices:['takbo','bahay','asul'],answer:0,answers:[0]}]}],
 ['lessons/pandiwa/activity/status',{completion:'skipped'}],['lessons/pandiwa/game/status',{completion:'skipped'}],
 ['lessons/pandiwa/pronunciation/content',{title:'Bigkasin',words:['takbo'],cloudAudio:[audio('takbo')],pages:[{sentence:'Si Ana ay tumatakbo.',readyWords:['Ana'],cloudAudio:audio('Si Ana ay tumatakbo.')}]}],
]);
window.store=docs;let next=0;
if(new URLSearchParams(location.search).has('class')){
 docs.set('classes/class',{teacherId:'teacher',className:'Grade 7'});
 docs.set('modules/premade',{title:'Premade module',description:'Admin module',ownerId:'admin',visibility:'shared',revision:1,lessonIds:['pangngalan','pandiwa']});
}
export const serverTimestamp=()=>({seconds:1000});
export const collection=(_, ...parts)=>({path:parts.join('/')});
export const doc=(parent,...parts)=>{const p=parts.length?parts.join('/'):parent.path+'/new'+(++next);return {path:p,id:p.split('/').pop()}};
const snap=ref=>({id:ref.id||ref.path.split('/').pop(),ref,exists:()=>docs.has(ref.path),data:()=>structuredClone(docs.get(ref.path))});
export const where=(key,op,value)=>({key,value});
export const query=(ref,filter)=>({...ref,filter});
export const getDocs=async ref=>{const items=[...docs].filter(([key,data])=>key.startsWith(ref.path+'/')&&key.split('/').length===ref.path.split('/').length+1&&(!ref.filter||data[ref.filter.key]===ref.filter.value)).map(([key])=>snap({path:key,id:key.split('/').pop()}));return {docs:items,size:items.length}};
export const getDoc=async ref=>snap(ref);
export const getAllLessons=async()=>{state.allLessons=(await getDocs(collection(db,'lessons'))).docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.publicationState!=='draft')};
export const addDoc=async(ref,data)=>{const r=doc(ref);docs.set(r.path,structuredClone(data));return r};
export const setDoc=async(ref,data)=>docs.set(ref.path,structuredClone(data));
export const updateDoc=async(ref,data)=>docs.set(ref.path,{...docs.get(ref.path),...structuredClone(data)});
export const deleteDoc=async ref=>docs.delete(ref.path);
const makeBatch=()=>{const ops=[];return {set:(ref,data)=>ops.push(()=>docs.set(ref.path,structuredClone(data))),update:(ref,data)=>ops.push(()=>docs.set(ref.path,{...docs.get(ref.path),...structuredClone(data)})),delete:ref=>ops.push(()=>docs.delete(ref.path)),commit:async()=>{if(window.failSave)throw Error('Synthetic save failure');ops.forEach(op=>op())}}};
export const writeBatch=()=>{const batch=makeBatch();return {...batch,commit:async()=>{if(window.failContentSave)throw Error('Synthetic content save failure');await batch.commit()}}};
export const runTransaction=async(_,work)=>{const batch=makeBatch();const result=await work({...batch,get:async ref=>snap(ref)});await batch.commit();return result};
export const generateSpeech=async()=>({blob:await(await fetch('/clip.wav')).blob()});
export const saveSpeech=async({lessonId,section})=>({audioUrl:location.origin+'/clip.wav',storageKey:'lessons/'+lessonId+'/'+section+'/test.mp3'});
export const postToApi=async()=>({missing:[]}),lookupWord=async()=>({word:'test'}),syllablesFor=async word=>word;
export const openWordModal=()=>{},openDeleteLesson=()=>{};
export const DIFFICULTY_LABELS={madali:'Beginner','masusing aralin':'Intermediate','malalim na aralin':'Advanced'};
export const readSchedule=()=>({openAt:null,dueAt:null}),wireLessonSchedule=()=>{},notifyStudents=async()=>{},linkLessonId=link=>link.lessonId,linkMode=link=>link.mode||'assessment',practiceLinkId=id=>id+'__practice';
`;
const wav = Buffer.alloc(44 + 8000); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const stub = new Set(['js/state.js','js/firebase.js','js/tts.js','js/api.js','js/dictionary.js','teacher/views/dictionary.js','admin/views/lessonDeletion.js','js/schedule.js','teacher/views/lessons.js']);
const server = http.createServer(async(req,res)=>{
  try {
    const name=new URL(req.url,'http://local').pathname.slice(1);let body,type='text/javascript';
    if(name==='fixture.mjs')body=fixture;
    else if(name==='clip.wav'){res.writeHead(200,{'Content-Type':'audio/wav'});res.end(wav);return;}
    else if(name==='fixture.html'){
      const portal=new URL(req.url,'http://local').searchParams.get('role')||'teacher';
      const source=await fs.readFile(path.join(root,portal+'/index.html'),'utf8');
      const themeBoot=source.match(/<script>[\s\S]*?<\/script>/)[0];
      const styles=[...source.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>m[0].replaceAll('../','/')).filter(s=>!s.includes('https:')).join('');
      const classMode=new URL(req.url,'http://local').searchParams.has('class');
      const script=classMode?'import {renderAddLessonPage} from "/teacher/views/addLesson.js";location.hash="/classes/class/add-lesson";await renderAddLessonPage("class");window.ready=true;':'import {renderLessonWorkspace} from "/js/lessonWorkspace.js";import {canLeaveLessons} from "/js/lessonNavigation.js";window.canLeaveLessons=canLeaveLessons;location.hash="/lessons";window.renderWorkspace=renderLessonWorkspace;await renderLessonWorkspace();window.ready=true;';
      type='text/html';body='<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+themeBoot+styles+'</head><body data-portal="'+portal+'"><main style="max-width:1400px;margin:auto;padding:16px"><div id="page-header"></div><div id="page-content"></div></main><div id="toast"></div><template id="modal-template"><div class="modal-backdrop"><div class="modal"><button type="button" class="modal-close" aria-label="Close">×</button><div class="modal-content"></div></div></div></template><script type="module">'+script+'</script></body></html>';
    } else {
      const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('Invalid path');
      body=await fs.readFile(target);type={'.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(name)]||type;
      if(name.endsWith('.js')) body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,(match,q,source)=>source.startsWith('https://www.gstatic.com/firebasejs/')||stub.has(path.posix.normalize(path.posix.join(path.posix.dirname(name),source)))?"from '/fixture.mjs'":match);
    }
    res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
  }catch(error){res.writeHead(404);res.end(error.message);}
});
(async()=>{
  await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const errors=[];
  try {
    const p=await browser.newPage({viewport:{width:1440,height:1050}}),base='http://127.0.0.1:'+server.address().port;
    p.on('pageerror',e=>errors.push(e.message));
    await p.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    const click=action=>p.locator('[data-action="'+action+'"]:visible').first().click();
    const confirm=async label=>{await p.locator('.action-confirmation').last().getByRole('button',{name:label,exact:true}).click();};
    for(const role of ['teacher','admin']) {
      await p.goto(base+'/fixture.html?role='+role);await p.waitForFunction(()=>window.ready);
      assert.equal(await p.locator('[data-action="modules"]').getAttribute('aria-pressed'),'true');
      await click('library');await p.locator('[data-action="library"][aria-pressed="true"]').waitFor();
      assert.equal(await p.locator('[data-action="modules"]').getAttribute('aria-pressed'),'false');
      await click('modules');await p.locator('[data-action="modules"][aria-pressed="true"]').waitFor();
      await click('new-module');await p.locator('[name="title"]').fill('Mga Bahagi ng Pananalita');await p.locator('[name="description"]').fill('Isang module, maraming aralin.');
      await p.locator('[data-pick="pandiwa"]').check();await p.locator('[data-pick="pangngalan"]').check();
      await p.locator('[data-move="1"][data-direction="-1"]').click();
      assert.match(await p.locator('[data-order] li').first().innerText(),/Pangngalan/);
      for(const width of [1440,768,390,320]) for(const theme of ['light','dark']) {
        await p.setViewportSize({width,height:1050});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
        assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,role+' '+width+' '+theme+' overflow');
        await p.screenshot({path:path.join(out,role+'-module-'+width+'-'+theme+'.png'),fullPage:true,animations:'disabled'});
        const preview=p.locator('[data-preview="pandiwa"]');
        assert.equal((await preview.innerText()).trim(),'');
        await p.mouse.move(0,0);await preview.hover();
        const tip=p.locator('.floating-tooltip:not([hidden])');await tip.waitFor();
        assert.equal(await tip.innerText(),'Preview Pandiwa');
        const bounds=await tip.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
        assert.equal(await preview.getAttribute('aria-describedby'),await tip.getAttribute('id'));
        if(width===390) await p.screenshot({path:path.join(out,role+'-preview-tooltip-'+theme+'.png'),fullPage:true,animations:'disabled'});
        await p.keyboard.press('Escape');await p.locator('.floating-tooltip:not([hidden])').waitFor({state:'hidden'});
      }
      await p.setViewportSize({width:1440,height:1050});
      await p.locator('[data-preview="pandiwa"]').focus();await p.locator('.floating-tooltip:not([hidden])').waitFor();
      await p.locator('[data-preview="pandiwa"]').click();await p.locator('.lesson-viewer-modal').waitFor();
      assert.equal(await p.locator('[data-pick="pandiwa"]').isChecked(),true);
      await p.getByRole('button',{name:'Close lesson preview',exact:true}).click();
      await p.emulateMedia({reducedMotion:'reduce'});await p.locator('[data-preview="pandiwa"]').hover();
      assert.equal(await p.locator('[data-preview="pandiwa"]').evaluate(e=>getComputedStyle(e).transform),'none');
      await p.emulateMedia({reducedMotion:'no-preference'});
      await p.locator('[data-edit="pandiwa"]').click();await p.locator('.lesson-inline-editor').waitFor();
      assert.equal(await p.locator('.floating-tooltip').count(),1,'Removed picker disposes its tooltip; editor owns one tooltip.');
      assert.equal(await p.locator('.modal-backdrop').count(),0,'Content editor is inline');
      assert.equal(await p.locator('[name="title"]').inputValue(),'Pandiwa 1.1');
      await p.locator('[name="description"]').fill('Edited copy overview');
      for(const theme of ['light','dark']) {
        await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
        await p.setViewportSize({width:390,height:900});
        assert.equal(await p.locator('.lesson-inline-editor').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
        await p.screenshot({path:path.join(out,role+'-inline-'+theme+'.png'),fullPage:true});
      }
      await p.setViewportSize({width:1440,height:1050});
      await p.evaluate(()=>window.failContentSave=true);
      await p.locator('#lesson-form [type="submit"]').click();
      if(await p.locator('.missing-toast:visible').count()) throw Error('Fixture invalid: '+await p.locator('.missing-toast').innerText());
      await confirm('Save copy');
      await p.waitForFunction(()=>!document.querySelector('#lesson-form').dataset.saving);
      assert.equal(await p.evaluate(()=>[...store.values()].filter(d=>d.title==='Pandiwa 1.1'&&d.publicationState==='draft').length),1);
      assert.equal(await p.evaluate(()=>store.has('lessons/new1/lectures/content')),false,'Failed content batch publishes no sections');
      await p.evaluate(()=>window.failContentSave=false);
      await p.locator('#lesson-form [type="submit"]').click();await confirm('Save copy');
      await p.locator('[data-module-form]').waitFor();
      assert.equal(await p.evaluate(()=>store.get('lessons/pandiwa').description),'Kilalanin ang salitang kilos.');
      assert.ok(await p.locator('[data-order]').innerText().then(t=>t.includes('Pandiwa 1.1')));
      assert.equal(await p.evaluate(()=>[...store.values()].filter(d=>d.title==='Pandiwa 1.1'&&d.publicationState==='published').length),1);
      await p.locator('[data-module-form] [type="submit"]').click();await p.locator('[data-module]').waitFor();
      const module=await p.evaluate(()=>[...store].find(([id])=>id.startsWith('modules/'))[1]);
      assert.equal(module.lessonIds[0],'pangngalan');assert.equal(module.lockingEnabled,false);
      await p.locator('[data-module]').click();
      await p.locator('[data-edit]').filter({hasText:'Edit a copy'}).last().click();await p.locator('.lesson-inline-editor').waitFor();
      assert.equal(await p.locator('[name="title"]').inputValue(),'Pandiwa 1.2');
      await click('back');await p.locator('[data-module-form]').waitFor();
      await click('module-lesson');await p.locator('.lesson-inline-editor').waitFor();
      await p.locator('[name="title"]').fill('Bagong aralin');await p.locator('[name="description"]').fill('Bagong nilalaman');
      await p.locator('[data-step="lectures"]').click();await p.locator('[data-sentence-text]').fill('Masaya si Ana.');await p.locator('[data-generate-sentence-audio]').click();
      await p.locator('[data-media-status]').filter({hasText:'Preview ready'}).waitFor();
      await p.locator('[data-step="quiz"]').click();await p.locator('[data-question-text]').fill('Sino ang masaya?');
      for(const [i,text] of ['Ana','Ben','Lito'].entries())await p.locator('[data-choice-text]').nth(i).fill(text);
      await p.locator('[data-answer-choice]').first().check();
      await p.locator('[data-step="activity"]').click();await p.locator('[data-skip-activity]').check();
      await p.locator('[data-step="game"]').click();await p.locator('[data-skip-game]').check();
      await p.locator('[data-step="pronunciation"]').click();
      await p.locator('[data-pronunciation-sentence]').fill('Masaya si Ana.');await p.locator('[data-ready-word="masaya"]').click();await p.locator('[data-generate-pronunciation-sentence]').click();
      await p.locator('[data-panel="pronunciation"] [data-media-status]').filter({hasText:'Preview ready'}).waitFor();
      await p.locator('#lesson-form [type="submit"]').click();await confirm('Publish lesson');
      await p.locator('[data-module-form]').waitFor();
      assert.match(await p.locator('[data-order]').innerText(),/Bagong aralin/);
      assert.equal(await p.evaluate(()=>[...store.values()].filter(d=>d.title==='Bagong aralin'&&d.publicationState==='published').length),1);
      // Reject a failed module save without discarding the draft or order.
      await p.evaluate(()=>window.failSave=true);await p.locator('[data-module-form] [type="submit"]').click();
      await p.locator('[data-save-status]').filter({hasText:'Synthetic save failure'}).waitFor();
      assert.equal(await p.locator('[data-order] li').count(),3);await p.evaluate(()=>window.failSave=false);
      await p.locator('[data-module-form] [type="submit"]').click();await p.locator('[data-module]').waitFor();
      assert.equal(await p.evaluate(()=>[...store].find(([id])=>id.startsWith('modules/'))[1].lessonIds.length),3);
      // Dirty navigation can be cancelled, restoring the Lessons URL and draft.
      await p.locator('[data-module]').click();await p.locator('[name="title"]').fill('Unsaved title');
      await p.evaluate(()=>{location.hash='/dashboard';window.leaveResult=canLeaveLessons();});
      await confirm('Cancel');assert.equal(await p.evaluate(()=>window.leaveResult),false);
      assert.equal(await p.evaluate(()=>location.hash),'#/lessons');assert.equal(await p.locator('[name="title"]').inputValue(),'Unsaved title');
      await click('back');await confirm('Discard changes');
      await p.evaluate(async()=>{await import('/js/theme.js');const control=document.createElement('button');control.dataset.themeChoice='dark';document.body.append(control);control.click();control.remove();});
      assert.equal(await p.evaluate(()=>localStorage.getItem('basaya-theme')),'dark');
      await p.reload();await p.waitForFunction(()=>window.ready);assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');
      await click('new-module');assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');
    }
    await p.goto(base+'/fixture.html?role=teacher&class=1');await p.waitForFunction(()=>window.ready);
    await p.locator('#class-module').selectOption('premade');await p.locator('#add-class-module').click();
    await p.locator('#add-lessons-form [type="submit"]').click();
    await p.waitForFunction(()=>store.has('classes/class/classLessons/pandiwa'));
    const links=await p.evaluate(()=>[...store].filter(([id])=>id.startsWith('classes/class/classLessons/')).map(([,data])=>data).sort((a,b)=>a.order-b.order));
    assert.deepEqual(links.map(link=>link.lessonId),['pangngalan','pandiwa']);assert.deepEqual(links.map(link=>link.moduleOrder),[1,2]);assert.ok(links.every(link=>link.moduleId==='premade'&&link.moduleRevision===1));
    assert.deepEqual(errors,[]);console.log('PASS: teacher/admin module selection, ordering, inline editor, automatic copies and naming, unchanged originals, new lesson publishing to library, save failures, unsaved navigation, shared admin module assignment in saved order, 16 responsive light/dark module layouts and 4 mobile editor layouts. Local adapters; no production writes.');
  }finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
