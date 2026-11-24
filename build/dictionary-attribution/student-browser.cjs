const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'audit/dictionary-attribution');
const fixture=`
export const state={user:{uid:'student'},profile:{role:'student'}};
export const onLeave=()=>{};
const base={accent:'',syllables:'',synonyms:[],senses:[{pos:'pangngalan',definitions:['Kahulugan ng salita.'],examples:[]}]};
const words=[{...base,key:'bahay',word:'bahay',source:'wiktionary'},{...base,key:'custom',word:'custom',source:'teacher',createdByRole:'teacher',createdByLastName:'Dela Cruz',edited:false},{...base,key:'edited',word:'edited',source:'teacher',updatedByRole:'admin',edited:true}];
export const allWords=async()=>words, lookupWord=async w=>words.find(e=>e.word===w), searchWords=async q=>words.filter(e=>e.word.startsWith(q)), suggestRoots=async()=>[], syllablesOf=e=>e.word, speakWord=()=>{};
`;
const stubs=['js/state.js','js/dictionary.js','js/tts.js','student/router.js'];
const server=http.createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://local').pathname).slice(1);let body,type='text/javascript';
 if(name==='fixture.mjs')body=fixture;
 else if(name==='student/preview.html'){
  body=(await fs.readFile(path.join(root,'student/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>',`<script type="module">import {renderDictionary} from '/student/views/dictionary.js';document.querySelector('#loading-screen')?.remove();document.querySelector('#app-view')?.removeAttribute('hidden');await renderDictionary();</script></body>`);type='text/html';
 }else{
  const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('Invalid path');
  body=await fs.readFile(target);type={'.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||type;
  if(name.endsWith('.js'))body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,(m,q,src)=>stubs.includes(path.posix.normalize(path.posix.join(path.posix.dirname(name),src)))?`from '/fixture.mjs'`:m);
 }res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
}catch(e){res.writeHead(404);res.end(e.message)}});
(async()=>{await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 await p.goto(`http://127.0.0.1:${server.address().port}/student/preview.html`);await p.waitForSelector('.st-dict-row');
 for(const [key,label] of [['bahay',''],['custom','Added by Teacher Dela Cruz'],['edited','Edited by Admin']]){
  await p.locator('[data-key="'+key+'"]').click();
  assert.equal(await p.locator('.st-dict-tag').count(),label?1:0);if(label)assert.equal(await p.locator('.st-dict-tag').innerText(),label);
  assert.equal(await p.locator('[data-act="edit"],[data-act="delete"]').count(),0);
  for(const theme of ['light','dark'])for(const width of [1440,390,320]){
   await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.setViewportSize({width,height:1000});
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),key+' overflow');
   await p.screenshot({path:path.join(out,`student-${key}-${theme}-${width}.png`),fullPage:true});
  }
  await p.locator('[data-back]').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS student dictionary: imported badge absent; teacher/admin attribution; no edit/delete; light/dark desktop and mobile');
}finally{await browser.close()}})().finally(()=>server.close()).catch(e=>{console.error(e);process.exitCode=1});
