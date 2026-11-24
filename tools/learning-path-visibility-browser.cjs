const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'module-lessons-browser.cjs'),'utf8');
const harness=source.slice(0,source.indexOf('(async()=>{'));
new Function('require','__dirname',harness+`
(async()=>{
 await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const p=await browser.newPage({viewport:{width:1440,height:950}}),base='http://127.0.0.1:'+server.address().port,errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 for(const role of ['teacher','admin']) {
 await p.goto(base+'/fixture.html?role='+role);await p.waitForFunction(()=>window.ready);
 await p.evaluate(async()=>{
 store.set('modules/a',{title:'Module A',ownerId:'teacher',visibility:'shared',lessonIds:['pandiwa'],revision:1});
 store.set('modules/b',{title:'Module B',ownerId:'teacher',visibility:'shared',lessonIds:['pangngalan'],revision:1});
 for(const [id,visibility,used] of [['private','private',false],['shared','shared',false],['used','shared',true]]) store.set('learningPaths/'+id,{title:id+' path',ownerId:'teacher',visibility,moduleIds:['a'],everAssigned:used,revision:1});
 document.querySelector('#page-content').innerHTML=''; await renderWorkspace();
 });
 await p.locator('[data-action="paths"]').click();
 assert.equal(await p.locator('.module-card').filter({hasText:'private path'}).locator('.content-visibility--private').count(),1);
 assert.equal(await p.locator('.module-card').filter({hasText:'shared path'}).locator('.content-visibility--shared').count(),1);
 const used=p.locator('.module-card').filter({hasText:'used path'});
 assert.equal(await used.locator('[data-content-lifecycle="delete"]').count(),0);
 assert.equal(await used.locator('[data-content-lifecycle="archive"]').count(),1);
 assert.match(await used.innerText(),/In use/);
 assert.equal(await p.locator('.module-card').filter({hasText:'private path'}).locator('[data-content-lifecycle="delete"]').count(),1);
 await p.locator('[data-action="new-path"]').click();
 assert.equal(await p.locator('[data-path-form] [name="visibility"]').inputValue(),'private');
 await p.locator('[data-path-form] [name="title"]').fill('Reading path');
 await p.locator('[data-path-form] [name="visibility"]').selectOption('shared');
 await p.locator('[data-path-pick="a"]').check();await p.locator('[data-path-pick="b"]').check();
 assert.equal(await p.locator('[name="visibility"]').inputValue(),'shared');
 await p.locator('[data-path-position="1"]').selectOption('0');
 assert.equal(await p.locator('[name="visibility"]').inputValue(),'shared');
 for(const width of [1440,390])for(const theme of ['light','dark']) {
 await p.setViewportSize({width,height:950});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await p.screenshot({path:path.join(out,'path-visibility-'+role+'-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await p.locator('[data-path-form] [type="submit"]').click();await p.locator('.action-confirmation').getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await p.locator('[name="visibility"]').inputValue(),'shared');
 }
 assert.deepEqual(errors,[]);console.log('PASS: teacher/admin path visibility controls, badges, Private default, preserved selection/order/preview cancellation, used-path deletion hidden and 8 responsive light/dark layouts.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
`)(require,__dirname);
