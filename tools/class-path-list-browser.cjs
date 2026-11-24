// Real classroom path cards, menus, schedule/extension forms and API payloads; local adapters only.
const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'class-design-browser.cjs'),'utf8');
let harness=source.slice(0,source.indexOf('(async()=>{'))
 .replace('const fixture = `','let fixture = `')
 .replace('audit/class-design','audit/class-path-list')
 .replace('const stubbed = [',"const stubbed = ['teacher/views/progressData.js',")
 .replace("await renderClass('classroom'); window.ready=true;","location.hash='/classes/classroom';await renderClass('classroom');window.ready=true;");
const run=`
fixture=fixture.replace(/export const getDocs = async[\\s\\S]*?export const updateDoc =/, \`const links=new Map([
 ['one',{lessonId:'one',order:1,mode:'assessment',learningPathAssignmentId:'path',learningPathTitle:'Tekstong Multimodal',moduleId:'m1',openAt:date(-2),dueAt:date(3)}],
 ['two',{lessonId:'two',order:2,mode:'assessment',learningPathAssignmentId:'path',learningPathTitle:'Tekstong Multimodal',moduleId:'m2',openAt:date(-2),dueAt:date(3)}],
 ['three',{lessonId:'three',order:3,mode:'assessment',learningPathAssignmentId:'next',learningPathTitle:'Susi sa Pag-unawa',moduleId:'m3',openAt:date(-1),dueAt:date(5)}]
]);const paths=new Map([['path',{title:'Tekstong Multimodal',order:1,lessonIds:['one','two'],mode:'assessment',openAt:date(-2),dueAt:date(3)}],['next',{title:'Susi sa Pag-unawa',order:3,lessonIds:['three'],mode:'assessment',openAt:date(-1),dueAt:date(5)}]]),saved=new Map();
window.links=links;window.paths=paths;window.progress={one:{score:8}};
export const getDocs=async c=>({docs:[...(c.endsWith('/classLessons')?links:c.endsWith('/learningPaths')?paths:new Map())].map(([id,data])=>({id,data:()=>data}))});
export const updateDoc =\`);
fixture=fixture.replace('export const postToApi = async () => {};',\`export const postToApi=async(url,body)=>{
 window.requests=[...(window.requests||[]),{url,...body}];
 if(url!=='content-lifecycle')return {};
 if(window.failAction===body.action)throw Error('Synthetic request failure');
 if(body.action==='schedule-learning-path'){
  const dates={openAt:body.openAt===null?null:Timestamp.fromDate(new Date(body.openAt)),dueAt:body.dueAt===null?null:Timestamp.fromDate(new Date(body.dueAt))};
  Object.assign(paths.get(body.assignmentId),dates);for(const link of links.values())if(link.learningPathAssignmentId===body.assignmentId)Object.assign(link,dates);return {};
 }
 if(body.action==='restore-class-path'){for(const [id,link] of saved)if(link.learningPathAssignmentId===body.assignmentId){links.set(id,link);saved.delete(id);}paths.get(body.assignmentId).archived=false;}
 else {for(const [id,link] of links)if(link.learningPathAssignmentId===body.assignmentId){saved.set(id,link);links.delete(id);}paths.get(body.assignmentId).archived=true;}
 return {};
};\`);
fixture+='export const loadClassContext=async()=>({students:[],lessons:[]}),loadStudentProgress=async()=>({}),completionOf=()=>({percent:0});state.profile={role:"teacher"};';
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
 const p=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),base='http://127.0.0.1:'+server.address().port,errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 await p.goto(base+'/teacher/preview.html');await p.waitForFunction(()=>window.ready);
 const menu=()=>p.locator('[data-class-path="path"] .class-path-menu summary');
 const openMenu=async()=>{if(!await p.locator('[data-class-path="path"] .class-path-menu').evaluate(el=>el.open))await menu().click();await p.locator('[data-archive-path="path"]').waitFor({state:'visible'});};
 const confirm=label=>p.locator('.action-confirmation').getByRole('button',{name:label,exact:true}).click();
 assert.equal(await p.locator('.class-path-card').count(),2);
 assert.equal(await p.locator('[data-archive-lesson], [data-schedule], [data-extend], .class-lessons__list').count(),0);
 assert.doesNotMatch(await p.locator('.class-path-list').innerText(),/Ang ating pamayanan|Mga salita sa araw-araw|Pagbasa at pag-unawa/);
 await openMenu();assert.equal(await p.locator('[data-extend-path="path"]').isVisible(),true);
 await menu().press('Escape');assert.equal(await p.locator('[data-extend-path="path"]').isVisible(),false);
 await menu().press('ArrowDown');assert.equal(await p.locator('[data-extend-path="path"]').evaluate(el=>el===document.activeElement),true);
 await p.locator('[data-schedule-path="path"]').click();await p.locator('#schedule-form').waitFor();
 assert.match(await p.locator('.modal').innerText(),/Tekstong Multimodal/);
 await p.locator('#schedule-cancel').click();assert.equal(await p.evaluate(()=>requests?.length||0).catch(()=>0),0);
 await openMenu();await p.locator('[data-schedule-path="path"]').click();
 const due=await p.locator('#schedule-form [name="dueAt"]').inputValue();
 await p.locator('#schedule-form [type="submit"]').click();await confirm('Save schedule');
 await p.waitForFunction(()=>window.requests?.some(r=>r.action==='schedule-learning-path'));
 assert.equal(await p.evaluate(()=>requests.find(r=>r.action==='schedule-learning-path').assignmentId),'path');
 await p.locator('#schedule-form').waitFor({state:'detached'});
 await openMenu();await p.locator('[data-extend-path="path"]').click();await p.locator('#extend-form').waitFor();
 assert.equal(await p.locator('#extend-form [name="openAt"]').count(),0); // Dedicated extension action.
 await p.locator('#extend-form [type="submit"]').click();await confirm('Extend deadline');
 await p.waitForFunction(()=>window.requests?.filter(r=>r.action==='schedule-learning-path').length===2);
 await p.locator('#extend-form').waitFor({state:'detached'});
 assert.equal(await p.evaluate(()=>links.get('one').dueAt.toMillis()===links.get('two').dueAt.toMillis()),true);
 for(const width of [1440,768,390,320])for(const theme of ['light','dark']) {
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(250);
  if(!await p.locator('[data-archive-path="path"]').isVisible())await openMenu();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const box=await p.locator('[data-class-path="path"] .class-path-menu__popup').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
  await p.screenshot({path:path.join(artifacts,'path-menu-'+width+'-'+theme+'.png'),fullPage:true});await menu().press('Escape');
 }
 await openMenu();await p.locator('[data-archive-path="path"]').click();await confirm('Cancel');assert.equal(await p.locator('.class-path-card').count(),2);
 await p.evaluate(()=>window.failAction='archive-class-content');await openMenu();await p.locator('[data-archive-path="path"]').click();await confirm('Archive lesson path');
 await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Synthetic request failure'));assert.equal(await p.locator('.class-path-card').count(),2);
 await p.evaluate(()=>window.failAction=null);await openMenu();await p.locator('[data-archive-path="path"]').click();await confirm('Archive lesson path');
 await p.locator('[data-class-path="path"]').waitFor({state:'detached'});assert.equal(await p.locator('.class-path-card').count(),1);
 assert.deepEqual(await p.evaluate(()=>progress),{one:{score:8}});
 await p.locator('.class-path-archive summary').click();await p.locator('[data-restore-path="path"]').click();await confirm('Restore lesson path');
 await p.locator('[data-class-path="path"]').waitFor();assert.equal(await p.locator('.class-path-card').count(),2);
 assert.deepEqual(errors,[]);console.log('PASS: path-only teacher list, hamburger actions, keyboard/escape, whole-path schedule and dedicated deadline extension, cancel/failure/archive/restore, preserved progress and 8 responsive light/dark menu layouts.');
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});`;
new Function('require','__dirname',harness+run)(require,__dirname);
