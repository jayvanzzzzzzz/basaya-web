// Real student dialogs/contact form, isolated transport. No messages leave this fixture.
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const audit=require('./text-readability-audit.cjs'),root=path.resolve(__dirname,'..'),out=path.join(root,'audit','contact-cooldown');
const portal='teacher';
const previewPath=portal==='public'?'preview.html':portal+'/preview.html';
const sourcePage=portal==='public'?'index.html':portal+'/index.html';
const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local').pathname.slice(1);let body,type='text/javascript';
if(name===previewPath||name==='login-preview.html'){type='text/html';body=(await fs.readFile(path.join(root,name==='login-preview.html'?'index.html':sourcePage),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>',`<script type="module">import '/js/site-info.js';import '/js/theme.js';document.documentElement.dataset.theme=localStorage.getItem('basaya-theme')||'light';const loading=document.querySelector('#loading-screen');if(loading)loading.hidden=true;const login=document.querySelector('#login-view');if(login)login.hidden=false;document.querySelectorAll('.account-loading').forEach(element=>element.hidden=true);const app=document.querySelector('#app-view');if(app)app.hidden=false;window.ready=true;</script></body>`);}
else if(name==='js/state.js')body='export const state={};';
else if(name==='js/api.js')body=`export const contactStatus=async()=>({retryAt:Number(localStorage.getItem('qaContactRetryAt')||0)});export const sendContact=async fields=>{window.sendCount=(window.sendCount||0)+1;if(window.failSend)throw Error('Synthetic delivery failure');const retryAt=Date.now()+3600000;localStorage.setItem('qaContactRetryAt',retryAt);window.sent=fields;return {ok:true,retryAt}};`;
else{const target=path.resolve(root,name);if(!target.startsWith(root+path.sep)||name.split('/').some(s=>s.startsWith('.')))throw Error('path');body=await fs.readFile(target);type={'.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.html':'text/html'}[path.extname(name)]||type;}res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);}catch(e){res.writeHead(404);res.end(e.message)}});
(async()=>{
 await fs.mkdir(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
  p.on('pageerror',error=>errors.push(error.message));await p.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const base='http://127.0.0.1:'+server.address().port;
  await p.goto(base+'/login-preview.html');await p.waitForFunction(()=>window.ready);
  assert.equal(await p.locator('[data-site-info=contact]').count(),0);
  await p.locator('[data-site-info=about]').click();assert.equal(await p.locator('[data-tab=contact]').count(),0);assert.equal(await p.locator('[data-contact-form]').count(),0);
  await p.locator('[data-tab=about]').focus();await p.keyboard.press('ArrowRight');assert.equal(await p.locator('[data-tab=privacy]').getAttribute('aria-selected'),'true');await p.keyboard.press('ArrowRight');assert.equal(await p.locator('[data-tab=about]').getAttribute('aria-selected'),'true');
  await p.keyboard.press('Escape');await p.locator('dialog.site-info').waitFor({state:'hidden'});
  await p.goto(base+'/'+previewPath);await p.waitForFunction(()=>window.ready);await p.locator('[data-site-info=contact]').click();await p.waitForFunction(()=>!document.querySelector('.contact__send').disabled);
  await p.locator('[name=name]').fill('QA Account');await p.locator('[name=email]').fill('reply@example.test');await p.locator('[name=message]').fill('Synthetic contact submission for cooldown verification.');
  await p.evaluate(()=>window.failSend=true);await p.locator('.contact__send').click();await p.locator('[data-contact-error]').filter({hasText:'Synthetic'}).waitFor();assert.ok(await p.locator('.contact__send').isEnabled());
  await p.evaluate(()=>window.failSend=false);await p.locator('.contact__send').click();await p.locator('[data-contact-done]').waitFor();assert.ok(await p.locator('[data-contact-again]').isDisabled());assert.equal(await p.evaluate(()=>window.sendCount),2);
  for(const theme of ['light','dark'])for(const width of [1440,390,320]){await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('basaya-theme',theme)},theme);await p.setViewportSize({width,height:1000});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(out,'success-'+theme+'-'+width+'.png')});}
  await p.reload();await p.waitForFunction(()=>window.ready);await p.locator('[data-site-info=contact]').click();assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),'dark');await p.waitForFunction(()=>document.querySelector('.contact__send span').textContent.includes('Send again in'));assert.ok(await p.locator('.contact__send').isDisabled());assert.match(await p.locator('[data-contact-cooldown]').innerText(),/available at/);
  await p.screenshot({path:path.join(out,'reloaded-cooldown-dark-320.png')});
  await p.evaluate(()=>{const now=Date.now();Date.now=()=>now+3600001});await p.waitForFunction(()=>!document.querySelector('.contact__send').disabled);
  assert.equal(await p.locator('.contact__send span').innerText(),'Send message');assert.deepEqual(errors,[]);
  console.log('PASS: actual login has no Contact link/tab/form; public About/Privacy keyboard tabs work; signed-in form failure/retry, one-hour disabled resend, reload persistence, automatic expiry, both themes at desktop/mobile/320. Transport mocked; no messages sent.');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1;server.close()});
