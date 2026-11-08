// Actual student renderer, scoring, remarks, theme and workbook code; fixture reads only.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const auditText=require('./text-readability-audit.cjs');
const {chromium}=require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'audit/student-progress-design');
const fixture=`
import {SKILLS,summarize,lessonParts} from '/js/scoring.js';
export const state={user:{uid:'teacher',email:'teacher@example.test'},profile:{displayName:'Test Teacher'}},db={};
export const doc=()=>'';export const getDoc=async()=>({data:()=>({gender:'Babae',dob:'2016-10-12'})});
export const titledFullName=name=>name;
const statuses=['done','in-progress','not-started','overdue','scheduled','before-joining'];
const lessons=statuses.map((status,i)=>({id:String(i),number:i+1,title:i===0?'Ang ating pamayanan at ang mga kuwentong bumubuo sa ating pagkakakilanlan':'Pagbasa at pag-unawa '+(i+1),gameSkipped:i===1,activitySkipped:i===2,dueAt:Date.now()}));
export const loadClassContext=async()=>location.search.includes('unauthorized')?null:({classroom:{id:'classroom',className:'Grade 7 — Rizal'},students:location.search.includes('not-member')?[]:[{id:'student',name:'Reyes, Ana',joinedAt:{toDate:()=>new Date('2026-06-01')}}],lessons:location.search.includes('empty')?[]:lessons});
export const loadStudentProgress=async()=>{
 if(location.search.includes('moved'))return {error:'moved'};
 if(location.search.includes('unavailable'))return {error:'unavailable'};
 const empty=location.search.includes('empty'),noData=location.search.includes('no-data')||empty;
 const pending=location.search.includes('pending');
 const results=Object.fromEntries(SKILLS.map((s,k)=>[s.key,k===0||noData||(pending&&k===3)?[]:(location.search.includes('limited')?[0]:[0,1,2,3]).map((n)=>({lessonId:String(n),correct:k===1?[2,3,3,4][n]:k===2?[6,7,8,9][n]:k===3?[9,9,8,6][n]:[8,8,8,8][n],attempts:10,items:location.search.includes('limited')?3:10,completedAtMillis:n+1}))]));
 return {summary:summarize(results),hasData:!noData,lastActive:noData?null:Date.now()-3600000,hardWords:noData?[]:[{word:'pagkakakilanlan',count:3},{word:'pamayanan',count:1}],perLesson:empty?[]:lessons.map((lesson,i)=>({lesson,parts:lessonParts({lectureFinished:!noData&&i===0,gameFinished:!noData&&i===0,activityFinished:!noData&&i===0,pronunciationFinished:!noData&&i<2,quizFinished:!noData&&i===0},{game:lesson.gameSkipped,activity:lesson.activitySkipped}),lectureDone:!noData&&i===0,status:noData?'not-started':statuses[i],missed:noData?[]:i===3?['talasalitaan']:[],skills:Object.fromEntries(SKILLS.map((s,k)=>[s.key,noData||i>3||k===0||(pending&&k===3)?null:k===1?0:k===2?65:k===3?80:95]))}))};
};
`;
let progressFixture;
const server=http.createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://preview').pathname).slice(1);let body,type='text/javascript';
 if(name==='fixture.mjs')body=fixture;
 else if(name==='progress-fixture.mjs')body=progressFixture;
 else if(name==='teacher/student-progress-preview.html'){
  body=(await fs.readFile(path.join(root,'teacher/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/type="module"/.test(s)?'':s).replace('</body>',`<script type="module">import {renderStudentProgress} from './views/studentProgress.js';import '../js/theme.js';document.querySelector('#loading-screen').hidden=true;document.querySelector('#app-view').hidden=false;document.querySelector('[data-nav="classes"]').classList.add('active');await renderStudentProgress('classroom','student');window.ready=true;</script></body>`);type='text/html';
 }else{
  const target=path.resolve(root,name);if(!target.startsWith(root+path.sep)||name.split(/[\\/]/).some(p=>p.startsWith('.')))throw Error('Invalid path');body=await fs.readFile(target);const ext=path.extname(name);type={'.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'}[ext]||type;
  if(ext==='.js')body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,(m,q,src)=>{
   const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),src));
   if(resolved==='teacher/views/progressData.js')return `from '/progress-fixture.mjs'`;
   return src.startsWith('https://www.gstatic.com/firebasejs/')||['js/firebase.js','js/state.js'].includes(resolved)||src.includes('chat.js?')?`from '/fixture.mjs'`:m;
  });
 }
 res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
}catch(e){res.writeHead(404);res.end(e.message)}});
(async()=>{
 const src=await fs.readFile(path.join(root,'teacher/views/progressData.js'),'utf8');
 const fn=name=>src.match(new RegExp('export function '+name+'\\([^]*?\\n\\}'))[0];
 progressFixture=`import {SKILLS} from '/js/scoring.js';export {loadClassContext,loadStudentProgress} from '/fixture.mjs';const counted=p=>p.perLesson.filter(r=>r.status!=='scheduled'&&r.status!=='before-joining');const skillName=k=>SKILLS.find(s=>s.key===k)?.name||k;${['completionOf','lecturesOf','studentRemarks'].map(fn).join('\n')}`;
 await fs.mkdir(artifacts,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',r=>r.fulfill({path:path.join(root,'audit/class-report-design/exceljs.min.js'),contentType:'text/javascript'}));
 // Inspect the supplied URL in a fresh session without copying credentials or student data.
 let live={skipped:true};
 if(!process.argv.includes('--skip-live'))try{await page.goto('http://localhost/BaSaya-web/teacher/index.html#/classes/NfPCDMUkyc67dcHQKI91/students/Pf5KIB3cP9XP7VuiDOlKqCwWZkk2',{timeout:15000,waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('.student-progress-workspace')||document.querySelector('input[type="password"]')||document.querySelector('#loading-screen')?.textContent.includes('couldn'),{},{timeout:15000}).catch(()=>{});live=await page.evaluate(()=>({path:location.pathname,progressRendered:!!document.querySelector('.student-progress-workspace'),loginVisible:!!document.querySelector('input[type="password"]'),startupVisible:!!document.querySelector('#loading-screen:not([hidden])')}));}catch(e){live={error:e.message.split('\n')[0]}}
 errors.length=0;
 const url=`http://127.0.0.1:${server.address().port}/teacher/student-progress-preview.html`;
 await page.goto(url);await page.waitForFunction(()=>window.ready);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('.sp-skill-table tbody tr').count(),5);
 assert.equal(await page.locator('.sp-skill-table').getByText('Lessons read · completion only',{exact:true}).count(),0);
 assert.equal(await page.locator('.sp-skill-table').getByText('Saying the words aloud',{exact:true}).count(),0);
 assert.match(await page.locator('[data-skill="talasalitaan"] th').innerText(),/1 of 3 open activities completed/);
 assert.match(await page.locator('[data-skill="pagbigkas"] th').innerText(),/2 of 4 open activities completed/);
 assert.doesNotMatch(await page.locator('[data-skill="talasalitaan"] th').innerText(),/lessons with results/);
 assert.equal(await page.locator('.sp-score').getByText('Current accuracy',{exact:true}).count(),0);
 assert.equal(await page.locator('.progress-table tbody tr').count(),6);
 assert.equal(await page.locator('.progress-table tbody tr:visible').count(),5);
 assert.deepEqual(await page.locator('.pagination__size option').evaluateAll(options=>options.map(option=>option.value)),['5','10','15','20','25']);
 assert.ok(await page.locator('[data-page="prev"]').isDisabled());
 await page.keyboard.press('Tab');await page.locator('[data-page="next"]').focus();
 assert.equal(await page.locator('[data-page="next"]').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
 await page.keyboard.press('Enter');
 assert.equal(await page.locator('.progress-table tbody tr:visible').count(),1);
 assert.match(await page.locator('.pagination__summary').innerText(),/6–6 of 6 lessons/);
 await page.locator('.pagination__size select').selectOption('10');
 assert.equal(await page.locator('.progress-table tbody tr:visible').count(),6);
 assert.equal(await page.locator('[aria-current="page"]').innerText(),'1');
 await page.locator('.pagination__size select').selectOption('15');
 assert.equal(await page.locator('.progress-table tbody tr:visible').count(),6);
 await page.locator('.pagination__size select').selectOption('5');
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 assert.match(await page.locator('.sp-skill-row--lecture').innerText(),/Completion only/);
 assert.match(await page.locator('.progress-stat').first().innerText(),/25% of open lessons/);
 assert.ok(await page.locator('.sp-help-flag').count()>0);
 assert.equal(await page.locator('.score-cell--skip').count(),2);
 assert.equal(await page.locator('.progress-table [title*="deadline"]').count(),1);
 const readability=[];
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(350);
  for(const [name,width] of [['desktop',1440],['laptop',1100],['tablet',768],['mobile',390],['small-mobile',320]]){
   await page.setViewportSize({width,height:1000});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)){
    await page.screenshot({path:path.join(artifacts,'overflow.png'),fullPage:true});
    console.log(await page.evaluate(()=>['.sp-table-wrap','.progress-table-wrap','.progress-columns','.progress-overview','#page-header','.site-footer','.sidebar'].map(sel=>{const el=document.querySelector(sel),before=el.style.display;el.style.display='none';const width=document.documentElement.scrollWidth;el.style.display=before;return [sel,width]})));
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${name} page overflow`);
   readability.push({theme,name,issues:(await auditText(page)).filter(i=>!i.label.startsWith('rp-sr-only')&&!i.label.startsWith('rp-action-label'))});
   await page.screenshot({path:path.join(artifacts,`${name}-${theme}.png`),fullPage:true});
  }
 }
 await fs.writeFile(path.join(artifacts,'readability.json'),JSON.stringify(readability,null,2));
 assert.deepEqual(readability.flatMap(r=>r.issues),[],'Visible text readability');
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#print-report').scrollIntoViewIfNeeded();
 await page.mouse.move(1,1);
 await page.locator('#print-report').hover();
 assert.equal(await page.locator('.floating-tooltip:visible').innerText(),'Print / PDF');
 await page.screenshot({path:path.join(artifacts,'tooltip-dark.png')});
 await page.locator('#export-excel').hover();assert.equal(await page.locator('.floating-tooltip:visible').innerText(),'Export Excel');
 const waitDownload=page.waitForEvent('download');await page.locator('#export-excel').click();const download=await waitDownload;await download.saveAs(path.join(artifacts,'student-progress.xlsx'));assert.ok(download.suggestedFilename().endsWith('.xlsx'));
 const workbook=await page.evaluate(async bytes=>{const w=new window.ExcelJS.Workbook();await w.xlsx.load(new Uint8Array(bytes));return w.worksheets.map(s=>({name:s.name,values:s.getSheetValues()}))},[...await fs.readFile(path.join(artifacts,'student-progress.xlsx'))]);
 assert.deepEqual(workbook.map(s=>s.name),['Summary','Teacher notes','Lessons','Words to practice','Guide']);assert.ok(JSON.stringify(workbook).includes('Reyes, Ana'));assert.ok(JSON.stringify(workbook).includes('Skipped'));
 await page.evaluate(()=>window.print=()=>{window.dispatchEvent(new Event('beforeprint'));window.printTheme=document.documentElement.dataset.theme;window.dispatchEvent(new Event('afterprint'));window.printed=true});await page.locator('#print-report').click();assert.equal(await page.evaluate(()=>window.printed),true);assert.equal(await page.evaluate(()=>window.printTheme),'light');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
 await page.emulateMedia({media:'print'});await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await page.pdf({path:path.join(artifacts,'student-progress.pdf'),format:'A4',printBackground:true});
 assert.equal(await page.locator('.progress-table tbody tr:visible').count(),6,'Print includes all lessons');
 assert.equal(await page.locator('.pagination:visible').count(),0,'Pagination is hidden in print');
 assert.ok(await page.locator('.progress-table').evaluate(e=>e.getBoundingClientRect().width<=document.querySelector('.content').getBoundingClientRect().width+1),'Print table overflow');
 await page.emulateMedia({media:'screen',reducedMotion:'reduce'});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));assert.equal(await page.locator('.sp-action').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 await page.evaluate(()=>window.ExcelJS={Workbook:class{constructor(){throw Error('QA export failure')}}});await page.locator('#export-excel').click();await page.waitForFunction(()=>document.querySelector('#report-export-status').textContent.includes('failed'));assert.ok(await page.locator('#export-excel').isEnabled());
 await page.locator('#open-class-report').click();assert.equal(await page.evaluate(()=>location.hash),'#/classes/classroom/report');
 await page.locator('[data-theme-toggle]').click();const saved=await page.evaluate(()=>localStorage.getItem('basaya-theme'));await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),saved);
 for(const variant of ['no-data','limited','pending','empty','moved','unavailable']){
  await page.goto(url+'?'+variant);await page.waitForFunction(()=>window.ready);await page.setViewportSize({width:390,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(variant==='no-data'){assert.equal(await page.locator('.sp-help-flag').count(),0);assert.equal(await page.locator('.sp-score--empty').count(),4);assert.equal(await page.locator('.remark--no-data').count(),4)}
  if(variant==='no-data')assert.match(await page.locator('[data-skill="talasalitaan"] .remark').innerText(),/Not started/);
  if(variant==='pending'){assert.match(await page.locator('[data-skill="pagbigkas"] .remark').innerText(),/Awaiting results/);assert.match(await page.locator('[data-skill="pagbigkas"] th').innerText(),/2 of 4 open activities completed/)}
  if(variant==='limited'){assert.equal(await page.locator('.remark--no-data').count(),4);assert.equal(await page.locator('.sp-score--empty').count(),0);assert.equal(await page.locator('.sp-help-flag').count(),0)}
  if(variant==='empty')assert.match(await page.locator('.progress-panel__empty').last().innerText(),/No lessons assigned/);
  if(variant==='empty')assert.equal(await page.locator('.pagination').count(),0);
  if(['moved','unavailable'].includes(variant)){assert.ok(await page.locator('.sp-unavailable').isVisible());assert.equal(await page.locator('#export-excel').count(),0)}
  await page.screenshot({path:path.join(artifacts,variant+'.png'),fullPage:true});
 }
 await page.goto(url+'?unauthorized');await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>location.hash),'#/dashboard');
 await page.goto(url+'?not-member');await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>location.hash),'#/classes/classroom/students');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(artifacts,'results.json'),JSON.stringify({live,errors,checks:'Responsive light/dark 320–1440; contrast and clipping; real scoring/remarks; missing results and completion-only lecture; skip/missed statuses; tooltips/focus; XLSX five worksheets; PDF; export failure; class report routing; theme persistence; reduced motion; no data/empty/unavailable; ownership and membership redirects'},null,2));
 console.log('PASS: student progress visual, functional, XLSX and print checks');
 }finally{await browser.close()}
})().finally(()=>server.close()).catch(e=>{console.error(e);process.exitCode=1});
