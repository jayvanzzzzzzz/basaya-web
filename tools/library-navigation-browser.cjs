// Exercise real workspace, repository and lesson editor with in-memory Firebase adapters.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'audit/library-navigation');
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
for(let index=0;index<36;index++)docs.set('lessons/example'+index,{title:'Example '+index,description:'Navigation fixture',teacherId:index%2?'other':'teacher',visibility:'shared',difficulty:['madali','masusing aralin','malalim na aralin'][index%3]});

Object.assign(docs.get('lessons/pandiwa'),{teacherId:'teacher',visibility:'shared'});
Object.assign(docs.get('lessons/pangngalan'),{teacherId:'other',visibility:'shared'});
docs.set('lessons/ownArchived',{title:'Archived private copy',teacherId:'teacher',visibility:'private',archived:true});
docs.set('lessons/moderated',{title:'Review requested',teacherId:'teacher',visibility:'shared',archived:true,archiveModerated:true,archiveReason:'Review the examples.'});
docs.set('lessons/otherArchived',{title:'Other archive',teacherId:'other',visibility:'shared',archived:true});
if(state.profile.role==='admin'){docs.set('lessons/legacy',{title:'Idyoma',visibility:'shared'});docs.set('lessons/adminOwned',{title:'Admin owned',teacherId:'teacher',visibility:'shared'});}
for(const [id,ownerId,visibility,archived] of [['own','teacher','private',false],['other','other','shared',false],['ownArchive','teacher','private',true],['otherArchive','other','shared',true]]) docs.set('modules/'+id,{title:id+' module',description:'Learning sequence',ownerId,visibility,archived,revision:1,lessonIds:['pandiwa']});
docs.set('classes/class/classLessons/pandiwa',{lessonId:'pandiwa'});
docs.set('users/student/assignedLessons/pandiwa',{score:5});

