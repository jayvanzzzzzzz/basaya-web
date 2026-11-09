// Exercise the real login UI with local authentication stubs; no live sign-ins.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname,'..');
const artifacts = path.join(root,'audit/login-design');
const fixture = `export const $=s=>document.querySelector(s); export const auth={}; export const db={};
export const onAuthStateChanged=(auth,callback)=>setTimeout(()=>callback(null));
export const signInWithEmailAndPassword=async()=>{await new Promise(r=>setTimeout(r,250));throw Object.assign(new Error('Invalid'),{code:'auth/invalid-credential'});};
export class GoogleAuthProvider {setCustomParameters(){}};
export const signInWithPopup=async()=>{throw Object.assign(new Error('Closed'),{code:'auth/popup-closed-by-user'});};
export const signOut=async()=>{}; export const doc=()=>{}; export const getDoc=async()=>{};
export const sendResetLink=async()=>{};`;
let browser;
const server = http.createServer(async(req,res)=>{
  try {
    const name=decodeURIComponent(new URL(req.url,'http://fixture').pathname).slice(1)||'index.html';
    const target=path.resolve(root,name);
    if(!target.startsWith(root+path.sep)) throw Error('Invalid path');
    let body= name==='fixture.mjs'?fixture:await fs.readFile(target);
    if(name==='index.html') body=body.toString().replace(/<script type="module">[\s\S]*?<\/script>/,'<script type="module" src="js/login.js"></script>').replace(/<script src="js\/pwa-install.js" defer><\/script>/,'');
    if(name==='js/login.js') body=body.toString().replace(/from "(?:https:[^"]+|\.\/firebase.js|\.\/helpers.js)"/g,'from "/fixture.mjs"');
    if(name==='js/forgot-password.js') body=body.toString().replace('from "./api.js"','from "/fixture.mjs"');
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream')+';charset=utf-8'});res.end(body);
  } catch(e){res.writeHead(404);res.end(e.message);}
});
(async()=>{
  const html=await fs.readFile(path.join(root,'index.html'),'utf8');
  const original=execFileSync('git',['show','HEAD:index.html'],{cwd:root,encoding:'utf8'});
  assert.equal(html.replace(/    <link rel="stylesheet" href="css\/pages\/login-editorial.css[^\n]+\r?\n/,'').replace('<body class="login-editorial">','<body>').replace(/\r/g,''),original.replace(/\r/g,''),'Every existing word and the original markup are preserved');
  await fs.mkdir(artifacts,{recursive:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url);await page.locator('#login-view').waitFor({state:'visible'});
  for(const theme of ['light','dark']) {
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    for(const width of [1440,1024,768,390,320]) {
      await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow '+width);
      assert.ok(await page.locator('#email').isVisible());
      assert.ok(await page.locator('#google-login').isVisible());
      for(const tab of ['class','report','bigkas','chat']) {
        await page.locator('#showcase-tab-'+tab).click();
        assert.equal(await page.locator('#showcase-tab-'+tab).getAttribute('aria-selected'),'true');
        assert.ok(await page.locator('#showcase-panel-'+tab).isVisible());
      }
      await page.locator('#showcase-tab-class').click();await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(artifacts,'login-'+width+'-'+theme+'.png'),fullPage:true});
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#password').fill('ExamplePassword1');await page.locator('#password-toggle').click();
  assert.equal(await page.locator('#password').getAttribute('type'),'text');
  await page.locator('#email').fill('teacher@example.com');await page.locator('.login-submit').click();
  await page.waitForFunction(()=>document.querySelector('#login-error').textContent==='Incorrect email or password.');
  assert.equal(await page.locator('#password').getAttribute('type'),'password');
  assert.equal(await page.locator('.login-submit').isEnabled(),true);
  await page.locator('[data-forgot-open]').click();await page.locator('#forgot-password').waitFor({state:'visible'});
  assert.equal(await page.locator('#forgot-password input').inputValue(),'teacher@example.com');
  await page.keyboard.press('Escape');
  await page.locator('.get-app-trigger[data-get-app-open]').click();await page.locator('#get-app').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await page.locator('[data-theme-toggle]').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.evaluate(()=>localStorage.setItem('basaya.recentAccounts.v1',JSON.stringify([{uid:'fixture',name:'Maria Santos',email:'maria@school.edu',provider:'password'}])));
  await page.reload();await page.locator('#recent-accounts').waitFor({state:'visible'});
  await page.screenshot({path:path.join(artifacts,'recent-accounts.png'),fullPage:true});
  await page.getByRole('button',{name:'Sign in as Maria Santos'}).click();
  assert.equal(await page.locator('#email').inputValue(),'maria@school.edu');
  assert.ok(await page.locator('#login-email-field').isHidden());
  await page.screenshot({path:path.join(artifacts,'selected-account.png'),fullPage:true});
  await page.locator('#back-to-accounts').click();await page.locator('#another-account').click();
  assert.ok(await page.locator('#login-email-field').isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS: exact original copy preserved; 1440/1024/768/390/320 in both themes; all carousel tabs; password visibility; login error; recovery/app dialogs; theme; recent accounts. No live sign-ins. Screenshots: audit/login-design');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
