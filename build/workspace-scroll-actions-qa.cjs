const fs = require('node:fs'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'lesson-scroll-qa.cjs'), 'utf8');
const setup = source.slice(0, source.indexOf('new Function('));
const harness = new Function('require', '__dirname', setup + '\nreturn harness;')(require, __dirname);
new Function('require', '__dirname', harness + `
(async()=>{
 await fs.mkdir(path.join(root,'audit/scroll-create-actions'),{recursive:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port;
  await p.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  for(const role of ['teacher','admin'])for(const width of [1440,390])for(const theme of ['light','dark'])for(const view of ['library','modules']) {
   await p.setViewportSize({width,height:900});
   await p.goto(base+'/fixture.html?role='+role);await p.waitForFunction(()=>window.ready);
   await p.evaluate(async t=>{
    document.documentElement.dataset.theme=t;document.documentElement.style.scrollBehavior='auto';
    for(let i=0;i<30;i++){
     store.set('modules/scroll'+i,{title:'Reading module '+i,ownerId:'teacher',visibility:'shared',lessonIds:['pandiwa']});
     store.set('lessons/scroll'+i,{title:'Reading lesson '+i,teacherId:'teacher',visibility:'shared',difficulty:'madali'});
    }
    await renderWorkspace();
   },theme);
   await p.locator('[data-action="'+view+'"]').click();
   await p.evaluate(()=>window.scrollTo({top:700,behavior:'instant'}));
   const action=p.locator(width>600?'.page-header-bar__action':'#page-header .workspace-create-icon.primary');
   if(width<=600) {
    assert.equal(await p.locator('.page-header-bar').isVisible(),false,'Mobile keeps its existing header layout');
    await p.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
   }
   await action.waitFor();
   const label=view==='library'?'Create lesson':'Create module';
   assert.equal(await action.getAttribute('aria-label'),label);
   assert.equal((await action.innerText()).trim(),'');assert.equal(await action.locator('svg').count(),1);
   const box=await action.boundingBox();assert.ok(Math.abs(box.width-44)<.1);assert.ok(Math.abs(box.height-44)<.1);
   await action.hover();
   const tip=p.locator('.floating-tooltip:visible');await tip.waitFor();assert.equal(await tip.innerText(),label);
   await p.screenshot({path:path.join(root,'audit/scroll-create-actions',role+'-'+width+'-'+theme+'-'+view+'.png')});
   await p.keyboard.press('Escape');await action.focus();await tip.waitFor();
   assert.equal(await tip.innerText(),label);
   await action.click();
   if(view==='library') {
    await p.locator('.lesson-inline-editor').waitFor();
    assert.equal(await p.locator('.page-header-bar').isVisible(),false);
   } else await p.locator('[data-module-form]').waitFor();
   assert.deepEqual(errors,[]);
   console.log('PASS: '+role+' '+width+' '+theme+' '+view+' icon, hover/focus tooltip, correct create action');
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
`)(require,path.join(__dirname,'../tools'));
