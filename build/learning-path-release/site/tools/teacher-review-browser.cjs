// Synthetic teacher UI only. Does not sign in or contact any production API.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
let browser;
const css=['base/tokens','base/reset','base/typography','base/animations','components/buttons','components/forms','components/cards','components/directory','layout/page-header','pages/class-page'];
const html=`<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(file=>`<link rel="stylesheet" href="/css/${file}.css">`).join('')}</head><body data-portal="teacher"><main id="app-view" style="max-width:1000px;margin:30px auto;padding:20px"><header id="page-header"></header><div id="page-content"></div></main><script type="module">
import {addLessonAction,reviewReadingsAction,watchTeacherTooltips,leaveTeacherTooltips} from '/teacher/views/classActions.js';
import {renderFluencyReview} from '/teacher/views/fluencyReview.js';
document.querySelector('#page-header').innerHTML='<h1>Grade 4 — Rizal</h1>';
document.querySelector('#page-content').innerHTML='<section class="class-lessons" id="old-class"><div class="class-lessons__header"><div><h2>Assigned lessons</h2><p>Keep the class moving.</p></div><div class="teacher-class-actions">'+reviewReadingsAction('class')+addLessonAction('add-lesson-inline')+'</div></div><div style="padding:24px">Ana Santos <span class="teacher-notification-dot student-notification-dot" tabindex="0" role="img" aria-label="Unread class messages · Recordings awaiting grading" data-teacher-tooltip></span></div></section>';
watchTeacherTooltips();
window.addEventListener('hashchange',()=>{leaveTeacherTooltips();void renderFluencyReview('class')});
</script></body></html>`;
const helpers=`export const $=s=>document.querySelector(s);export const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));export function page(title,subtitle,actions){document.querySelector('#page-header').innerHTML='<h1>'+escapeHtml(title)+'</h1><p>'+escapeHtml(subtitle)+'</p>'+actions;}`;
const api=`export async function postToApi(_path,body){if(body.operation==='fluency-list')return{submissions:[{id:'sample',uid:'ana',name:'Ana Santos',title:'Ang aming tahanan'}]};if(body.operation==='fluency-play')return{pages:[{sentence:'Masayang nagbabasa ang mga bata.',recordingUrl:''}]};return{};}`;
const allowed=new Set(['teacher/views/classActions.js','teacher/views/fluencyReview.js','js/floatingTooltip.js']);
const server=http.createServer(async(req,res)=>{
  try {
    const name=new URL(req.url,'http://fixture').pathname.slice(1);
    let body,type='text/javascript';
    if(!name){body=html;type='text/html'}
    else if(name==='js/helpers.js')body=helpers;
    else if(name==='js/api.js')body=api;
    else if((allowed.has(name)||name.startsWith('css/'))&&!name.split('/').some(part=>part.startsWith('.'))){body=await fs.readFile(path.join(root,name));if(name.endsWith('.css'))type='text/css'}
    else {res.writeHead(404);res.end();return}
    res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
  }catch{res.writeHead(404);res.end()}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const add=page.locator('#add-lesson-inline'),review=page.getByRole('link',{name:'Review readings'});
  await add.waitFor();assert.equal(await add.textContent(),'');assert.equal(await review.textContent(),'');
  await add.hover();await page.waitForTimeout(220);
  assert.equal(await page.locator('.floating-tooltip').textContent(),'Add lesson');
  assert.equal(await page.locator('.floating-tooltip').isVisible(),true);
  const style=await add.evaluate(button=>({background:getComputedStyle(button).backgroundColor,transform:getComputedStyle(button.querySelector('svg')).transform}));
  assert.match(style.background,/0\.1\)/);assert.notEqual(style.transform,'none');
  await page.locator('.student-notification-dot').focus();await page.mouse.move(900,800);
  assert.match(await page.locator('.floating-tooltip').textContent(),/Recordings awaiting grading/);
  const actions=path.join(os.tmpdir(),'basaya-teacher-actions.png');await page.screenshot({path:actions,fullPage:true});
  await review.click();await page.locator('#reading-grade').waitFor();
  assert.equal(await page.locator('#old-class').count(),0);assert.equal(await page.locator('#reading-review').count(),1);
  assert.equal(await page.locator('.floating-tooltip').count(),0);
  const recordings=path.join(os.tmpdir(),'basaya-teacher-readings.png');await page.screenshot({path:recordings,fullPage:true});
  for(const name of ['accuracy','smoothness','expression'])await page.locator(`[name="${name}"]`).selectOption('3');
  await page.locator('[name="feedback"]').fill('Clear reading. Keep practising.');
  await page.getByRole('button',{name:'Save grade and next'}).click();await page.getByText('All caught up').waitFor();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',actions,recordings,hover:style}));
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
