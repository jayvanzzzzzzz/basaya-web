// Actual teacher shell/review UI with local-only API and roster fixtures.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const auditText = require('./text-readability-audit.cjs');
const {chromium} = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname,'..');
const artifacts = path.join(root,'audit/reading-review-design');
const fixture = `
export const state={user:{uid:'preview'}};
let graded=false;
export async function readingLessonTitles(){return {one:'Ang ating pamayanan',two:'Mga kuwento sa tahanan'};}
export async function readingRoster(){return {className:'Grade 7 — Rizal',section:'Rizal',lessonLinks:[{id:'one',dueAt:Date.now()+72*3600000},{id:'two',dueAt:Date.now()+24*3600000}],students:location.search.includes('empty')?[]:[{uid:'ana',name:'Ana Santos'},{uid:'juan',name:'Juan Dela Cruz'},{uid:'mia',name:'Mia Reyes'},...(location.search.includes('many')?Array.from({length:23},(_,i)=>({uid:'reader-'+i,name:'Reader '+String(i+1).padStart(2,'0')})):[])]};}
export async function postToApi(_path,body){
 if(body.operation==='fluency-list'){
  if(location.search.includes('error'))throw Error('Readings could not be loaded. Please try again.');
  return {submissions:location.search.includes('empty')?[]:[
  {id:'old',uid:'ana',lessonId:'one',name:'Ana Santos',title:'Older attempt',submittedAt:100,status:'submitted'},
  {id:'one',uid:'ana',lessonId:'one',name:'Ana Santos',title:'BIGKASIN ANG MGA IDYOMA',pageCount:2,submittedAt:1794000000000,status:graded?'graded':'submitted'},
  {id:'two',uid:'ana',lessonId:'two',name:'Ana Santos',title:'Mga kuwento sa tahanan',pageCount:1,submittedAt:1793900000000,status:'graded'},
  {id:'juan-one',uid:'juan',lessonId:'one',name:'Juan Dela Cruz',title:'Ang ating pamayanan',pageCount:2,submittedAt:1793800000000,status:'submitted'},
  {id:'juan-two',uid:'juan',lessonId:'two',name:'Juan Dela Cruz',title:'Mga kuwento sa tahanan',pageCount:1,submittedAt:1793900000000,status:'submitted'},
  ...(location.search.includes('many')?Array.from({length:23},(_,i)=>({id:'extra-'+i,uid:'reader-'+i,lessonId:'one',name:'Reader '+String(i+1).padStart(2,'0'),title:'Reading lesson',pageCount:1,submittedAt:1793900000000,status:'submitted'})):[])].map(row=>location.search.includes('cleared')?{...row,status:'graded'}:row)};
 }
 if(body.operation==='fluency-play'){
  window.playRequests=(window.playRequests||0)+1;
  if(window.failPlayback)throw Error('Recording unavailable');
  return {clips:[{duration:1},{duration:1}],pages:[{sentence:'Masayang nagbabasa ang mga bata sa ating pamayanan.',recordingUrl:'/audio.wav'},{sentence:'Ang bawat kuwento ay may bagong aral para sa atin.',recordingUrl:'/audio.wav'}],grade:graded?{accuracy:3,smoothness:3,expression:3}:null,feedback:graded?'Magaling!':''};
 }
 if(body.operation==='fluency-grade'){
  window.lastGrade=body;
  if(window.delaySave)await new Promise(resolve=>setTimeout(resolve,700));
  if(window.failSave)throw Error('Could not save grade. Please try again.');
  graded=true;return {};
 }
 throw Error('Unexpected fixture operation');
}`;
const wave=Buffer.alloc(16044);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(16000,40);
const server=http.createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://preview').pathname).slice(1);
  let body,type='text/javascript';
  if(name==='fixture.mjs')body=fixture;
  else if(name==='audio.wav'){
   const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
   const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),wave.length-1):wave.length-1;
   res.writeHead(range?206:200,{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${wave.length}`}:{})});
   res.end(wave.subarray(start,end+1));return;
  }
  else if(name==='teacher/preview.html'){
   body=(await fs.readFile(path.join(root,'teacher/index.html'),'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/type="module"/.test(s)?'':s)
    .replace('</body>',`<script type="module">
    import {renderFluencyReview} from './views/fluencyReview.js';
    import '../js/theme.js';
    document.querySelector('#loading-screen').hidden=true;
    document.querySelector('#app-view').hidden=false;
    document.querySelector('[data-nav="classes"]').classList.add('active');
    async function render(){window.ready=false;const parts=location.hash.slice(2).split('/');await renderFluencyReview('classroom',parts[3]||null,parts[4]||null);window.ready=true;}
    window.addEventListener('hashchange',render);await render();
    </script></body>`);type='text/html';
  }else{
   const target=path.resolve(root,name);
   if(!target.startsWith(root+path.sep)||name.split(/[\\/]/).some(p=>p.startsWith('.')))throw Error('Invalid path');
   body=await fs.readFile(target);
   const ext=path.extname(name);type={'.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[ext]||type;
   if(ext==='.js')body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,(match,q,source)=>{
    const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),source));
    return ['js/api.js','js/state.js','teacher/views/readingRoster.js'].includes(resolved)?`from '/fixture.mjs'`:match;
   });
  }
  res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
 }catch(e){res.writeHead(404);res.end(e.message);}
});
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/teacher/preview.html`;
  await page.goto(url);await page.waitForFunction(()=>window.ready);
  const route=async suffix=>{
   await page.evaluate(suffix=>{window.ready=false;location.hash='/classes/classroom/readings'+suffix;},suffix);
   await page.waitForFunction(()=>window.ready);
  };
  const tooltip=page.locator('.floating-tooltip:not([hidden])');
  for(const mode of ['light','dark']){
   if(await page.evaluate(()=>document.documentElement.dataset.theme)!==mode)await page.locator('[data-theme-toggle]').click();
   await page.waitForTimeout(750);
   for(const [screen,suffix] of [['students',''],['lessons','/ana'],['grading','/ana/one']]){
    await route(suffix);
    if(screen==='grading'){
      assert.equal(await page.locator('#recording-title').textContent(),'Ang ating pamayanan','Use the actual lesson title, not the activity title stored with the submission');
      await page.waitForFunction(()=>[...document.querySelectorAll('audio')].every(audio=>audio.duration===1&&!audio.error));
      assert.ok(await page.locator('audio').evaluateAll(elements=>elements.every(audio=>audio.paused&&audio.preload==='metadata')),'Duration loads before pressing Play');
      assert.deepEqual(await page.locator('[data-recording-state]').allTextContents(),['','']);
      assert.ok(await page.locator('audio').evaluateAll(elements=>elements.every(audio=>audio.hidden&&!audio.controls)),'Custom transport replaces native controls');
      const transport=page.locator('.reading-player').first();
      await page.locator('audio').first().evaluate(audio=>audio.loop=true);
      await transport.getByRole('button',{name:'Play recording for page 1',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('audio').paused);
      await transport.getByRole('button',{name:'Pause recording for page 1',exact:true}).click();
      assert.equal(await page.locator('audio').first().evaluate(audio=>audio.paused),true);
      await transport.locator('select').selectOption('1.5');
      assert.equal(await page.locator('audio').first().evaluate(audio=>audio.playbackRate),1.5);
      await transport.getByRole('button',{name:'Mute recording for page 1',exact:true}).click();
      assert.equal(await page.locator('audio').first().evaluate(audio=>audio.muted),true);
      await transport.getByRole('button',{name:'Unmute recording for page 1',exact:true}).click();
      const seek=transport.getByRole('slider');await seek.focus();await seek.press('Home');await seek.press('PageUp');
      assert.ok(await page.locator('audio').first().evaluate(audio=>audio.currentTime>0&&audio.currentTime<audio.duration),'Keyboard seeking updates playback position');
      await transport.locator('select').selectOption('1');
      await page.locator('audio').first().evaluate(audio=>{audio.loop=false;audio.currentTime=0;});
      await page.evaluate(()=>{
        const recordings=document.querySelector('.reading-recordings');
        for(let i=0;i<16;i++){const extra=document.createElement('article');extra.className='reading-clip scroll-fixture';extra.textContent='Additional recorded page '+(i+3);extra.style.minHeight='180px';recordings.append(extra);}
      });
      await page.locator('.scroll-fixture').last().evaluate(el=>el.scrollIntoView({behavior:'instant',block:'end'}));
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.waitForFunction(()=>{const r=document.querySelector('.reading-grade').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;});
      const assessmentBounds=await page.locator('.reading-grade').evaluate(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,viewport:innerHeight}));
      assert.ok(assessmentBounds.top>=0&&assessmentBounds.bottom<=assessmentBounds.viewport+1,`Assessment stays in viewport: ${JSON.stringify(assessmentBounds)}`);
      assert.ok(await page.locator('.reading-grade').evaluate(el=>el.clientHeight>=innerHeight-60),'Scrolled assessment uses nearly the full viewport height');
      assert.equal(await page.locator('.page-header-bar').evaluate(el=>getComputedStyle(el).display),'none','Student name bar cannot overlap the assessment');
      const fixedActions=await page.locator('.reading-grade__actions').boundingBox();
      await page.locator('.reading-grade__body').evaluate(el=>el.scrollTop=el.scrollHeight);
      assert.deepEqual(await page.locator('.reading-grade__actions').boundingBox(),fixedActions,'Save actions stay in place while rubric scroll');
      await page.evaluate(()=>{document.querySelectorAll('.scroll-fixture').forEach(el=>el.remove());document.querySelector('.reading-grade__body').scrollTop=0;});
      await page.locator('#recording-title').scrollIntoViewIfNeeded();
    }
    if(screen==='lessons'){
      assert.equal(await page.locator('.reading-directory__heading').count(),0);
      assert.equal(await page.locator('.reading-total').count(),0);
      assert.equal(await page.locator('.reading-row strong').first().textContent(),'Ang ating pamayanan');
      assert.deepEqual(await page.locator('.reading-lesson-table thead th').allTextContents(),['Lesson Title','Audio count','Deadline','Review status','Review lesson']);
      assert.deepEqual(await page.locator('[data-page-count]').allTextContents(),['2 recordings','1 recording']);
      assert.equal(await page.locator('.reading-lesson-deadline time').count(),2);
      assert.deepEqual(await page.locator('.reading-lesson-table .reading-status').allTextContents(),['Upcoming','Reviewed']);
    }
    if(screen==='students'){
      assert.deepEqual(await page.locator('.reading-student-identity strong').allTextContents(),['Ana Santos','Juan Dela Cruz'],'Only pending students, names ascending even with unequal review counts');
      assert.equal(await page.locator('.reading-student-dot.is-pending').count(),2);
      assert.equal(await page.locator('.reading-student-dot:not(.is-pending)').count(),0);
      assert.equal(await page.locator('.reading-student-dot.is-urgent').count(),1);
      assert.equal(await page.locator('.reading-deadline-note:not([hidden])').textContent(),'Due within 48 hours');
      assert.equal(await page.locator('.reading-student-dot').first().evaluate(el=>getComputedStyle(el).animationName),'reading-status-pulse');
      assert.equal(await page.locator('#page-header .page-header__crumbs').count(),0);
      assert.equal(await page.locator('.reading-directory__heading .reading-eyebrow').count(),0);
      assert.equal(await page.locator('.reading-directory__heading .reading-total').count(),0);
      assert.match(await page.locator('.reading-review-summary__class').textContent(),/Grade 7.*Rizal.*Section Rizal/s);
      assert.ok(await page.locator('.reading-review-summary__pending').evaluate(el=>el.getBoundingClientRect().left>document.querySelector('.reading-review-summary__class').getBoundingClientRect().left));
      const open=page.getByRole('link',{name:'Open readings for Ana Santos'});
      await open.hover();await tooltip.waitFor();assert.equal(await tooltip.textContent(),'Open readings for Ana Santos');
      await page.mouse.move(0,0);await open.focus();await tooltip.waitFor();
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>window.ready&&location.hash.endsWith('/ana')&&document.querySelector('.reading-lesson-row'));
      await route('');
      await page.locator('.reading-student-identity').first().click();
      await page.waitForFunction(()=>window.ready&&location.hash.endsWith('/ana')&&document.querySelector('.reading-lesson-row'));
      await route('');
    }
    for(const [name,width] of [['desktop',1440],['tablet',900],['mobile',390],['small-mobile',320]]){
     await page.setViewportSize({width,height:1000});await page.mouse.move(0,0);
     if(screen==='grading' && width<=1100) {
      await page.getByRole('button',{name:'Grade lesson',exact:true}).click();
      assert.equal(await page.locator('.reading-grade-drawer').evaluate(el=>el.open),true);
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!document.querySelector('.reading-grade-drawer').open);
      assert.equal(await page.locator('.reading-grade-drawer').evaluate(el=>el.open),false);
      assert.equal(await page.getByRole('button',{name:'Grade lesson',exact:true}).evaluate(el=>el===document.activeElement),true);
      await page.getByRole('button',{name:'Grade lesson',exact:true}).click();
     }
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${mode} ${screen} ${name} overflow`);
     for(const selector of ['.reading-review','.reading-grade','.reading-directory__rows'])for(const el of await page.locator(selector).all()){
      const bounds=await el.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,children:[...el.querySelectorAll('*')].filter(child=>child.getBoundingClientRect().right>el.getBoundingClientRect().right+1).slice(0,8).map(child=>({tag:child.tagName,class:child.className,width:child.getBoundingClientRect().width}))}));
      assert.ok(bounds.scroll<=bounds.width+1,`${mode} ${screen} ${name} ${selector} overflow: ${JSON.stringify(bounds)}`);
     }
     await page.screenshot({path:path.join(artifacts,`${screen}-${name}-${mode}.png`),fullPage:true});
     assert.deepEqual(await auditText(page),[],`${mode} ${screen} ${name}: readability`);
     if(screen==='grading' && width<=1100) {
      await page.getByRole('button',{name:'Back to recordings',exact:true}).click();
      assert.equal(await page.locator('.reading-grade-drawer').evaluate(el=>el.open),false);
      assert.deepEqual(await auditText(page),[],`${mode} recording transport ${name}: readability`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Recording controls fit narrow screens');
      await page.screenshot({path:path.join(artifacts,`recording-player-${name}-${mode}.png`),fullPage:true});
     }
    }
    await page.setViewportSize({width:1440,height:1000});
    assert.equal(await page.locator('.floating-tooltip').count(),1,'Old review tooltips must be disposed on navigation');
    for(const control of await page.locator('[data-reading-tooltip]').all()){
     assert.ok(await control.getAttribute('aria-label'));
     assert.equal((await control.textContent()).trim(),'');
    }
   }
   const play=page.locator('[data-review-play-all]');await play.hover();await tooltip.waitFor();
   assert.equal(await tooltip.textContent(),'Play all');
   assert.deepEqual(await auditText(page),[],`${mode}: visible tooltip readability`);
   assert.ok(await tooltip.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}));
   await page.mouse.move(0,0);await play.focus();await tooltip.waitFor();await page.keyboard.press('Escape');assert.equal(await tooltip.count(),0);
   await play.click();await page.waitForFunction(()=>!document.querySelector('audio').paused);
   await page.locator('audio').first().evaluate(audio=>audio.pause());
  }
  let blockMedia=true;
  await page.route('**/audio.wav*',async route=>blockMedia?route.fulfill({status:403,body:'Expired'}):route.continue());
  await page.locator('audio').first().evaluate(audio=>{audio.src='/audio.wav?expired=1';audio.load();});
  const retry=page.getByRole('button',{name:'Retry recording for page 1'});
  await retry.waitFor({state:'visible'});
  assert.match(await page.locator('[data-recording-state]').first().textContent(),/could not load/);
  const requestsBeforeRetry=await page.evaluate(()=>window.playRequests);
  blockMedia=false;await retry.click();
  await page.waitForFunction(()=>document.querySelector('audio').duration===1&&!document.querySelector('audio').error&&document.querySelector('[data-recording-retry]').hidden);
  assert.equal(await page.evaluate(()=>window.playRequests),requestsBeforeRetry+1,'Retry asks the authenticated API for a fresh URL');
  assert.equal(await page.locator('[data-recording-state]').first().textContent(),'');
  await page.unroute('**/audio.wav*');
  // Stress the real layout with long names/content and WCAG text-spacing values.
  await route('');await page.setViewportSize({width:320,height:1000});
  await page.evaluate(()=>{
    document.querySelector('.reading-row strong').textContent='Maria Alexandra Santiago de la Cruz — '+ 'MahabangPangalan'.repeat(8);
    document.querySelector('.reading-submitted__value').textContent='Complete submission information remains available without clipping or ellipsis. '.repeat(3);
  });
  assert.deepEqual(await auditText(page),[],'Long reader names and metadata');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(artifacts,'long-reader-mobile-dark.png'),fullPage:true});
  await route('/ana/one');
  await page.getByRole('button',{name:'Grade lesson',exact:true}).click();
  const spacing=await page.addStyleTag({content:'#page-header *, #reading-review *, .site-footer * {line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important;} #reading-review p {margin-bottom:2em !important;}'});
  assert.deepEqual(await auditText(page),[],'Increased text spacing');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(artifacts,'text-spacing-mobile-dark.png'),fullPage:true});
  await spacing.evaluate(el=>el.remove());
  await page.setViewportSize({width:1440,height:1000});
  for(const name of ['accuracy','smoothness','expression'])await page.locator(`[name="${name}"]`).selectOption('3');
  await page.evaluate(()=>{window.failSave=true;window.delaySave=true;});
  const save=page.getByRole('button',{name:'Save grade',exact:true});await save.click();
  await page.waitForFunction(()=>document.querySelector('#reading-grade').getAttribute('aria-busy')==='true');
  assert.equal(await page.getByRole('button',{name:'Saving grade'}).isDisabled(),true);
  assert.deepEqual(await auditText(page),[],'Saving state readability');
  await page.waitForFunction(()=>document.querySelector('#reading-review-error').textContent.includes('Could not save'));
  assert.equal(await save.isEnabled(),true);assert.equal(await save.textContent(),'');
  assert.deepEqual(await auditText(page),[],'Failed save/error readability');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#page-header .header-actions a').click();
  assert.match(page.url(),/\/ana\/one$/,'Unsaved changes guard must remain active');
  await page.evaluate(()=>window.failSave=false);await save.click();
  await page.waitForFunction(()=>window.ready&&location.hash.endsWith('/ana')&&!document.querySelector('#reading-grade'));
  assert.deepEqual(await page.evaluate(()=>window.lastGrade.grade),{accuracy:3,smoothness:3,expression:3});
  assert.ok(await page.getByText('Reviewed',{exact:true}).count());
  await page.emulateMedia({reducedMotion:'reduce'});
  await route('');
  assert.deepEqual(await page.locator('.reading-student-identity strong').allTextContents(),['Juan Dela Cruz'],'Reviewed students leave the pending queue');
  assert.equal(await page.locator('.reading-student-dot').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  const back=page.locator('#page-header .header-actions a');await back.hover();await tooltip.waitFor();
  assert.equal(await tooltip.evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.goto(url+'?many');await page.waitForFunction(()=>window.ready);
  const shown=page.locator('.reading-student-row:not([data-paged-out])');
  const ordered=await page.locator('.reading-student-identity strong').allTextContents();
  assert.equal(ordered.length,25);
  assert.equal(await shown.count(),10);
  assert.equal(await page.getByRole('button',{name:'Previous page'}).isDisabled(),true);
  await page.getByRole('button',{name:'Next page'}).click();assert.equal(await shown.count(),10);
  assert.equal(await shown.first().locator('strong').textContent(),ordered[10]);
  await page.getByRole('button',{name:'Page 3',exact:true}).click();assert.equal(await shown.count(),5);
  assert.equal(await page.getByRole('button',{name:'Next page'}).isDisabled(),true);
  await page.getByRole('button',{name:'Page 1',exact:true}).focus();await page.keyboard.press('Enter');
  assert.equal(await shown.first().locator('strong').textContent(),'Ana Santos');
  await page.getByRole('combobox',{name:'Rows per page'}).selectOption('20');assert.equal(await shown.count(),20);
  await page.getByRole('button',{name:'Next page'}).click();assert.equal(await shown.count(),5);
  await page.getByRole('combobox',{name:'Rows per page'}).selectOption('10');assert.equal(await shown.count(),10);
  for(const mode of ['light','dark']){
    if(await page.evaluate(()=>document.documentElement.dataset.theme)!==mode)await page.locator('[data-theme-toggle]').click();
    await page.waitForTimeout(750);
    for(const width of [1440,390,320]){
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.deepEqual(await auditText(page),[],`${mode} pagination ${width} readability`);
      await page.screenshot({path:path.join(artifacts,`pagination-${width}-${mode}.png`),fullPage:true});
    }
  }
  await page.goto(url+'?empty');await page.waitForFunction(()=>window.ready);assert.equal(await page.locator('.reading-row').count(),0);
  assert.equal(await page.locator('.pagination').count(),0);
  await page.screenshot({path:path.join(artifacts,'empty-dark.png'),fullPage:true});
  await page.goto(url+'?cleared');await page.waitForFunction(()=>window.ready);
  assert.equal(await page.locator('.reading-student-row').count(),0);
  assert.equal(await page.locator('.pagination').count(),0);
  assert.equal(await page.getByRole('heading',{name:'No pending reviews'}).count(),1);
  await page.goto(url+'?error');await page.waitForFunction(()=>window.ready);
  assert.equal(await page.getByRole('button',{name:'Try again'}).count(),1);
  await page.screenshot({path:path.join(artifacts,'error-dark.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: student/lesson/grading screens in both themes at 1440/900/390/320px; no overflow; icon-only controls; hover/focus tooltips and cleanup; audio playback; failed-save recovery; unsaved-change guard; grade payload and return route; reduced motion; empty/error states.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