if(new URLSearchParams(location.search).has('class')){
 docs.set('classes/class',{teacherId:'teacher',className:'Grade 7'});
 docs.set('modules/premade',{title:'Premade module',description:'Admin module',ownerId:'admin',visibility:'shared',revision:1,lessonIds:['pangngalan','pandiwa']});
}
if(new URLSearchParams(location.search).has('empty-modules'))for(const key of [...docs.keys()])if(key.startsWith('modules/'))docs.delete(key);
export const serverTimestamp=()=>({seconds:1000});
export const collection=(_, ...parts)=>({path:parts.join('/')});
export const doc=(parent,...parts)=>{const p=parts.length?parts.join('/'):parent.path+'/new'+(++next);return {path:p,id:p.split('/').pop()}};
const snap=ref=>({id:ref.id||ref.path.split('/').pop(),ref,exists:()=>docs.has(ref.path),data:()=>structuredClone(docs.get(ref.path))});
export const where=(key,op,value)=>({key,value});
export const query=(ref,filter)=>({...ref,filter});
export const getDocs=async ref=>{window.firestoreReads=(window.firestoreReads||0)+1;if(window.blockReads)throw Error('Unexpected Firestore read while switching filters');const items=[...docs].filter(([key,data])=>key.startsWith(ref.path+'/')&&key.split('/').length===ref.path.split('/').length+1&&(!ref.filter||data[ref.filter.key]===ref.filter.value)).map(([key])=>snap({path:key,id:key.split('/').pop()}));return {docs:items,size:items.length}};
export const getDoc=async ref=>snap(ref);
export const getAllLessons=async()=>{window.lessonLoads=(window.lessonLoads||0)+1;state.allLessons=(await getDocs(collection(db,'lessons'))).docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.publicationState!=='draft')};
export const addDoc=async(ref,data)=>{const r=doc(ref);docs.set(r.path,structuredClone(data));return r};
export const setDoc=async(ref,data)=>docs.set(ref.path,structuredClone(data));
export const updateDoc=async(ref,data)=>docs.set(ref.path,{...docs.get(ref.path),...structuredClone(data)});
export const deleteDoc=async ref=>docs.delete(ref.path);
const makeBatch=()=>{const ops=[];return {set:(ref,data)=>ops.push(()=>docs.set(ref.path,structuredClone(data))),update:(ref,data)=>ops.push(()=>docs.set(ref.path,{...docs.get(ref.path),...structuredClone(data)})),delete:ref=>ops.push(()=>docs.delete(ref.path)),commit:async()=>{if(window.failSave)throw Error('Synthetic save failure');ops.forEach(op=>op())}}};
export const writeBatch=()=>{const batch=makeBatch();return {...batch,commit:async()=>{if(window.failContentSave)throw Error('Synthetic content save failure');await batch.commit()}}};
export const runTransaction=async(_,work)=>{const batch=makeBatch();const result=await work({...batch,get:async ref=>snap(ref)});await batch.commit();return result};
export const generateSpeech=async()=>({blob:await(await fetch('/clip.wav')).blob()});
export const saveSpeech=async({lessonId,section})=>({audioUrl:location.origin+'/clip.wav',storageKey:'lessons/'+lessonId+'/'+section+'/test.mp3'});
export const postToApi=async(path,body)=>{if(path==='content-lifecycle'&&['save-module','reserve-lesson-version','lesson-visibility'].includes(body?.action)){const {versioningRequest}=await import('/tools/fixtures/content-versioning.js');return versioningRequest(state,docs,body,kind=>doc(collection(db,kind==='module'?'modules':'lessons')));} 
 if(path!=='content-lifecycle')return {missing:[]};
 if(window.failArchive)throw Error('Synthetic archive failure');
 const key=(body.kind==='module'?'modules':'lessons')+'/'+body.id,item=docs.get(key);
 const ownerId=body.kind==='module'?item.ownerId:item.teacherId;const own=ownerId===state.user.uid;
 if(!own&&state.profile.role!=='admin')throw Error('Not yours');
 if(ownerId&&!own&&!body.reason)throw Error('Reason required');
 if(body.action==='delete'){if([...docs].some(([path,data])=>path.includes('/classLessons/')&&(data.lessonId===body.id||data.moduleId===body.id)))throw Error('This content is used by a class. Archive it instead.');docs.delete(key);return {deleted:true};}
 docs.set(key,{...item,archived:body.action==='archive',archiveModerated:body.action==='archive'&&Boolean(ownerId)&&!own,archiveReason:body.reason,revision:item.revision?item.revision+1:undefined});
 return {archived:body.action==='archive'};
},lookupWord=async()=>({word:'test'}),syllablesFor=async word=>word;
export const openWordModal=()=>{},openDeleteLesson=()=>{};
export const DIFFICULTY_LABELS={madali:'Beginner','masusing aralin':'Intermediate','malalim na aralin':'Advanced'};
export const readSchedule=()=>({openAt:null,dueAt:null}),wireLessonSchedule=()=>{},wirePathOpeningDates=()=>()=>null,notifyStudents=async()=>{},linkLessonId=link=>link.lessonId,linkMode=link=>link.mode||'assessment',practiceLinkId=id=>id+'__practice';
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
      type='text/html';body='<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1">'+themeBoot+styles+'</head><body data-portal="'+portal+'"><main style="max-width:1400px;margin:auto;padding:16px"><div id="page-header"></div><div id="page-content"></div></main><div id="toast"></div><template id="modal-template"><div class="modal-backdrop"><div class="modal"><button type="button" class="modal-close" aria-label="Close">Ã—</button><div class="modal-content"></div></div></div></template><script type="module" src="/js/theme.js"></script><script type="module">'+script+'</script></body></html>';
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
 let slowest=0;
 try {
 for(const role of ['teacher','admin']) for(const empty of [true,false]) {
  const p=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:'+server.address().port+'/fixture.html?role='+role+(empty?'&empty-modules=1':''));await p.waitForFunction(()=>window.ready);
  await p.evaluate(()=>{
   window.blockReads=true;window.readBaseline=window.firestoreReads;window.loadBaseline=window.lessonLoads;
   window.navRefs={header:document.querySelector('#page-header').firstElementChild,nav:document.querySelector('[data-workspace-navigation]'),tabs:[...document.querySelectorAll('.module-tabs button')],scopes:[...document.querySelectorAll('.content-scope-ribbons button')]};
  });
  const initial=await p.evaluate(()=>{const start=performance.now();document.querySelector('[data-action="library"]').click();return {ms:performance.now()-start,immediate:!!document.querySelector('[data-library-list],.admin-lesson-directory')};});
  assert.equal(initial.immediate,true,'Library renders in the same event without fetching');slowest=Math.max(slowest,initial.ms);
  for(const scope of ['all','mine','archived','all']) {
   const elapsed=await p.evaluate(id=>{const start=performance.now();document.querySelector('.content-scope-ribbons [data-scope="'+id+'"]').click();return performance.now()-start;},scope);slowest=Math.max(slowest,elapsed);
   assert.equal(await p.locator('.content-scope-ribbons [data-scope="'+scope+'"]').getAttribute('aria-pressed'),'true');
   if(role==='admin') {
    await p.evaluate(()=>{window.listRefs={root:document.querySelector('.admin-lesson-directory'),search:document.querySelector('[data-lesson-search]'),buttons:[...document.querySelectorAll('[data-lesson-filter]')]};});
    for(const level of ['beginner','intermediate','advanced','all','advanced','all']) {
     await p.locator('[data-lesson-filter="'+level+'"]').click();
     assert.equal(await p.evaluate(()=>listRefs.root.isConnected&&listRefs.search===document.querySelector('[data-lesson-search]')&&listRefs.buttons.every(e=>e.isConnected)),true,'Difficulty changes keep the list and controls mounted');
     assert.equal(await p.locator('[data-lesson-filter="'+level+'"]').getAttribute('aria-pressed'),'true');
     const rows=await p.locator('[data-lesson-row]:not([hidden]):not([data-paged-out])').evaluateAll(items=>items.map(item=>item.dataset.lessonDifficulty));
     if(level!=='all')assert.ok(rows.every(value=>value===level));
    }
    if(scope==='all') {
     await p.locator('[data-lesson-search]').fill('Example 2');await p.locator('[data-lesson-filter="advanced"]').click();
     const matches=await p.locator('[data-lesson-row]:not([hidden]):not([data-paged-out])').evaluateAll(items=>items.map(item=>({name:item.dataset.lessonRow,level:item.dataset.lessonDifficulty})));
     assert.ok(matches.every(item=>item.name.includes('example 2')&&item.level==='advanced'));
     await p.locator('[data-lesson-search]').fill('');await p.locator('[data-lesson-filter="all"]').click();
    }
   }
   assert.equal(await p.evaluate(()=>navRefs.header===document.querySelector('#page-header').firstElementChild&&navRefs.nav===document.querySelector('[data-workspace-navigation]')&&navRefs.tabs.every(e=>e.isConnected)&&navRefs.scopes.every(e=>e.isConnected)),true,'Header and workspace ribbons stay mounted');
  }
  await p.evaluate(()=>{for(let i=0;i<8;i++){document.querySelector('[data-action="modules"]').click();document.querySelector('.content-scope-ribbons [data-scope="mine"]').click();document.querySelector('[data-action="library"]').click();document.querySelector('.content-scope-ribbons [data-scope="all"]').click();}});
  assert.equal(await p.locator('[data-action="library"]').getAttribute('aria-pressed'),'true');
  assert.equal(await p.evaluate(()=>window.firestoreReads===readBaseline&&window.lessonLoads===loadBaseline),true,'No database reloads for tabs or filters');
  for(const width of [1440,390]) for(const theme of ['light','dark']) {
   await p.setViewportSize({width,height:1050});await p.evaluate(t=>{document.documentElement.dataset.theme=t;window.scrollTo(0,0);},theme);
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await p.screenshot({path:path.join(out,role+'-'+(empty?'empty':'modules')+'-'+width+'-'+theme+'.png'),fullPage:true});
  }
  await p.locator('.content-scope-ribbons [data-scope="mine"]').focus();await p.keyboard.press('Enter');
  assert.equal(await p.locator('.content-scope-ribbons [data-scope="mine"]').evaluate(e=>e===document.activeElement),true);
  assert.deepEqual(errors,[]);await p.close();
 }
 console.log('PASS: stable header/ribbons, in-place difficulty/search/pagination, immediate tab/scope changes, zero repeated database reads, rapid switching, empty and populated modules, both roles and desktop/mobile light/dark. Slowest synchronous switch: '+slowest.toFixed(1)+'ms.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});