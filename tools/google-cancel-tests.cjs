const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const fixture=`export const $=s=>document.querySelector(s);export const auth={app:{options:{authDomain:location.hostname}},currentUser:null};export const db={};
let observer; export const onAuthStateChanged=(a,cb)=>{observer=cb;setTimeout(()=>cb(null),0);};
export class GoogleAuthProvider{setCustomParameters(){}}
window.popupCalls=[];window.emailCalls=[];window.mode='pending';
export const signInWithPopup=async()=>{
 if(window.mode==='blocked')throw Object.assign(Error('Blocked'),{code:'auth/popup-blocked'});
 await new Promise(r=>setTimeout(r,60));
 const popup=window.open('/__/auth/handler','google-'+window.popupCalls.length,'width=500,height=600');
 return new Promise((resolve,reject)=>window.popupCalls.push({popup,resolve,reject}));
};
export const signInWithEmailAndPassword=()=>new Promise((resolve,reject)=>window.emailCalls.push({resolve,reject}));
export const signOut=async()=>{auth.currentUser=null;observer(null)};
export const doc=()=>({});export const getDoc=async()=>({exists:()=>true,metadata:{fromCache:false},data:()=>({role:'student',firstName:'Test',lastName:'User'})});
window.finishGoogle=()=>{auth.currentUser={uid:'test',email:'test@example.com',displayName:'Test',providerData:[{providerId:'google.com'}]};observer(auth.currentUser);};`;
(async()=>{
 const server=http.createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html';
 if(name==='__/auth/handler'||name==='student/index.html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<p>Local auth test</p>');return;}
 let body=name==='fixture.mjs'?fixture:await fs.readFile(path.join(root,name));
 if(name==='index.html')body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')+'<script type="module" src="js/login.js"></script>';
 if(name==='js/login.js')body=body.toString().replace(/from "(?:https:[^"]+|\.\/firebase.js|\.\/helpers.js)"/g,'from "/fixture.mjs"');
 res.writeHead(200,{'Content-Type':({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'}[path.extname(name)]||'text/plain')});res.end(body);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage();const url='http://127.0.0.1:'+server.address().port;
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(url);await page.locator('#login-view').waitFor({state:'visible'});
 const open=async()=>{const promise=page.waitForEvent('popup');await page.locator('#google-login').click();const popup=await promise;await popup.waitForLoadState();return popup;};
 const idle=async()=>{await page.waitForFunction(()=>!document.querySelector('#google-login').disabled);assert.equal(await page.locator('#login-form').getAttribute('aria-busy'),'false');assert.equal(await page.locator('.login-submit__label').textContent(),'Sign in to BASAya');};
 const first=await open();assert.equal(await page.locator('#google-login').isDisabled(),true);await first.close();await idle();
 assert.equal(await page.locator('#login-error').textContent(),'','closing chooser is quiet');
 const second=await open();await page.evaluate(()=>popupCalls[0].reject(Object.assign(Error('Closed'),{code:'auth/popup-closed-by-user'})));
 assert.equal(await page.locator('#google-login').isDisabled(),true,'old finally cannot release new attempt');
 await second.close();await idle();
 // A late failure from the popup must not stop a new email/password sign-in.
 await page.locator('#email').fill('test@example.com');await page.locator('#password').fill('password');await page.locator('#login-form [type=submit]').click();
 await page.evaluate(()=>popupCalls[1].reject(Object.assign(Error('Old network failure'),{code:'auth/network-request-failed'})));
 assert.equal(await page.locator('#google-login').isDisabled(),true);assert.equal(await page.locator('#login-error').textContent(),'');
 await page.evaluate(()=>emailCalls[0].reject(Object.assign(Error('Wrong credentials'),{code:'auth/invalid-credential'})));await idle();
 await page.evaluate(()=>window.mode='blocked');await page.locator('#google-login').click();await idle();assert.match(await page.locator('#login-error').textContent(),/Allow pop-up/);
 await page.evaluate(()=>window.mode='pending');const success=await open();await success.close();await idle();
 await page.evaluate(()=>{finishGoogle();popupCalls[2].resolve({user:{uid:'test'}});});await page.waitForURL('**/student/index.html');
 console.log('PASS: real popup closure before SDK rejection, immediate retry, stale popup errors/finally, email retry, blocked popup, and successful auth arriving after popup closure.');
 }finally{await browser.close();server.close();}
})();
