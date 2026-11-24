const fs = require('node:fs'), path = require('node:path');
const original = fs.readFileSync(path.join(__dirname, '../tools/module-lessons-browser.cjs'), 'utf8');
let harness = original.slice(0, original.indexOf('(async()=>{'));
harness = harness.replace("res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);", `
if(name==='fixture.html') {
 const portal=new URL(req.url,'http://local').searchParams.get('role')||'teacher';
 const page=await fs.readFile(path.join(root,portal+'/index.html'),'utf8');
 const shell=page.slice(page.indexOf('<div id="app-view"'),page.indexOf('<template id="modal-template"')).replace(' hidden','');
 body=body.replace(/<main[^>]*>[\\s\\S]*?<\\/main>/,shell);
 body=body.replace('<div id="toast">','<div id="toast" class="toast" role="status">');
}
res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);`);
new Function('require','__dirname',harness+`
(async()=>{
 await fs.mkdir(path.join(root,'audit/lesson-scroll'),{recursive:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const p=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message)});
 p.on('console',m=>{if(m.type()==='error')console.error('BROWSER:',m.text())});
 const base='http://127.0.0.1:'+server.address().port;
 await p.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 for(const role of (process.argv.includes('--module-editor')?['teacher']:['teacher','admin']))for(const width of (process.argv.includes('--module-editor')?[1440]:[1440,768,390]))for(const theme of ['light','dark'])for(const mode of ['create','edit']) {
  await p.setViewportSize({width,height:900});
  await p.goto(base+'/fixture.html?role='+role);await p.waitForFunction(()=>window.ready);
  await p.evaluate(async()=>{store.set('lessons/pandiwa',{...store.get('lessons/pandiwa'),teacherId:'teacher',visibility:'shared'});await renderWorkspace();});
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  if(process.argv.includes('--module-editor')) {
   await p.locator('[data-action="new-module"]').click();
   await p.locator('[name="title"]').fill('Module editor check');
   if(mode==='create')await p.locator('[data-action="module-lesson"]').click();
   else {
    await p.locator('[data-pick="pandiwa"]').check();
    await p.locator('[data-edit="pandiwa"]').click();
   }
  }
  else if(mode==='create')await p.locator('[data-action="new-lesson"]').click();
  else {
   await p.locator('[data-action="library"]').click();
   const row=p.locator(role==='admin'?'[data-lesson-id="pandiwa"]':'.module-library-row').filter({hasText:'Pandiwa'});
   await row.locator('.content-actions-toggle,.admin-lesson-menu-toggle').click();
   await row.locator('[data-library-edit],[data-edit-lesson]').click();
  }
  await p.locator('.lesson-inline-editor').waitFor({timeout:8000}).catch(async e=>{console.error(await p.locator('#page-content').innerHTML(),await p.locator('#toast').innerText());throw e});
  if(process.argv.includes('--editor-page')) {
   await p.waitForTimeout(600);
   assert.equal(await p.locator('#page-header').isVisible(),false);
   assert.equal(await p.locator('.module-note').count(),0);
   assert.equal(await p.locator('.modal-backdrop').count(),0);
   const geometry=await p.evaluate(()=>{
    const content=document.querySelector('.content').getBoundingClientRect();
    const editor=document.querySelector('.lesson-inline-editor').getBoundingClientRect();
    return {content:content.width,editor:editor.width,top:editor.top,nav:document.querySelector('.sidebar').getBoundingClientRect().bottom};
   });
   assert.ok(Math.abs(geometry.content-geometry.editor)<2,'Editor fills the content column');
   assert.ok(Math.abs(geometry.top-(width>860?0:geometry.nav))<2,'No extra page header or top spacing');
   for(const step of ['quiz','activity','pronunciation']) {
    await p.locator('.lesson-tab[data-step="'+step+'"]').click();
    const heading=p.locator('[data-editor-step="'+step+'"]');await heading.waitFor();
    assert.equal(await p.locator('[data-editor-step]:visible').count(),1);
    assert.equal(await heading.evaluate(e=>getComputedStyle(e).marginTop),'0px');
    assert.ok(await heading.evaluate(e=>e.parentElement.classList.contains('lesson-studio')));
    assert.ok(await heading.evaluate(e=>{
     let previous=e.previousElementSibling;while(previous&&getComputedStyle(previous).display==='none')previous=previous.previousElementSibling;
     return Math.abs(e.getBoundingClientRect().top-previous.getBoundingClientRect().bottom)<2;
    }),'List controls meet the header without a gap');
    if(step==='quiz') {
     const before=await p.locator('[data-question]').count();
     await heading.locator('[data-add-question]').click();
     await p.waitForFunction(n=>document.querySelector('[data-editor-count="quiz"]').textContent==='('+(n+1)+')',before);
    }
    if(step==='activity') {
     await p.locator('[data-skip-activity]').check();assert.equal(await heading.locator('button').isDisabled(),true);
     await p.locator('[data-skip-activity]').uncheck();
     const before=await p.locator('[data-activity-page]').count();await heading.locator('button').click();
     await p.waitForFunction(n=>document.querySelector('[data-editor-count="activity"]').textContent==='('+(n+1)+')',before);
    }
    await p.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await p.screenshot({path:path.join(root,'audit/lesson-scroll','page-'+role+'-'+width+'-'+theme+'-'+mode+'-'+step+'.png')});
   }
   assert.deepEqual(errors,[]);
   console.log('PASS: full page '+role+' '+width+' '+theme+' '+mode+'; header controls, counts and activity skip');
   continue;
  }
  await p.locator('.lesson-tab[data-step="lectures"]').click();
  for(let i=0;i<5;i++)await p.locator('[data-add-lecture-sentence]:visible').last().click();
  await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0)});
  const before=await p.locator('.sidebar').boundingBox();
  await p.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await p.waitForTimeout(350);
  const metrics=await p.evaluate(()=>{
   const footer=document.querySelector('.site-footer--app'), r=footer.getBoundingClientRect();
   const form=document.querySelector('.lesson-studio form');
   return {scrollY,doc:document.documentElement.scrollHeight,footerBottom:r.bottom+scrollY,gap:document.documentElement.scrollHeight-r.bottom-scrollY,
    sidebar:document.querySelector('.sidebar').getBoundingClientRect().top,
    form:{client:form.clientHeight,scroll:form.scrollHeight},
    overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().height&&e.getBoundingClientRect().bottom>r.bottom+80).slice(0,8).map(e=>e.tagName+'.'+e.className)};
  });
  console.log(JSON.stringify({role,width,theme,mode,before:before.y,...metrics}));
   assert.ok(Math.abs(metrics.sidebar)<2,'Navigation stays at viewport top');
   const bottomPadding=await p.locator('.content').evaluate(e=>parseFloat(getComputedStyle(e).paddingBottom));
   assert.ok(Math.abs(metrics.gap-bottomPadding)<3,'Page ends at the footer plus its normal padding');
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');
   assert.ok(metrics.form.scroll<=metrics.form.client+2,'Inline editor uses page scrolling');
  await p.screenshot({path:path.join(root,'audit/lesson-scroll',role+'-'+width+'-'+theme+'-'+mode+'.png')});
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
`)(require,path.join(__dirname,'../tools'));
