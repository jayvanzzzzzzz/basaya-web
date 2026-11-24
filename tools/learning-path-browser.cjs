// Reuse the local module editor adapters; no production requests are permitted.
const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'module-lessons-browser.cjs'), 'utf8');
const harness = source.slice(0, source.indexOf('(async()=>{'));
const run = `
(async()=>{
 await fs.mkdir(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const p=await browser.newPage({viewport:{width:1440,height:950}}),base='http://127.0.0.1:'+server.address().port,errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 for(const role of ['teacher','admin']) {
 await p.goto(base+'/fixture.html?role='+role);await p.waitForFunction(()=>window.ready);
 await p.evaluate(async()=>{store.set('modules/a',{title:'Module A',ownerId:'teacher',visibility:'shared',lessonIds:['pandiwa'],revision:1});await renderWorkspace();});
 await p.locator('[data-action="paths"]').click();await p.locator('[data-new-path]').click();
 await p.locator('[data-path-form] [name="title"]').fill('Filipino 7 Reading');await p.locator('[data-path-pick="a"]').check();
 await p.locator('[data-path-form] [type="submit"]').click();
 assert.match(await p.locator('.module-sequence-preview').innerText(),/Module A/);
 for(const width of [1440,390]) for(const theme of ['light','dark']) {
 await p.setViewportSize({width,height:950});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await p.screenshot({path:path.join(out,'learning-path-'+role+'-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await p.locator('.action-confirmation').getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await p.locator('[data-path-form] [name="title"]').inputValue(),'Filipino 7 Reading');
 }
 await p.goto(base+'/fixture.html?role=teacher&class=1');await p.waitForFunction(()=>window.ready);
 await p.locator('#class-module').selectOption('premade');await p.locator('#add-class-module').click();
 await p.locator('.assignment-module-lessons summary').click();await p.locator('[data-assign-edit="pandiwa"]').click();
 await p.locator('#lesson-form [name="description"]').fill('Customized for this class');
 await p.locator('#lesson-form [type="submit"]').click();
 await p.locator('.action-confirmation').getByRole('button',{name:'Save new version',exact:true}).click();
 await p.locator('.lesson-inline-editor').waitFor({state:'detached'});
 assert.match(await p.locator('#class-module-order').innerText(),/Customized module copy/);
 await p.locator('#assign-class-modules').click();await p.locator('#add-lessons-form [type="submit"]').click();
 await p.locator('.action-confirmation').getByRole('button',{name:'Save copies and assign',exact:true}).click();
 await p.waitForFunction(()=>[...store.keys()].some(key=>key.startsWith('classes/class/classLessons/')));
 assert.equal(await p.evaluate(()=>store.get('lessons/pandiwa').description),'Kilalanin ang salitang kilos.');
 assert.deepEqual(await p.evaluate(()=>store.get('modules/premade').lessonIds),['pangngalan','pandiwa']);
 assert.equal(await p.evaluate(()=>[...store].filter(([key,item])=>key.startsWith('modules/')&&item.copiedFromModuleId==='premade').length),1);
 assert.ok(await p.evaluate(()=>[...store].filter(([key])=>key.startsWith('classes/class/classLessons/')).every(([,item])=>item.moduleId!=='premade')));
 assert.deepEqual(errors,[]);console.log('PASS: teacher/admin paths, nested previews, cancel preservation, 8 light/dark layouts, lesson copy editing during assignment, module version assignment and unchanged originals.');
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});`;
new Function('require','__dirname', harness + run)(require,__dirname);
