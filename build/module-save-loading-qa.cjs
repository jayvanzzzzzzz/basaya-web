// Exercise real workspace, repository and lesson editor with in-memory Firebase adapters.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'audit/module-save-loading');
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
if(new URLSearchParams(location.search).has('sequence')) {
 docs.set('lessons/tula',{title:'Tula',description:'Bagong aralin',difficulty:'madali'});
 docs.set('lessons/alamat',{title:'Alamat',description:'Naunang aralin',difficulty:'madali'});
 docs.set('modules/poetry',{title:'Mga Tula',ownerId:'teacher',visibility:'private',revision:1,lessonIds:['tula']});
 docs.set('classes/class/classLessons/alamat',{lessonId:'alamat',teacherId:'teacher',mode:'assessment',order:12});
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
export const postToApi=async(path,body)=>{if(body?.action==='save-module'&&window.moduleSaveGate)await window.moduleSaveGate;if(body?.action==='save-module'&&window.failModuleTitle===body.title)throw Error('Synthetic module queue failure');if(path==='content-lifecycle'&&['save-module','reserve-lesson-version','lesson-visibility'].includes(body?.action)){const {versioningRequest}=await import('/tools/fixtures/content-versioning.js');return versioningRequest(state,docs,body,kind=>doc(collection(db,kind==='module'?'modules':'lessons')));} return {missing:[]};},lookupWord=async()=>({word:'test'}),syllablesFor=async word=>word;
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
      type='text/html';body='<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+themeBoot+styles+'</head><body data-portal="'+portal+'"><main style="max-width:1400px;margin:auto;padding:16px"><div id="page-header"></div><div id="page-content"></div></main><div id="toast"></div><template id="modal-template"><div class="modal-backdrop"><div class="modal"><button type="button" class="modal-close" aria-label="Close">×</button><div class="modal-content"></div></div></div></template><script type="module" src="/js/theme.js"></script><script type="module">'+script+'</script></body></html>';
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

    for (const role of ['teacher','admin']) for (const width of [1440,390]) for (const theme of ['light','dark']) {
      await p.setViewportSize({width,height:1000});
      await p.goto(base+'/fixture.html?role='+role);await p.waitForFunction(()=>window.ready);
      await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await click('new-module');await p.locator('[name="title"]').fill('Module loading check');
      await p.locator('[data-pick="pandiwa"]').check();
      await p.evaluate(()=>{window.failSave=true;window.moduleSaveGate=new Promise(resolve=>window.releaseModuleSave=resolve);});
      await p.locator('[data-module-form] [type="submit"]').click();await confirm('Save module');
      const submit=p.locator('[data-module-form] [type="submit"]');
      await submit.locator('.button__saving-spinner').waitFor();
      assert.match(await submit.innerText(),/Saving/);
      assert.equal(await submit.isDisabled(),true);
      assert.equal(await submit.getAttribute('aria-busy'),'true');
      assert.equal(await submit.locator('.button__saving-spinner').evaluate(e=>getComputedStyle(e).animationName),'button-saving-rotate');
      assert.equal(await submit.evaluate(e=>getComputedStyle(e).opacity),'1');
      assert.equal(await p.locator('[data-module-form]').evaluate(e=>[...e.querySelectorAll('input,textarea,select,button')].every(c=>c.disabled)),true);
      await submit.scrollIntoViewIfNeeded();
      await p.screenshot({path:path.join(out,role+'-'+width+'-'+theme+'.png'),fullPage:true});
      await p.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await submit.locator('.button__saving-spinner').evaluate(e=>getComputedStyle(e).animationName),'none');
      await p.emulateMedia({reducedMotion:'no-preference'});
      await p.evaluate(()=>window.releaseModuleSave());
      await p.locator('[data-save-status]').filter({hasText:'Synthetic save failure'}).waitFor();
      assert.equal(await submit.innerText(),'Save module');assert.equal(await submit.isDisabled(),false);
      assert.equal(await submit.getAttribute('aria-busy'),null);
      assert.equal(await p.locator('.button__saving-spinner').count(),0);
      await p.evaluate(()=>{window.failSave=false;window.moduleSaveGate=new Promise(resolve=>window.releaseModuleSave=resolve);});
      await submit.click();await confirm('Save module');await submit.locator('.button__saving-spinner').waitFor();
      await p.evaluate(()=>window.releaseModuleSave());await p.locator('[data-module]').first().waitFor();
      assert.equal(await p.locator('.button__saving-spinner').count(),0);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: module save spinner, disabled/busy states, readable colors, reduced motion, failed save reset and successful retry in teacher/admin light/dark desktop/mobile (8 layouts). Local adapters only.');
  }finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
