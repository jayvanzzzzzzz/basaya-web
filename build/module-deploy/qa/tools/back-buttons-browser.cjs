// Shared Back controls, actual styles and theme initialization; no account/API writes.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'audit/back-buttons');
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local');let body,type='text/javascript';
  if(url.pathname==='/fixture.html'){
   const portal=url.searchParams.get('portal')||'teacher';
   const page=await fs.readFile(path.join(root,portal==='public'?'index.html':portal+'/index.html'),'utf8');
   const styles=[...page.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(match=>match[0].replaceAll('../','/').replace(/href="css\//,'href="/css/')).filter(style=>!style.includes('https:')).join('');
   const boot=page.match(/<script>[\s\S]*?<\/script>/)?.[0]||'';
   type='text/html';body=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${boot}${styles}</head><body ${portal==='public'?'':`data-portal="${portal}"`}><main style="padding:24px;max-width:900px;margin:auto"><h1>Back controls</h1><div id="controls" style="display:flex;gap:20px;flex-wrap:wrap;padding:48px 0">
    <button type="button" id="plain" class="button secondary">Back</button>
    <a id="destination" class="button secondary" href="#/classes">Back to class</a>
    <button type="button" id="nested" class="button secondary">← <span>Back to the list</span></button>
    <button type="button" id="quiz-back" class="st-quiz__back" aria-label="Bumalik sa aralin"><svg></svg><span>Bumalik</span></button>
    <a id="existing" class="st-icon-button st-hub-tooltip" data-tooltip="Mga Aralin" href="#/home" aria-label="Bumalik sa Mga Aralin"><svg></svg></a>
    <button type="button" id="wide" class="button primary st-wide st-big">Bumalik sa aralin</button>
    <button type="button" id="disabled" class="button secondary" disabled>Back to lessons</button>
    <button type="button" id="unrelated">Send feedback</button><button type="button" id="backup">Back up class</button><button type="button" id="cancel">Cancel</button>
   </div><div id="dynamic"></div><p id="change"></p><button type="button" data-theme-choice="light">Light</button><button type="button" data-theme-choice="dark">Dark</button></main><script type="module">
    window.backClicks=0;window.originalBack=document.querySelector('#plain');originalBack.addEventListener('click',()=>window.backClicks++);
    await import('/js/theme.js');window.ready=true;
   </script></body></html>`;
  }else{
   const target=path.resolve(root,'.'+url.pathname);if(!target.startsWith(root+path.sep))throw Error('Invalid path');
   body=await fs.readFile(target);type={'.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(target)]||type;
  }
  res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
 }catch(error){res.writeHead(404);res.end(error.message);}
});
(async()=>{
 await fs.mkdir(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[],base='http://127.0.0.1:'+server.address().port;
  page.on('pageerror',error=>{errors.push(error.message);console.log('Browser error:',error.message)});await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  for(const portal of ['teacher','admin','student','public']){
   console.log('Checking',portal);await page.goto(base+'/fixture.html?portal='+portal);await page.waitForFunction(()=>window.ready);
   await page.locator('#plain[data-back-tooltip]').waitFor();
   assert.equal(await page.locator('.back-icon-button').count(),7);
   for(const id of ['plain','destination','nested','quiz-back','existing','wide','disabled']){
    const control=page.locator('#'+id);assert.equal((await control.innerText()).trim(),'');assert.equal(await control.locator('svg[data-back-arrow]').count(),1);
    assert.ok(await control.getAttribute('aria-label'));
    assert.equal(await control.evaluate(element=>Math.round(element.getBoundingClientRect().width)),44);
   }
   assert.equal(await page.locator('#existing').getAttribute('data-tooltip'),null);
   assert.equal(await page.locator('#existing').evaluate(element=>element.classList.contains('st-hub-tooltip')),false);
   assert.equal(await page.locator('#quiz-back').getAttribute('aria-label'),'Bumalik sa aralin');
   for(const id of ['unrelated','backup','cancel'])assert.equal(await page.locator('#'+id).evaluate(element=>element.classList.contains('back-icon-button')),false);
   await page.locator('#plain').click();assert.equal(await page.evaluate(()=>backClicks),1);assert.equal(await page.evaluate(()=>originalBack===document.querySelector('#plain')),true);
   await page.locator('#destination').click();assert.equal(await page.evaluate(()=>location.hash),'#/classes');
   await page.evaluate(()=>{const button=document.createElement('button');button.id='later';button.textContent='Back to students';button.onclick=()=>window.laterClicked=true;document.querySelector('#dynamic').append(button);});
   await page.locator('#later[data-back-tooltip]').waitFor();await page.locator('#later').click();assert.equal(await page.evaluate(()=>window.laterClicked),true);
   const arrow=await page.locator('#plain svg').evaluate(element=>{window.originalArrow=element;return true;});assert.ok(arrow);
   await page.evaluate(()=>document.querySelector('#change').textContent='Unrelated page update');assert.equal(await page.evaluate(()=>originalArrow===document.querySelector('#plain svg')),true);
   for(const width of [1200,390,320])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:900});await page.locator('[data-theme-choice="'+theme+'"]').click();
    await page.mouse.move(0,0);await page.locator('#destination').hover();
    const tooltip=page.locator('.back-button-tooltip:not([hidden])');await tooltip.waitFor();assert.equal(await tooltip.innerText(),'Back to class');
    const bounds=await tooltip.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
    assert.equal(await page.locator('#destination').getAttribute('aria-describedby'),await tooltip.getAttribute('id'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(out,portal+'-'+width+'-'+theme+'.png'),fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');await tooltip.waitFor({state:'hidden'});
   }
   await page.locator('#plain').focus();await page.locator('.back-button-tooltip:not([hidden])').waitFor();
   await page.keyboard.press('Escape');await page.locator('.back-button-tooltip:not([hidden])').waitFor({state:'hidden'});
   await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#plain').hover();
   assert.equal(await page.locator('#plain svg').evaluate(element=>getComputedStyle(element).transform),'none');await page.emulateMedia({reducedMotion:'no-preference'});
   assert.equal(await page.locator('.back-button-tooltip').count(),1,'One delegated tooltip survives dynamic updates');
   await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
   assert.equal(await page.locator('#plain[data-back-tooltip]').count(),1);
  }
  assert.deepEqual(errors,[]);console.log('PASS: Back controls across teacher/admin/student/public pages; English/Filipino labels, dynamic controls, preserved handlers and destinations, excluded unrelated actions, 44px icons, animated hover/focus tooltips, Escape, reduced motion, theme persistence, and 24 desktop/mobile light/dark layouts. No account or API writes.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
