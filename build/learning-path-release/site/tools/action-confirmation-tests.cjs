const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const source=await fs.readFile(path.join(root,'js/action-confirmation.js'),'utf8');
 const ids=[...source.split('let active')[0].matchAll(/'([^']+)': \[/g)].map(x=>x[1]);
 for(const dir of ['admin/views','teacher/views','student/views','js']){
  for(const file of await fs.readdir(path.join(root,dir))){if(file.endsWith('.js'))new vm.SourceTextModule(await fs.readFile(path.join(root,dir,file),'utf8'));}
 }
 const server=http.createServer(async(req,res)=>{try{
  const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!target.startsWith(root+path.sep))throw Error('path');
  const body=await fs.readFile(target);res.writeHead(200,{'Content-Type':target.endsWith('.css')?'text/css':'text/javascript'});res.end(body);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url+'/index.html');
  await page.setContent(`<html><head><style>body{font-family:Arial,sans-serif}button{font:inherit}</style><link rel="stylesheet" href="${url}/css/base/tokens.css"><link rel="stylesheet" href="${url}/css/components/buttons.css"><link rel="stylesheet" href="${url}/css/components/action-confirmation.css"></head><body></body></html>`);
  await page.evaluate(url=>import(url+'/js/action-confirmation.js').then(m=>window.confirmAction=m.confirmAction),url);
  const setup=async(id,attrs='')=>page.evaluate(({id,attrs})=>{
   document.body.innerHTML=`<form id="${id}" ${attrs}><input name="title" required value="Sample"><button type="submit">Save</button></form>`;
   window.writes=0;document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.writes++;window.savedSubmitter=e.submitter?.textContent;});
  },{id,attrs});
  for(const id of ids){
   await setup(id);await page.locator('form button').click();await page.locator('dialog').waitFor();
   assert.equal(await page.evaluate(()=>writes),0,id+' blocks mutation');
   await page.locator('dialog button').first().click();assert.equal(await page.evaluate(()=>writes),0,id+' cancels');
   await page.locator('form button').click();await page.locator('dialog button').last().click();
   assert.equal(await page.evaluate(()=>writes),1,id+' commits once');assert.equal(await page.evaluate(()=>savedSubmitter),'Save');
  }
  await setup('edit-class-form');await page.locator('input').fill('');await page.locator('form button').click();assert.equal(await page.locator('dialog').count(),0,'invalid form stays in validation');
  await page.locator('input').fill('Class A');await page.locator('form button').click();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>writes),0,'Escape cancels');
  await page.locator('form button').click();await page.evaluate(()=>document.querySelector('input').value='Changed');await page.locator('dialog button').last().click();assert.equal(await page.evaluate(()=>writes),0,'changed values require a fresh confirmation');
  await setup('lesson-form','data-confirm-manually');await page.locator('form button').click();assert.equal(await page.evaluate(()=>writes),1,'manual confirmations are not doubled');
  await setup('login-form');await page.locator('form button').click();assert.equal(await page.evaluate(()=>writes),1,'login remains direct');
  for(const width of [390,1440])for(const theme of ['light','dark']){
   await setup('account-profile-form');await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.locator('form button').click();await page.locator('dialog').waitFor();
   assert.equal(await page.evaluate(()=>document.querySelector('dialog').scrollWidth>document.querySelector('dialog').clientWidth),false,'no dialog overflow');
   await fs.mkdir(path.join(root,'audit/action-confirmations'),{recursive:true});await page.screenshot({path:path.join(root,`audit/action-confirmations/save-${width}-${theme}.png`)});
   await page.keyboard.press('Escape');
  }
  await page.evaluate(()=>{window.confirmAction({title:'Delete this lesson?',message:'The lesson and its learning materials will be removed.',confirm:'Delete lesson',danger:true});});
  await page.screenshot({path:path.join(root,'audit/action-confirmations/delete-dark.png')});await page.keyboard.press('Escape');
  console.log(`PASS: ${ids.length} form policies, cancellation, validation, exactly-once replay, changed-data protection, manual-dialog exemption, syntax and light/dark responsive dialogs.`);
 }finally{await browser.close();server.close();}
})();
