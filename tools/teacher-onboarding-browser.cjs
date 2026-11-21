// Isolated browser QA: mocked accounts and email delivery, no production writes.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'audit/teacher-onboarding');
const authFixture = `
export const applyActionCode=async()=>{if(window.scenario==='expired')throw Error('expired');window.linkApplied=true};
export const onAuthStateChanged=(_auth,cb)=>queueMicrotask(()=>cb(window.user));
export const reload=async user=>{user.emailVerified=!!window.verified};
export const signOut=async()=>{window.user=null};
export const signInWithEmailAndPassword=async()=>({user:window.user});
export const EmailAuthProvider={credential:(email,password)=>({email,password})};
export const reauthenticateWithCredential=async(user,credential)=>{if(credential.password!=='Temporary1')throw Object.assign(Error('incorrect'),{code:'auth/invalid-credential'})};
`;
const firebaseFixture = `export const db={};export const auth={get currentUser(){return window.user}};`;
const firestoreFixture = `export const doc=()=>({});export const getDoc=async()=>({data:()=>({role:'teacher',emailVerificationRequired:true,mustChangePassword:true})});`;
const apiFixture = `export async function postToApi(path,body){window.calls.push(body);if(window.failMail&&body.action==='resend')throw Error('Email service unavailable. Please retry.');return {email:'maria@school.edu',ok:true}};`;
let browser;
const imports = new Set();
const rewrite = source => source.replace(/import\s*{([\s\S]*?)}\s*from\s*["']([^"']+)["'];/g, (match, bindings, source) => {
  if(source.endsWith('/teacherTitle.js') || source.endsWith('/teacher-name.js'))return match;
  for(const binding of bindings.split(',').map(v=>v.trim()).filter(Boolean))imports.add(binding);
  return `import {${bindings}} from '/admin-fixture.js';`;
});
let adminFixture;
const server = http.createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://fixture').pathname.slice(1);
    let body, type = 'text/javascript';
    if(name==='auth-fixture.js')body=authFixture;
    else if(name==='firestore-fixture.js')body=firestoreFixture;
    else if(name==='js/firebase.js')body=firebaseFixture;
    else if(name==='js/api.js')body=apiFixture;
    else if(name==='admin-fixture.js')body=adminFixture;
    else if(name==='admin-test.html'){
      body=`<!doctype html><html><body><header id="header"></header><main id="page-content"></main><script type="module">import {renderTeachers} from '/admin/views/teachers.js';await renderTeachers();window.ready=true;</script></body></html>`;type='text/html';
    } else if(name==='teacher/index.html'){body='<p>Teacher dashboard destination</p>';type='text/html';}
    else {
      const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('path');
      body=await fs.readFile(target);
      type={'.css':'text/css','.html':'text/html','.png':'image/png'}[path.extname(name)]||type;
      if(name==='js/verify-teacher.js')body=body.toString().replace(/https:\/\/www.gstatic.com\/firebasejs\/10.12.2\/firebase-auth.js/g,'/auth-fixture.js').replace(/https:\/\/www.gstatic.com\/firebasejs\/10.12.2\/firebase-firestore.js/g,'/firestore-fixture.js');
      if(name==='admin/views/teachers.js')body=rewrite(body.toString());
      if(name==='js/teacherTitle.js')body=body.toString().replace('"./helpers.js"','"/admin-fixture.js"').replace('"./chat.js?v=removed-preview"','"/admin-fixture.js"');
    }
    res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
  } catch(error) {res.writeHead(404);res.end(error.message);}
});
(async()=>{
  rewrite(await fs.readFile(path.join(root,'admin/views/teachers.js'),'utf8'));
  const special={
    state:`{teachers:[],allClasses:[]}`,
    auth:`{currentUser:{uid:'admin'}}`,db:'{}',
    getAllTeachers:`async()=>{state.teachers=[{id:'pending',displayName:'Maria Reyes',email:'maria@school.edu',gender:'female',title:'maam',emailVerificationRequired:true,mustChangePassword:true}]}`,
    postToApi:`async(path,body)=>{window.calls.push(body);if(body.action==='statuses')return{users:[{uid:'pending',emailVerified:false}]};return{emailSent:!window.failMail,email:body.email||'maria@school.edu'}}`,
    '$':`(selector,root=document)=>root.querySelector(selector)`,
    escapeHtml:`value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))`,
    page:`(title,subtitle,actions)=>{document.querySelector('#header').innerHTML=actions}`,
    toast:`message=>window.messages.push(message)`,
    openModal:`(html,setup)=>{const modal=document.createElement('div');modal.className='modal';modal.innerHTML=html;document.body.append(modal);setup(modal,()=>modal.remove())}`,
    MIN_LENGTH:'8',
    fieldError:`(field,message)=>{window.messages.push(message)}`,
  };
  adminFixture=Object.entries(special).map(([name,value])=>`export const ${name}=${value};`).join('\n');
  adminFixture+=`\nexport const TEACHER_TITLES={maam:"Ma'am",sir:'Sir'};export const teacherName=name=>name;`;
  for(const name of imports)if(!(name in special))adminFixture+=`\nexport const ${name}=()=>{};`;
  await fs.mkdir(out,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(()=>{
    window.scenario=new URL(location.href).searchParams.get('scenario');window.verified=window.scenario==='verified';window.failMail=false;window.calls=[];window.messages=[];
    window.user=window.scenario==='signed-out'?null:{email:'maria@school.edu',emailVerified:window.verified,getIdToken:async()=> 'test-token'};
  });
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/admin-test.html');await page.waitForFunction(()=>window.ready);
  assert.match(await page.locator('.teacher-table__email').textContent(),/Pending verification/);
  await page.locator('#add-teacher').click();
  assert.equal(await page.locator('[name=title]').count(),0);
  assert.equal(await page.locator('[name=displayName]').count(),0);
  assert.equal(await page.locator('[name=firstName]').getAttribute('required'),'');
  assert.equal(await page.locator('[name=lastName]').getAttribute('required'),'');
  assert.equal(await page.locator('[name=middleName]').getAttribute('required'),null);
  await page.locator('[name=firstName]').fill('Maria');await page.locator('[name=lastName]').fill('Reyes');await page.locator('[name=gender]').selectOption('female');
  await page.locator('[name=email]').fill('maria@school.edu');await page.locator('[name=password]').fill('Temporary1');
  await page.evaluate(()=>window.failMail=true);
  await page.locator('#add-teacher-form button').click();await page.waitForFunction(()=>window.messages.length);
  assert.match(await page.evaluate(()=>window.messages[0]),/account created, but verification email could not be sent/i);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.action==='create').length),1);
  assert.equal(await page.evaluate(()=>window.calls.find(c=>c.action==='create').gender),'female');
  assert.equal(await page.evaluate(()=>window.calls.find(c=>c.action==='create').displayName),'Maria Reyes');
  assert.equal(await page.evaluate(()=>window.calls.find(c=>c.action==='create').middleName),'');
  await page.locator('.teacher-table__menu-toggle').click();
  await page.locator('[data-verify=pending]').click();await page.waitForFunction(()=>window.calls.some(c=>c.action==='resend'));
  console.log('PASS admin gender form, pending badge, creation/email failure separation and resend');
  await page.goto(base+'/verify-teacher.html');await page.locator('#verification-actions').waitFor();
  for(const theme of ['light','dark'])for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'verification overflow');
    await page.screenshot({path:path.join(out,`verify-${width}-${theme}.png`),fullPage:true});
  }
  await page.locator('#check-verification').click();assert.match(await page.locator('#setup-message').textContent(),/still pending/);
  await page.evaluate(()=>window.failMail=true);await page.locator('#resend-verification').click();
  await page.waitForFunction(()=>document.querySelector('#setup-message').textContent.includes('unavailable'));
  assert.equal(await page.locator('#resend-verification').isEnabled(),true);
  await page.evaluate(()=>window.failMail=false);await page.locator('#resend-verification').click();await page.waitForFunction(()=>document.querySelector('#resend-verification').disabled);
  assert.match(await page.locator('#setup-message').textContent(),/sent to maria/);
  await page.evaluate(()=>window.verified=true);await page.locator('#check-verification').click();await page.locator('#setup-password-form').waitFor();
  await page.locator('[name=temporaryPassword]').fill('Temporary1');await page.locator('[name=password]').fill('Temporary1');await page.locator('[name=confirmPassword]').fill('Temporary1');
  await page.locator('#setup-password-form button').click();assert.match(await page.locator('#setup-message').textContent(),/different/);
  await page.locator('[name=password]').fill('MyPassword2');await page.locator('[name=confirmPassword]').fill('Mismatch3');await page.locator('#setup-password-form button').click();assert.match(await page.locator('#setup-message').textContent(),/do not match/);
  await page.locator('[name=confirmPassword]').fill('MyPassword2');await page.screenshot({path:path.join(out,'password-setup.png'),fullPage:true});
  await page.locator('#setup-password-form button').click();await page.waitForURL('**/teacher/index.html');
  console.log('PASS pending access screen, responsive themes, resend failure/retry/cooldown, verification refresh and password setup');
  await page.goto(base+'/verify-teacher.html?scenario=expired&oobCode=test');await page.waitForFunction(()=>document.querySelector('#setup-message').textContent.includes('expired'));
  assert.ok(!page.url().includes('oobCode'));
  await page.goto(base+'/verify-teacher.html?scenario=signed-out&oobCode=test');await page.locator('#setup-signin').waitFor();assert.match(await page.locator('#setup-message').textContent(),/verified successfully/);
  assert.deepEqual(errors,[]);console.log('PASS expired links, cross-browser verification, code removal, and no browser exceptions');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
