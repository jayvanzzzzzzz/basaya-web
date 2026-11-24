// Reuse the existing in-memory lesson editor server, with a focused skip workflow.
const fs = require('node:fs');
const vm = require('node:vm');
const harness = fs.readFileSync(require.resolve('./module-lessons-browser.cjs'), 'utf8').split('(async()=>{')[0];
const suite = `
(async()=>{
 await fs.mkdir(path.join(root,'audit/optional-parts'),{recursive:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  for (const role of ['teacher','admin']) {
   const p=await browser.newPage({viewport:{width:1440,height:1050}});
   const errors=[];p.on('pageerror',e=>errors.push(e.message));
   const base='http://127.0.0.1:'+server.address().port;
   await p.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   await p.goto(base+'/fixture.html?role='+role);await p.waitForFunction(()=>window.ready);
   await p.locator('[data-action="new-module"]').click();
   await p.locator('[name="title"]').fill('Optional sections module');
   await p.locator('[data-pick="pandiwa"]').check();
   await p.locator('[data-edit="pandiwa"]').click();await p.locator('#lesson-form').waitFor();
   for (const part of ['quiz','pronunciation']) {
    await p.locator('[data-step="'+part+'"]').click();
    const skip=p.locator('[data-skip-'+part+']');
    await skip.check();
    assert.equal(await p.locator('[data-'+part+'-title]').isDisabled(),true);
    assert.equal(await p.locator(part==='quiz'?'[data-add-question]':'[data-add-pronunciation-page]').isDisabled(),true);
    await skip.uncheck();
    assert.equal(await p.locator('[data-'+part+'-title]').isEnabled(),true);
    await skip.check();
    for (const width of [1440,768,390,320]) for (const theme of ['light','dark']) {
     await p.setViewportSize({width,height:950});
     await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
     await skip.focus();
     assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     await p.screenshot({path:path.join(root,'audit/optional-parts',role+'-'+part+'-'+width+'-'+theme+'.png'),fullPage:true});
    }
   }
   await p.setViewportSize({width:1440,height:1050});
   await p.locator('#lesson-form [type="submit"]').click();
   assert.equal(await p.locator('.missing-toast:visible').count(),0);
   await p.locator('.action-confirmation').last().getByRole('button',{name:'Save new version',exact:true}).click();
   await p.locator('[data-module-form]').waitFor();
   const id=await p.evaluate(()=>[...store].find(([id,d])=>id.split('/').length===2&&d.title==='Pandiwa - 1.1')[0]);
   const saved=await p.evaluate(id=>({quiz:store.get(id+'/quiz/status'),pron:store.get(id+'/pronunciation/status'),q:store.get(id+'/quiz/content'),p:store.get(id+'/pronunciation/content'),original:store.has('lessons/pandiwa/quiz/status')}),id);
   assert.equal(saved.quiz.completion,'skipped');assert.equal(saved.pron.completion,'skipped');
   assert.deepEqual(saved.q.questions,[]);assert.deepEqual(saved.p.words,[]);assert.equal(saved.original,false);
   await p.locator('[data-edit="'+id.split('/')[1]+'"]').click();await p.locator('#lesson-form').waitFor();
   for(const part of ['quiz','pronunciation']) {
    await p.locator('[data-step="'+part+'"]').click();
    assert.equal(await p.locator('[data-skip-'+part+']').isChecked(),true);
    assert.equal(await p.locator('[data-'+part+'-title]').isDisabled(),true);
   }
   assert.deepEqual(errors,[]);await p.close();
   console.log('PASS: '+role+' skip/unskip, save, reopen, original isolation, light/dark and four widths');
  }
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});`;
vm.runInThisContext('(function(require,__dirname){'+harness+suite+'})', {filename:__filename})(require,__dirname);
