const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'audit/register-design');
const fixture=`export const $=s=>document.querySelector(s);export const auth={};export const db={};
window.registerTest={mode:'duplicate',creates:0,rollbacks:0,writes:[]};
export const doc=(db,...parts)=>parts;
export async function createUserWithEmailAndPassword(auth,email,password){
 window.registerTest.creates++;await new Promise(r=>setTimeout(r,120));
 if(registerTest.mode==='duplicate')throw Object.assign(Error('Duplicate'),{code:'auth/email-already-in-use'});
 if(registerTest.mode==='network')throw Object.assign(Error('Offline'),{code:'auth/network-request-failed'});
 return {user:{uid:'test-student',delete:async()=>{registerTest.rollbacks++;}}};
}
export async function setDoc(ref,profile){if(registerTest.mode==='profile-failure')throw Error('Failed write');registerTest.writes.push({ref,profile});sessionStorage.setItem('test-created-profile',JSON.stringify({ref,profile}));}`;
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const server=http.createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://test').pathname.slice(1)||'register.html';
  if(name==='student/index.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<p>Signed in test student</p>');return;}
  const file=path.resolve(root,name);if(!file.startsWith(root+path.sep))throw Error('path');
  let body=name==='fixture.mjs'?fixture:await fs.readFile(file);
  if(name==='register.html')body=body.toString().replace(/<script type="module" src="js\/site-info.js"><\/script>/,'');
  if(name==='js/register.js')body=body.toString().replace(/from "(?:https:[^"]+|\.\/firebase.js|\.\/helpers.js)"/g,'from "/fixture.mjs"');
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||'text/plain')+';charset=utf-8'});res.end(body);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/register.html');await page.locator('.password-rules').waitFor();
  for(const theme of ['light','dark'])for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>{document.documentElement.dataset.theme=t;scrollTo(0,0);},theme);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`page overflow ${width} ${theme}`);
   const clipped=await page.locator('input,button,h1,legend,.password-rules li').evaluateAll(elements=>elements.filter(el=>{const r=el.getBoundingClientRect();return r.width&&((r.left<0)||(r.right>innerWidth+1)||el.scrollWidth>el.clientWidth+2);}).map(el=>el.id||el.textContent));
   assert.deepEqual(clipped,[],`clipped controls ${width} ${theme}`);
   await page.screenshot({path:path.join(out,`register-${width}-${theme}.png`),fullPage:true});
  }
  // Existing theme preference and accessible utility states.
  await page.locator('[data-theme-toggle]').click();const preference=await page.evaluate(()=>localStorage.getItem('basaya-theme'));await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),preference);
  await page.locator('[data-reveal]').click();assert.equal(await page.locator('#password').getAttribute('type'),'text');assert.equal(await page.locator('[data-reveal]').getAttribute('aria-pressed'),'true');await page.locator('[data-reveal]').click();
  await page.locator('#register-submit').click();assert.equal(await page.locator('dialog').count(),0);assert.ok(await page.locator('[aria-invalid=true]').count());
  await page.screenshot({path:path.join(out,'register-validation-320.png'),fullPage:true});
  await page.locator('#first-name').fill('Juan');await page.locator('#last-name').fill('Dela Cruz');await page.locator('#email').fill('student@example.com');await page.locator('#password').fill('StrongPass1');
  assert.equal(await page.locator('.password-rules .is-met').count(),4);
  const confirm=async()=>{await page.locator('#register-submit').click();await page.locator('dialog button').last().click();};
  await page.locator('#register-submit').click();await page.locator('dialog button').first().click();assert.equal(await page.evaluate(()=>registerTest.creates),0,'cancel makes no account');
  await confirm();await page.waitForFunction(()=>!document.querySelector('#register-submit').disabled);assert.equal(await page.locator('#email').getAttribute('aria-invalid'),'true');
  await page.evaluate(()=>registerTest.mode='network');await confirm();await page.waitForFunction(()=>document.querySelector('#register-error').textContent.includes('koneksyon'));assert.equal(await page.locator('#register-submit').isEnabled(),true);
  await page.evaluate(()=>registerTest.mode='profile-failure');await confirm();await page.waitForFunction(()=>registerTest.rollbacks===1);assert.equal(await page.locator('#register-submit').isEnabled(),true);
  await page.setViewportSize({width:1440,height:1000});await page.locator('#password').focus();await page.screenshot({path:path.join(out,'register-filled-focus.png'),fullPage:true});
  await page.evaluate(()=>registerTest.mode='success');await confirm();await page.waitForURL('**/student/index.html');
  const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('test-created-profile')));
  assert.deepEqual(saved.ref,['users','test-student']);assert.equal(saved.profile.role,'student');assert.equal(saved.profile.firstName,'Juan');assert.equal(saved.profile.lastName,'Dela Cruz');assert.equal(saved.profile.middleName,'');assert.equal(saved.profile.email,'student@example.com');
  assert.deepEqual(errors,[],'no runtime errors');
  console.log('PASS: 10 responsive theme views; validation, password reveal/checklist, theme persistence, cancellation, duplicate email, network retry, failed-profile rollback and successful registration redirect. No live accounts created.');
 }finally{await browser.close();server.close();}
})();
