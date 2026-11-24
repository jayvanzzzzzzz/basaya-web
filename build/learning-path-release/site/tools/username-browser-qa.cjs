const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const fixture=`
export const $=(s,root=document)=>root.querySelector(s);
export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const state={user:{uid:'t1',email:'teacher@example.test'},profile:{displayName:'Teacher One',gender:'female',title:'maam'}};
export const captureRoute=()=>()=>true;
export const auth={currentUser:{...state.user,getIdToken:async()=> 'fixture-token',providerData:[{providerId:'password'}]}}; export const db={};
export const page=()=>{},toast=()=>{},shell=()=>{},watchTeacherTooltips=()=>{};
export const syncThemeButtons=()=>document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>{document.documentElement.dataset.theme=b.dataset.themeChoice;localStorage.setItem('qa-theme',b.dataset.themeChoice)});
export const teacherName=name=>name; export const titleForGender=()=> 'maam';
export const genderMarkup=()=>'<input name="gender" type="hidden" value="female">';
export const doc=()=>{},updateDoc=async(ref,data)=>{if(window.lastReauth!=='Correct123')throw Error('Profile saved without password verification');window.profileWrites??=[];window.profileWrites.push(data);},updatePassword=async()=>{window.passwordUpdates=(window.passwordUpdates||0)+1;},reauthenticateWithCredential=async(user,credential)=>{window.lastReauth=credential.password;if(credential.password!=='Correct123')throw Object.assign(new Error('Invalid password'),{code:'auth/invalid-credential'});};
export const EmailAuthProvider={credential:(email,password)=>({email,password})};
export async function usernameRequest(action,body){window.calls??=[];window.calls.push({action,...body});await new Promise(r=>setTimeout(r,50));if(body.password!=='Correct123')throw Object.assign(new Error('Incorrect username or password.'),{status:401});if(body.username==='taken')throw Object.assign(new Error('That username is already taken.'),{status:409});return action==='save'?{username:body.username}:{token:'custom-token'};}
export const onAuthStateChanged=(auth,fn)=>setTimeout(()=>fn(null));
export const signInWithEmailAndPassword=async(auth,email)=>{window.loginMethod='email';throw Object.assign(new Error('Incorrect'),{code:'auth/invalid-credential'});};
export const signInWithCustomToken=async()=>{window.loginMethod='username';};
export class GoogleAuthProvider {setCustomParameters(){}};
export const signInWithPopup=async()=>{}; export const signOut=async()=>{};export const getDoc=async()=>{};
`;
let browser;
const server=http.createServer(async(req,res)=>{
  try {
    const name=new URL(req.url,'http://fixture').pathname.slice(1)||'index.html';
    let body;
    if(name==='fixture.mjs')body=fixture;
    else if(name==='settings.html'||name==='settings-admin.html') {
      const admin=name==='settings-admin.html';
      const html=await fs.readFile(path.join(root,admin?'admin/index.html':'teacher/index.html'),'utf8');
      const links=(html.match(/<link[^>]+rel="stylesheet"[^>]*>/g)||[]).join('\n').replaceAll('../','/');
      body=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${links}</head><body data-portal="${admin?'admin':'teacher'}"><main style="padding:24px;max-width:1200px;margin:auto"><div id="page-content"></div></main><script type="module">document.documentElement.dataset.theme=localStorage.getItem('qa-theme')||'light';import {${admin?'renderAccount':'renderAccountSettings'}} from '${admin?'/admin/views/account.js':'/teacher/views/accountSettings.js'}';${admin?'renderAccount':'renderAccountSettings'}();</script></body></html>`;
    } else {
      const target=path.resolve(root,name);if(!target.startsWith(root+path.sep))throw Error('Invalid path');
      body=await fs.readFile(target);
      if(name==='teacher/views/accountSettings.js'||name==='admin/views/account.js')body=body.toString().replace(/from (["'])(.*?)\1/g,(m,q,s)=> /password-rules|teacher-name|field-errors|account-sections|username-settings|profile-password/.test(s)?m:'from "/fixture.mjs"');
      if(name==='js/profile-password.js')body=body.toString().replace(/from (["'])(.*?)\1/g,'from "/fixture.mjs"');
      if(name==='js/username-settings.js')body=body.toString().replace(/from (['"])(.*?)\1/g,'from "/fixture.mjs"');
      if(name==='js/login.js')body=body.toString().replace(/from (["'])(.*?)\1/g,(m,q,s)=>/firebase|helpers|username-auth/.test(s)?'from "/fixture.mjs"':m);
      if(name==='index.html')body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')+'<script type="module" src="/js/login.js"></script>';
    }
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'}[path.extname(name)]||'application/octet-stream')+';charset=utf-8'});res.end(body);
  }catch(e){res.writeHead(404);res.end(e.message);}
});
(async()=>{
  await fs.mkdir(path.join(root,'audit/username-auth'),{recursive:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const url=`http://127.0.0.1:${server.address().port}`;
  for(const role of ['teacher','admin']) {
  await page.goto(url+(role==='admin'?'/settings-admin.html':'/settings.html'));
  assert.deepEqual(await page.locator('[role=tab]').allTextContents(),['Profile Info','Username','Account Security']);
  await page.locator('[data-settings-tab=username]').click();
  const form=page.locator('#account-username-form');await form.waitFor();
  await form.locator('[name=username]').fill('Teacher_One');
  await form.locator('button[type=submit]').click();assert.equal(await page.evaluate(()=>window.calls?.length||0),0,'Password required');
  await form.locator('[name=currentPassword]').fill('Wrong123');await form.locator('button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#username-status').textContent.includes('Incorrect username or password'));
  assert.equal(await form.locator('[name=currentPassword]').inputValue(),'');
  await form.locator('[name=username]').fill('taken');await form.locator('[name=currentPassword]').fill('Correct123');await form.locator('button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#username-status').textContent.includes('already taken'));
  await form.locator('[name=username]').fill('Teacher_One');await form.locator('[name=currentPassword]').fill('Correct123');await form.locator('button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#username-status').textContent.includes('Username saved'));
  assert.equal(await form.locator('[name=username]').inputValue(),'teacher_one');
  await form.locator('[name=username]').fill('draft_username');
  await page.locator('[data-settings-tab=profile]').click();
  const profile=page.locator(role==='admin'?'#admin-profile-form':'#account-profile-form');
  await profile.locator('[name=displayName]').fill('Updated Name');
  await profile.locator('[type=submit]').click();
  assert.equal(await page.evaluate(()=>window.profileWrites?.length||0),0,'Profile requires a password');
  await profile.locator('[name=currentPassword]').fill('Wrong123');
  await profile.locator('[type=submit]').click();
  await page.waitForFunction(selector=>document.querySelector(selector+' [name=currentPassword]').getAttribute('aria-invalid')==='true',role==='admin'?'#admin-profile-form':'#account-profile-form');
  assert.equal(await page.evaluate(()=>window.profileWrites?.length||0),0,'Wrong password cannot save profile');
  assert.equal(await profile.locator('[name=currentPassword]').inputValue(),'','Rejected password cleared');
  await profile.locator('[name=currentPassword]').fill('Correct123');
  await profile.locator('[type=submit]').click();
  await page.waitForFunction(()=>window.profileWrites?.length===1);
  assert.equal(await profile.locator('[name=currentPassword]').inputValue(),'','Verified password cleared');
  await profile.locator('[type=submit]').click();
  assert.equal(await page.evaluate(()=>window.profileWrites?.length||0),1,'Every save requires entering password again');
  const saved=await page.evaluate(()=>window.profileWrites[0]);assert.equal(saved.displayName,'Updated Name');assert.equal(saved.username,undefined);assert.equal(saved.password,undefined);
  await page.locator('[data-settings-tab=username]').click();assert.equal(await form.locator('[name=username]').inputValue(),'draft_username','Other drafts survive profile save');
  await page.locator('[data-settings-tab=username]').press('ArrowUp');
  assert.equal(await page.locator('[data-settings-tab=profile]').getAttribute('aria-selected'),'true');
  await page.locator('[data-settings-tab=profile]').press('End');
  assert.equal(await page.locator('[data-settings-tab=security]').getAttribute('aria-selected'),'true');
  const security=page.locator(role==='admin'?'#admin-password-form':'#account-password-form');
  if(role==='admin') {
    assert.equal(await page.locator('#admin-reset-link, #admin-password-sent, #admin-password-again').count(),0,'Approval and reset sections removed');
    assert.equal(await security.locator('[type=submit]').textContent(),'Update password');
  }
  await security.locator('[name=currentPassword]').fill('Wrong123');await security.locator('[name=newPassword]').fill('NewStrong123');await security.locator('[name=confirmPassword]').fill('NewStrong123');
  await security.locator('[type=submit]').click();
  await page.waitForFunction(selector=>document.querySelector(selector+' [name=currentPassword]').getAttribute('aria-invalid')==='true',role==='admin'?'#admin-password-form':'#account-password-form');
  assert.equal(await page.evaluate(()=>window.passwordUpdates||0),0,'Incorrect current password cannot change the password');
  await security.locator('[name=currentPassword]').fill('Correct123');await security.locator('[name=newPassword]').fill('NewStrong123');await security.locator('[name=confirmPassword]').fill('NewStrong123');
  await security.locator('[type=submit]').click();
  await page.waitForFunction(()=>window.passwordUpdates===1);
  assert.equal(await security.locator('[name=currentPassword]').inputValue(),'');
  assert.equal(await security.locator('[name=newPassword]').inputValue(),'');
  for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});await page.locator(`[data-theme-choice=${theme}]`).click();
    for(const section of ['username','profile','security']) {
    await page.locator(`[data-settings-tab=${section}]`).click();
    await page.locator(`[data-settings-tab=${section}]`).focus();
    await page.locator(`[data-settings-tab=${section}]`).hover();
    assert.equal(await page.locator('[role=tabpanel]:visible').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`settings overflow ${width}`);
    await page.screenshot({path:path.join(root,`audit/username-auth/${role}-${section}-${theme}-${width}.png`),fullPage:true});
  }
    }
  await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  }
  await page.goto(url);await page.locator('#login-view').waitFor({state:'visible'});
  await page.locator('#email').fill('teacher_one');await page.locator('#password').fill('Correct123');await page.locator('#login-form [type=submit]').click();
  await page.waitForFunction(()=>window.loginMethod==='username');
  await page.reload();await page.locator('#login-view').waitFor({state:'visible'});
  await page.locator('#email').fill('teacher@example.test');await page.locator('#password').fill('Wrong123');await page.locator('#login-form [type=submit]').click();
  await page.waitForFunction(()=>window.loginMethod==='email');
  for(const theme of ['light','dark'])for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(root,`audit/username-auth/login-${theme}-${width}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('PASS: teacher/admin independent sections, keyboard navigation, preserved drafts, password-confirmed profile saves, immediate password updates, removed admin email controls, username/email login; desktop/tablet/mobile light and dark layouts. Screenshots: audit/username-auth.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
