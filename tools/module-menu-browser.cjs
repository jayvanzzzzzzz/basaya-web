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
 store.set('lessons/pandiwa',{...store.get('lessons/pandiwa'),teacherId:'teacher',visibility:'shared'});
 store.set('modules/own',{title:'Owned module',description:'Module overview',ownerId:'teacher',visibility:'shared',lessonIds:['pandiwa','pangngalan'],revision:1});
 store.set('modules/shared',{title:'Shared module',ownerId:'other',visibility:'shared',lessonIds:['pandiwa'],revision:1});await renderWorkspace();
 });
 await p.locator('[data-action="modules"]').click();
 const own=p.locator('.module-card').filter({hasText:'Owned module'}),shared=p.locator('.module-card').filter({hasText:'Shared module'});
 assert.equal(await own.locator('ol').count(),0);assert.doesNotMatch(await own.innerText(),/Module overview|Pandiwa|Pangngalan/);
 await shared.locator('[data-content-menu-toggle]').click();
 assert.deepEqual(await shared.locator('[role="menuitem"]').allTextContents(),['Preview','Edit a copy']);
 await own.locator('[data-content-menu-toggle]').click();
 assert.deepEqual(await own.locator('[role="menuitem"]').allTextContents(),['Preview','Edit a copy','Archive','Delete permanently']);
 for(const width of [1440,390])for(const theme of ['light','dark']){
 await p.setViewportSize({width,height:950});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 const bounds=await own.locator('[role="menu"]').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,'Module menu stays inside viewport');
 await p.screenshot({path:path.join(out,'module-delete-menu-'+role+'-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await own.getByRole('menuitem',{name:'Delete permanently',exact:true}).click();
 const confirmation=p.locator('.action-confirmation');await confirmation.waitFor();
 assert.match(await confirmation.innerText(),/Its lessons will not be deleted/);
 await confirmation.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await p.evaluate(()=>store.has('modules/own')),true,'Cancel preserves the module');
 await own.locator('[data-content-menu-toggle]').click();
 await own.locator('[data-preview-module]').click();
 assert.match(await p.locator('.module-detail-preview').innerText(),/Module overview/);
 assert.deepEqual(await p.locator('.module-detail-preview .module-lesson-name strong').allTextContents(),['Pandiwa','Pangngalan']);
 await p.locator('[data-module-preview-lesson="pandiwa"]').click();await p.locator('.lesson-viewer-modal').waitFor();
 await p.getByRole('button',{name:'Close lesson preview',exact:true}).click();
 await p.locator('[data-action="library"]').click();
 const row=role==='admin'?p.locator('[data-lesson-id="pandiwa"]'):p.locator('.module-library-row').filter({hasText:'Pandiwa'});
 const toggle=row.locator(role==='admin'?'.admin-lesson-menu-toggle':'[data-content-menu-toggle]');await toggle.click();
 assert.equal(await row.getByText('Preview',{exact:true}).count(),1);assert.equal(await row.getByText('Edit lesson',{exact:true}).count(),1);
 assert.equal(await row.getByText('Preview',{exact:true}).locator('..').locator('svg').count(),1);
 for(const width of [1440,390])for(const theme of ['light','dark']){
 await p.setViewportSize({width,height:950});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const menuBounds=await row.locator('[role="menu"]').boundingBox();assert.ok(menuBounds.x>=0&&menuBounds.x+menuBounds.width<=width,'Menu stays inside viewport');
 await p.screenshot({path:path.join(out,'library-menu-'+role+'-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await row.getByText('Preview',{exact:true}).click();await p.locator('.lesson-viewer-modal').waitFor();
 await p.getByRole('button',{name:'Close lesson preview',exact:true}).click();
 await p.locator('[data-action="modules"]').click();await own.locator('[data-content-menu-toggle]').click();await own.locator('[data-module]').click();
 assert.equal(await p.locator('[name="title"]').inputValue(),'Owned module');
 }
 assert.deepEqual(errors,[]);console.log('PASS: compact module cards, creator-only Archive and Delete permanently, delete confirmation/cancel, copy action, module/lesson previews, and teacher/admin responsive light/dark menus.');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
`)(require,__dirname);
