const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const fixture = `
export const auth={}, db={}; export const $=s=>document.querySelector(s);
let listener;
export function onAuthStateChanged(a, cb) { listener=cb; setTimeout(()=>cb(new URLSearchParams(location.search).has('profile')?{uid:'teacher'}:null)); }
export async function signInWithEmailAndPassword() { throw Object.assign(new Error('Invalid'),{code:window.invalid?'auth/invalid-credential':'auth/user-disabled'}); }
export const signInWithCustomToken=signInWithEmailAndPassword;
export async function signOut() { window.signedOut=true; await listener(null); }
export const doc=()=>({});
export const getDoc=async()=>({exists:()=>true,data:()=>({role:'teacher',disabled:true})});
`;
const server = http.createServer(async (req,res)=>{
  try {
    const name = new URL(req.url,'http://local').pathname.slice(1)||'index.html';
    const target = path.resolve(root,name);
    if (!target.startsWith(root+path.sep)) throw Error('Invalid path');
    let body = name==='fixture.mjs'?fixture:await fs.readFile(target);
    if(name==='index.html') body=body.toString().replace(/<script type="module"[\s\S]*?<\/script>/g,'').replace('</body>','<script type="module" src="js/login.js"></script><script type="module" src="js/theme.js"></script></body>');
    if(name==='js/login.js') body=body.toString().replace(/from "(?:https:[^"]+|\.\/firebase.js|\.\/helpers.js)"/g,'from "/fixture.mjs"');
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream')}); res.end(body);
  } catch(e) {res.writeHead(404);res.end(e.message);}
});
(async()=>{
  await fs.mkdir(path.join(root,'audit/deactivation'),{recursive:true});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const page=await browser.newPage({reducedMotion:'reduce'});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    const url=`http://127.0.0.1:${server.address().port}`;
    await page.goto(url); await page.locator('#login-view').waitFor({state:'visible'});
    await page.locator('#email').fill('teacher@school.edu');
    await page.locator('#password').fill('ExamplePassword1');
    await page.locator('.login-submit').click();
    await page.locator('#deactivated-view').waitFor({state:'visible'});
    assert.equal(await page.locator('#password').inputValue(),'');
    assert.ok(await page.locator('#login-view').isHidden());
    assert.equal(await page.locator('#deactivated-title').evaluate(e=>e===document.activeElement),true);
    for(const theme of ['light','dark']) {
      await page.evaluate(t=>{document.documentElement.dataset.theme=t;localStorage.setItem('basaya-theme',t);},theme);
      for(const width of [1440,768,390,320]) {
        await page.setViewportSize({width,height:900});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(root,`audit/deactivation/${theme}-${width}.png`),fullPage:true});
      }
    }
    await page.locator('#deactivated-back').focus(); await page.keyboard.press('Enter');
    assert.ok(await page.locator('#login-form').isVisible());
    await page.locator('[data-theme-toggle]').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('basaya-theme')),'light');
    await page.reload(); await page.locator('#login-view').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
    await page.evaluate(()=>window.invalid=true);
    await page.locator('#email').fill('teacher@school.edu'); await page.locator('#password').fill('wrong');
    await page.locator('.login-submit').click();
    await page.waitForFunction(()=>document.querySelector('#login-error').textContent.includes('Incorrect'));
    assert.ok(await page.locator('#deactivated-view').isHidden());
    await page.goto(url+'?profile'); await page.locator('#deactivated-view').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>window.signedOut),true);
    await page.locator('#deactivated-back').click(); assert.ok(await page.locator('#login-view').isVisible());
    await page.evaluate(()=>sessionStorage.setItem('basayaAccountDeactivated','true'));
    await page.goto(url); await page.locator('#deactivated-view').waitFor({state:'visible'});
    await page.reload(); await page.locator('#deactivated-view').waitFor({state:'visible'});
    await page.locator('#deactivated-back').click();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('basayaAccountDeactivated')),null);
    await page.reload(); await page.locator('#login-view').waitFor({state:'visible'});
    assert.deepEqual(errors,[]);
    console.log('PASS: Firebase disabled error, disabled teacher profile with sign-out callback, session handoff, reload, keyboard return, password cleared, invalid credentials unchanged, theme switch/persistence, no overflow at desktop/tablet/mobile in both themes; no live accounts modified.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
