const assert=require('node:assert/strict');
const http=require('node:http');const fs=require('node:fs/promises');const path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'audit/dictionary-design');
const fixture=`
export const state={user:{uid:'teacher'},profile:{role:location.pathname.split('/')[1]},};
export {normalizeWord} from '/js/dictionaryWords.js';
export const MAX_SENSES=4,MAX_WORD=80,PARTS_OF_SPEECH=['pangngalan','pandiwa'];
let words=Array.from({length:24},(_,i)=>({key:i===0?'bahay':'salita'+i,word:i===0?'bahay':'salita'+i,accent:'',source:i===1?'teacher':'wiktionary',createdBy:i===1?'teacher':'seed',syllables:'',synonyms:i===0?['salita1']:[],senses:[{pos:'pangngalan',definitions:['Gusali na tirahan ng tao. Isang kahulugan na madaling basahin at maunawaan ng mga mag-aaral.'],examples:['Malaki ang bahay nila.']}]}));
export const allWords=async()=>{await new Promise(r=>setTimeout(r,60));if(window.failLoad)throw Error('Load failure');return location.search.includes('empty')?[]:words};
export const syllablesOf=e=>e.word==='bahay'?'ba·hay':e.word;
export const lookupWord=async w=>words.find(e=>e.word===w);
export const saveWord=async(fields)=>{window.saved=fields};export const renameWord=saveWord;
export const deleteWord=async e=>{window.deleted=e.key;words=words.filter(w=>w.key!==e.key)};
export const restoreWord=async()=>{};
export const speakWord=(button,entry)=>{window.spoken=entry.key;button.classList.add('is-playing')};
`;
const stubs=['js/state.js','js/dictionary.js','js/tts.js'];
const server=http.createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://preview').pathname).slice(1);let body,type='text/javascript';
 if(name==='fixture.mjs')body=fixture;
 else if(/^(teacher|admin)\/dictionary-preview.html$/.test(name)){
 const role=name.split('/')[0];body=(await fs.readFile(path.join(root,role,'index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/type="module"/.test(s)?'':s).replace('</body>',`<script type="module">import {renderDictionary} from '/teacher/views/dictionary.js';document.querySelector('#loading-screen').hidden=true;document.querySelector('#app-view').hidden=false;document.querySelector('[data-nav="dictionary"]').classList.add('active');window.failLoad=location.search.includes('error');await renderDictionary();window.ready=true;</script></body>`);type='text/html';
 }else{
 const target=path.resolve(root,name);if(!target.startsWith(root+path.sep)||name.split(/[\\/]/).some(p=>p.startsWith('.')))throw Error('Invalid path');body=await fs.readFile(target);type={'.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||type;
 if(name.endsWith('.js'))body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,(m,q,src)=>stubs.includes(path.posix.normalize(path.posix.join(path.posix.dirname(name),src)))?`from '/fixture.mjs'`:m);
 }res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
 }catch(e){res.writeHead(404);res.end(e.message)}});
(async()=>{await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
for(const role of ['teacher','admin']){
 const url=`http://127.0.0.1:${server.address().port}/${role}/dictionary-preview.html`;
 await p.goto(url);await p.waitForSelector('.dict-row');assert.equal(await p.locator('#dict-total').innerText(),'24');
 for(const theme of ['light','dark']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);for(const width of [1440,768,390,320]){
 await p.setViewportSize({width,height:1000});await p.screenshot({path:path.join(out,`${role}-${width}-${theme}.png`),fullPage:true});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${role}/${theme}/${width} overflow`);
 }}
 await p.locator('[data-page="next"]').click();assert.equal(await p.locator('[aria-current="page"]').innerText(),'2');
 await p.locator('#dict-search').fill('bah');await p.waitForTimeout(250);assert.equal(await p.locator('.dict-row:visible').count(),1);
 await p.locator('[data-act="open"]').click();assert.equal(await p.locator('.dict-entry h2').innerText(),'bahay');
 await p.locator('[data-act="speak"]').click();assert.equal(await p.evaluate(()=>window.spoken),'bahay');
 assert.equal(await p.locator('[data-act="delete"]').count(),role==='admin'?1:0);
 for(const width of [1440,390,320]){await p.setViewportSize({width,height:1000});await p.screenshot({path:path.join(out,`${role}-entry-${width}.png`),fullPage:true});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await p.locator('[data-act="speak"]').focus();await p.keyboard.press('Tab');await p.waitForTimeout(250);assert.equal(await p.locator('[data-act="edit"] > span').evaluate(e=>getComputedStyle(e).opacity),'1');
 await p.locator('[data-act="edit"]').click();assert.equal(await p.locator('[name="word"]').getAttribute('readonly'),role==='teacher'?'':null);
 for(const width of [1440,390,320]){await p.setViewportSize({width,height:1000});await p.screenshot({path:path.join(out,`${role}-form-${width}.png`),fullPage:true});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await p.locator('[data-close]').click();await p.locator('[data-act="back"]').click();await p.locator('[data-letter="s"]').click();assert.equal(await p.locator('[data-letter="s"]').getAttribute('aria-pressed'),'true');
 await p.locator('#dict-filter').selectOption('teacher');assert.equal(await p.locator('.dict-row:visible').count(),1);
 await p.locator('#dict-search').fill('zzzz');await p.waitForTimeout(250);await p.locator('[data-add-typed]').click();assert.equal(await p.locator('[name="word"]').inputValue(),'zzzz');await p.locator('[data-close]').click();
 await p.goto(url+'?error');await p.waitForSelector('[data-retry]');await p.evaluate(()=>window.failLoad=false);await p.locator('[data-retry]').click();await p.waitForSelector('.dict-row');
 await p.goto(url+'?empty');await p.waitForSelector('.dict-empty');await p.waitForFunction(()=>document.querySelector('#dict-total').textContent==='0');await p.screenshot({path:path.join(out,`${role}-empty.png`),fullPage:true});
}
assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'results.json'),JSON.stringify({passed:true,checks:'Both roles; light/dark 1440/768/390/320; search; filters; alphabet pressed state; pagination; details; audio callback; permissions; tooltips; edit modal; typed-word add; load retry; empty state',errors},null,2));console.log('PASS dictionary design and interaction checks');
}finally{await browser.close()}})().finally(()=>server.close()).catch(e=>{console.error(e);process.exitCode=1});
