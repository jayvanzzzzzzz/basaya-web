const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'audit/individual-deadlines');
const keep=['helpers.js','field-errors.js','schedule.js','deadline-students.js','deadline-policy.js','action-confirmation.js'];
const names=new Set();let fixture,browser;
function rewrite(source){return source.replace(/import\s*{([\s\S]*?)}\s*from\s*["']([^"']+)["'];/g,(match,bindings,src)=>{
 if(keep.includes(src.split('/').pop()))return match;
 bindings.split(',').map(item=>item.trim()).filter(Boolean).forEach(item=>names.add(item.split(/\s+as\s+/)[0]));return `import {${bindings}} from '/fixture.mjs';`;
});}
const server=http.createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://fixture').pathname.slice(1);let body,type='text/javascript';
 if(name==='fixture.mjs'||name==='js/state.js')body=fixture;
 else if(name==='teacher/deadline-test.html'){
  const original=await fs.readFile(path.join(root,'teacher/index.html'),'utf8');
  const styles=[...original.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(match=>match[0]).join('');
  const template=original.match(/<template id="modal-template"[\s\S]*?<\/template>/)[0];
  body=`<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<script>document.documentElement.dataset.theme=localStorage.getItem('basaya-theme')||'light'</script></head><body data-portal="teacher"><main class="content"><h1>Lesson deadline</h1><button id="open">Extend deadline</button></main>${template}<div id="toast"></div><script type="module">import {openExtendModal} from './views/classPage.js';import {Timestamp} from '/fixture.mjs';document.querySelector('#open').onclick=()=>openExtendModal('class1',{id:'lesson',lessonId:'lesson',dueAt:Timestamp.fromMillis(Date.now()+86400000),openAt:null},{title:'Ang Alamat ng Pinya'},()=>{window.saved=true});window.calls=[];</script></body></html>`;type='text/html';
 }else{
  const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('Invalid path');body=await fs.readFile(target);
  type={'.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||type;
  if(['teacher/views/classPage.js','teacher/views/deadline-students.js','js/schedule.js'].includes(name))body=rewrite(body.toString());
  if(name==='teacher/views/classPage.js')body=body.replace('function openExtendModal','export function openExtendModal');
 }res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
}catch(error){res.writeHead(404);res.end(error.message);}});
(async()=>{
 for(const file of ['teacher/views/classPage.js','teacher/views/deadline-students.js','js/schedule.js'])rewrite(await fs.readFile(path.join(root,file),'utf8'));
 const special={
  state:'{user:{uid:"teacher"},allLessons:[]}',db:'{}',
  Timestamp:`{fromMillis:n=>({toMillis:()=>n,toDate:()=>new Date(n)}),fromDate:date=>({toMillis:()=>date.getTime(),toDate:()=>date})}`,
  collection:'(_db,...parts)=>({path:parts.join("/")})',doc:'(_db,...parts)=>({path:parts.join("/")})',
  getDocs:`async()=>({docs:[{id:'s1',data:()=>({fullName:'Ana Cruz'})},{id:'s2',data:()=>({fullName:'Ben Reyes'})},{id:'inactive',data:()=>({fullName:'Inactive Student'})},{id:'s3',data:()=>({fullName:'Carlo Santos'})}]})`,
  getDoc:`async ref=>({data:()=>({role:'student',classId:'class1',disabled:ref.path.endsWith('/inactive'),lrn:ref.path.endsWith('/s2')?'123456789002':'123456789001',username:ref.path.split('/').at(-1)})})`,
  postToApi:`async(path,body)=>{window.calls.push({path,...body});if(window.failSave)throw Error('A selected student is deactivated. Refresh the list.');return {ok:true,updated:body.studentIds?.length||1};}`,
 };
 fixture=Object.entries(special).map(([key,value])=>`export const ${key}=${value};`).join('\n');for(const name of names)if(!(name in special))fixture+=`\nexport const ${name}=()=>{};`;
 await fs.mkdir(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/teacher/deadline-test.html');await page.locator('#open').click();
 await page.locator('[name=audience][value=students]').check();await page.waitForFunction(()=>document.querySelectorAll('[data-deadline-student]').length===3);
 assert.equal(await page.locator('[data-deadline-student=inactive]').count(),0);
 assert.ok(await page.locator('.extend-deadline__notify').isHidden());
 await page.locator('[data-deadline-search]').fill('123456789002');assert.equal(await page.locator('[data-deadline-student]:visible').count(),1);
 await page.locator('[data-deadline-all]').check();assert.equal(await page.locator('[data-deadline-count]').textContent(),'1 selected');
 await page.locator('[data-deadline-search]').fill('Ana');await page.locator('[data-deadline-all]').check();
 await page.locator('[data-deadline-search]').fill('');assert.equal(await page.locator('[data-deadline-count]').textContent(),'2 selected');
 for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('basaya-theme',theme)},theme);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'picker-'+theme+'-'+width+'.png'),fullPage:true});
 }
 await page.locator('#extend-form [type=submit]').click();await page.locator('dialog.action-confirmation').waitFor();
 assert.match(await page.locator('dialog.action-confirmation').textContent(),/2 selected active students/);
 await page.locator('dialog.action-confirmation button').filter({hasText:'Cancel'}).click();assert.equal(await page.evaluate(()=>window.calls.length),0);
 await page.locator('#extend-form [type=submit]').click();await page.locator('dialog.action-confirmation button').filter({hasText:'Extend deadline'}).click();
 await page.waitForFunction(()=>window.saved);
 const call=await page.evaluate(()=>window.calls[0]);assert.equal(call.action,'extend-students');assert.deepEqual(call.studentIds.sort(),['s1','s2']);
 await page.locator('#open').click();await page.locator('[name=notify]').uncheck();await page.locator('#extend-form [type=submit]').click();await page.locator('dialog.action-confirmation button').filter({hasText:'Extend deadline'}).click();
 await page.waitForFunction(()=>window.calls.length===2);assert.equal((await page.evaluate(()=>window.calls[1])).action,'schedule');
 assert.deepEqual(errors,[]);
 console.log('PASS: actual extend dialog, active-only searchable list, multi-select/select shown across searches, exact audience confirmation, cancellation, targeted and whole-class saves, both themes at desktop/tablet/mobile. API/data mocked.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
