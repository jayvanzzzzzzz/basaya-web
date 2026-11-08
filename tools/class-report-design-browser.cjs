// Isolated report QA. Production rendering/scoring/export code; fixture reads only.
// Cache the pinned ExcelJS CDN file at audit/class-report-design/exceljs.min.js
// before running; production still loads that same library from its existing CDN.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const auditText = require('./text-readability-audit.cjs');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'audit/class-report-design');
const fixture = `
import {SKILLS,summarize} from '/js/scoring.js';
export const state={user:{uid:'teacher',email:'teacher@example.test'},profile:{displayName:'Test Teacher'}};
export const db={}; export const doc=()=>'';
export const getDoc=async()=>({data:()=>({gender:'Babae'})});
export const titledFullName=(name)=>name;
const students=Array.from({length:16},(_,i)=>({id:String(i),name:['Reyes, Ana','Cruz, Benjamin','Santos, Clara'][i%3]+' '+(i+1)}));
export const loadClassContext=async()=>({classroom:{className:'Grade 7 — Rizal',classCode:'RZ7ABC'},lessons:[],students:location.search.includes('empty')?[]:students});
export async function loadStudentProgress(id){
 if(id==='15')return {error:'moved'};
 const noData=location.search.includes('no-data')||+id>11;
 const scores=[9,8,6,3];
 const results=Object.fromEntries(SKILLS.map((s,k)=>[s.key,k===0||noData?[]:[0,1].map(n=>({lessonId:String(n),correct:scores[(+id+k)%4],attempts:10,items:10,completedAtMillis:n+1}))]));
 return {summary:summarize(results),hasData:!noData,perLesson:[0,1].map(n=>({lesson:{id:String(n)},status:noData?'not-started':+id%2?'in-progress':'done',lectureDone:!noData}))};
}
`;
let progressFixture;
const server = http.createServer(async(req,res)=>{
 try {
  const name=decodeURIComponent(new URL(req.url,'http://preview').pathname).slice(1);
  let body,type='text/javascript';
  if(name==='fixture.mjs')body=fixture;
  else if(name==='progress-fixture.mjs')body=progressFixture;
  else if(name==='teacher/report-preview.html'){
   body=(await fs.readFile(path.join(root,'teacher/index.html'),'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/type="module"/.test(s)?'':s)
    .replace('</body>',`<script type="module">
     import {renderClassReport} from './views/classReport.js'; import '../js/theme.js';
     document.querySelector('#loading-screen').hidden=true;document.querySelector('#app-view').hidden=false;
     document.querySelector('[data-nav="classes"]').classList.add('active');
     await renderClassReport('classroom');window.ready=true;
     </script></body>`);type='text/html';
  }else{
   const target=path.resolve(root,name);if(!target.startsWith(root+path.sep)||name.split(/[\\/]/).some(p=>p.startsWith('.')))throw Error('Invalid path');
   body=await fs.readFile(target); const ext=path.extname(name);
   type={'.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'}[ext]||type;
   if(ext==='.js')body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,(match,q,source)=>{
    const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),source));
    if(resolved==='teacher/views/progressData.js')return `from '/progress-fixture.mjs'`;
    return source.startsWith('https://www.gstatic.com/firebasejs/')||['js/firebase.js','js/state.js'].includes(resolved)||source.includes('chat.js?')?`from '/fixture.mjs'`:match;
   });
  }
  res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
 }catch(e){res.writeHead(404);res.end(e.message);}
});
(async()=>{
 const src=await fs.readFile(path.join(root,'teacher/views/progressData.js'),'utf8');
 const fn=name=>src.match(new RegExp('export function '+name+'\\([^]*?\\n\\}'))[0];
 progressFixture=`import {SKILLS,LEVELS,remarkFor} from '/js/scoring.js';export {loadClassContext,loadStudentProgress} from '/fixture.mjs';
 const counted=p=>p.perLesson.filter(r=>r.status!=='scheduled'&&r.status!=='before-joining');
 ${['completionOf','lecturesOf','classReport','classRemarks'].map(fn).join('\n')}`;
 await fs.mkdir(artifacts,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});
  // Use the unmodified pinned CDN library cached locally, so browser network policy
  // does not prevent verification of the real workbook generation/download.
  await page.route('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',route=>route.fulfill({path:path.join(artifacts,'exceljs.min.js'),contentType:'text/javascript'}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/teacher/report-preview.html`;
  await page.goto(url);await page.waitForFunction(()=>window.ready);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.rp-table--skills tbody tr').count(),5);
  assert.equal(await page.locator('.rp-table--skills tbody tr').first().locator('td').nth(1).innerText(),'Completion only');
  assert.equal(await page.locator('.rp-participation').first().getAttribute('aria-label'),'12 of 15 students with results');
  const snapshots=[];
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('basaya-theme',theme)},theme);
   await page.waitForTimeout(350);
   for(const [name,width] of [['desktop',1440],['laptop',1100],['tablet',768],['mobile',390],['small-mobile',320]]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${name} page overflow: ${JSON.stringify(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.rp-table-wrap')).map(e=>[e.className,e.getBoundingClientRect().right]).slice(0,20)})))}`);
    // Audit visible report copy; screen-reader-only text is deliberately clipped.
    const issues=(await auditText(page)).filter(i=>!i.label.startsWith('rp-sr-only')&&!i.label.startsWith('rp-action-label'));
    assert.deepEqual(issues,[],`${theme}/${name} text audit`);
    await page.screenshot({path:path.join(artifacts,`${name}-${theme}.png`),fullPage:true});snapshots.push(`${name}-${theme}`);
   }
   await page.setViewportSize({width:1440,height:1000});
   await page.locator('#print-report').focus();await page.waitForTimeout(230);
   assert.equal(await page.locator('#print-report').evaluate(e=>getComputedStyle(e,'::after').opacity),'1');
   assert.equal(await page.locator('#print-report').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
   await page.locator('#export-excel').hover();await page.waitForTimeout(230);
   assert.equal(await page.locator('#export-excel').evaluate(e=>getComputedStyle(e,'::after').opacity),'1');
   await page.screenshot({path:path.join(artifacts,`tooltip-${theme}.png`)});
   await page.locator('.rp-table--skills tbody tr').nth(2).hover();
   await page.screenshot({path:path.join(artifacts,`row-hover-${theme}.png`)});
  }
  // Real ExcelJS download (not a replacement export callback).
  const download=page.waitForEvent('download');await page.locator('#export-excel').click();
  const file=await download;assert.ok(file.suggestedFilename().endsWith('.xlsx'));
  await file.saveAs(path.join(artifacts,'class-report.xlsx'));
  assert.equal(await page.locator('#export-excel').getAttribute('aria-label'),'Export Excel');
  assert.equal(await page.locator('#export-excel').isEnabled(),true);
  // Actual workbook archive should contain data sheets and academic terms.
  assert.ok((await fs.stat(path.join(artifacts,'class-report.xlsx'))).size>5000);
  const workbook=await page.evaluate(async bytes=>{
   const book=new window.ExcelJS.Workbook();await book.xlsx.load(new Uint8Array(bytes));
   return book.worksheets.map(sheet=>({name:sheet.name,values:sheet.getSheetValues()}));
  },[...await fs.readFile(path.join(artifacts,'class-report.xlsx'))]);
  assert.deepEqual(workbook.map(s=>s.name),['Students','Skill averages','Guide']);
  assert.ok(JSON.stringify(workbook).includes('Grade 7 — Rizal'));
  assert.ok(JSON.stringify(workbook).includes('Not enough data'));
  // Exercise browser print action and the real theme restoration hooks.
  await page.evaluate(()=>{window.print=()=>{window.dispatchEvent(new Event('beforeprint'));window.printTheme=document.documentElement.dataset.theme;window.dispatchEvent(new Event('afterprint'));window.printed=true}});
  await page.locator('#print-report').click();
  assert.equal(await page.evaluate(()=>window.printed),true);
  assert.equal(await page.evaluate(()=>window.printTheme),'light');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
  await page.emulateMedia({media:'print'});await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  await page.pdf({path:path.join(artifacts,'class-report.pdf'),format:'A4',printBackground:true});
  assert.ok(await page.locator('.rp-table--skills').evaluate(e=>e.getBoundingClientRect().width<=document.querySelector('.content').getBoundingClientRect().width+1),'Print table overflow');
  await page.emulateMedia({media:'screen',reducedMotion:'reduce'});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  assert.equal(await page.locator('#print-report').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  // Export errors restore the control and announce failure.
  await page.evaluate(()=>window.ExcelJS={Workbook:class{constructor(){throw Error('QA export failure')}}});
  await page.locator('#export-excel').click();
  await page.waitForFunction(()=>document.querySelector('#report-export-status').textContent.includes('failed'));
  assert.ok(await page.locator('#export-excel').isEnabled());
  // Reload after print-media simulation to exercise the saved theme afresh.
  await page.reload();await page.waitForFunction(()=>window.ready);
  await page.locator('[data-theme-toggle]').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('basaya-theme')),'light');
  await page.reload();await page.waitForFunction(()=>window.ready);
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
  await page.locator('[data-theme-toggle]').click();
  await page.goto(url+'?no-data');await page.waitForFunction(()=>window.ready);
  assert.equal(await page.locator('.rp-participation').first().getAttribute('aria-label'),'0 of 15 students with results');
  assert.equal(await page.locator('.rp-table--skills tbody tr').nth(1).locator('td').first().innerText(),'—');
  await page.screenshot({path:path.join(artifacts,'no-data-dark.png'),fullPage:true});
  await page.goto(url+'?empty');await page.waitForFunction(()=>window.ready);
  assert.ok(await page.locator('.rp-empty-state').isVisible());
  await page.screenshot({path:path.join(artifacts,'empty-dark.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(artifacts,'results.json'),JSON.stringify({snapshots,errors,checks:'Responsive/theme/readability/tooltips/real XLSX/print PDF/export failure/empty/no-data/reduced motion passed'},null,2));
  console.log('PASS: report visual, responsive, accessible controls, XLSX and print regression checks');
 }finally{await browser.close();}
})().finally(()=>server.close()).catch(e=>{console.error(e);process.exitCode=1});
