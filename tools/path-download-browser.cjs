const setup=require('node:fs').readFileSync(require('node:path').join(__dirname,'learning-path-home-browser.cjs'),'utf8').split('const run=')[0];
const test=String.raw`
harness=harness.replace('export const downloadLesson=async()=>{},downloadedLessons=async()=>[],removeLessonDownload=async()=>{};', \`const saved=new Map();window.downloadCalls=[];window.removeCalls=[];
export const downloadLesson=async(id,progress)=>{window.downloadCalls.push(id);progress(50);saved.set(id,{meta:{...lessons.find(x=>x.id===id)}});progress(100)};
export const downloadedLessons=async()=>[...saved.values()];export const removeLessonDownload=async id=>{window.removeCalls.push(id);saved.delete(id)};\`);
const run=\`
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{const original=window.matchMedia.bind(window);window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true,addEventListener(){},removeEventListener(){}}:original(q)});
 await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await p.goto('http://127.0.0.1:'+server.address().port+'/student/hub-preview.html');await p.waitForFunction(()=>window.ready);
 for(const width of [1440,390,320])for(const theme of ['light','dark']) {
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const card=p.locator('.st-assigned-path').first();await card.locator('summary').click();
  assert.equal(await card.locator('.st-download-controls [data-download-path]').isVisible(),true);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:path.join(artifacts,'download-menu-'+width+'-'+theme+'.png'),fullPage:true});
  await p.keyboard.press('Escape');assert.equal(await card.locator('details').getAttribute('open'),null);
 }
 assert.equal(await p.locator('[data-download-path=second]').first().isDisabled(),true);
 await p.locator('[data-download-path=first]').first().click();
 await p.waitForFunction(()=>document.querySelector('#home-download-all-status').textContent.includes('1 na-download'));
 assert.deepEqual(await p.evaluate(()=>downloadCalls),['continue']);
 assert.equal(await p.locator('[data-student-module]').count(),0);
 assert.ok((await p.locator('.st-path-download-actions').first().innerText()).includes('1/1 na-download'));
 await p.locator('.st-assigned-path').first().locator('summary').click();
 await p.locator('[data-remove-path-download=first]').click();
 await p.locator('.action-confirmation__actions .danger').click();
 await p.waitForFunction(()=>window.removeCalls.length===1 && document.querySelector('.st-path-download-actions').textContent.includes('0/1'));
 assert.deepEqual(await p.evaluate(()=>removeCalls),['continue']);
 await p.locator('.st-assigned-path').first().locator('summary').click();
 await p.locator('.st-download-controls [data-download-path=first]').click();
 await p.waitForFunction(()=>window.downloadCalls.length===2 && document.querySelector('.st-path-download-actions').textContent.includes('1/1'));
 assert.deepEqual(errors,[]);console.log('PASS: PWA path download button, menu download, removal, counts, locked path, Escape, six responsive theme layouts.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1;server.close()});
\`;
new Function('require','__dirname',harness+run)(require,__dirname);
`;
new Function('require','__dirname',setup+test.replaceAll('\\`','`'))(require,__dirname);
