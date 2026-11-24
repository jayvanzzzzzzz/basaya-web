const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'class-design-browser.cjs'),'utf8');
let harness=source.slice(0,source.indexOf('(async()=>{'))
 .replace('const fixture = `','let fixture = `')
 .replace("audit/class-design", "audit/class-content-archive")
 .replace("const stubbed = [", "const stubbed = ['teacher/views/progressData.js',")
 .replace("await renderClass('classroom'); window.ready=true;", "location.hash='/classes/classroom';await renderClass('classroom');window.ready=true;");
const run=`
fixture=fixture.replace(/export const getDocs = async[\\s\\S]*?export const updateDoc =/, \`const links=new Map([
 ['one',{lessonId:'one',order:1,mode:'assessment',learningPathAssignmentId:'path',learningPathTitle:'Reading path'}],
 ['two__practice',{lessonId:'two',order:2,mode:'practice',learningPathAssignmentId:'path',learningPathTitle:'Reading path'}],
 ['three',{lessonId:'three',order:3,mode:'assessment'}]
]);const paths=new Map([['path',{title:'Reading path',lessonIds:['one','two'],mode:'assessment'}]]),saved=new Map();
window.links=links;window.paths=paths;window.progress={one:{score:8}};
export const getDocs=async c=>({docs:[...(c.endsWith('/classLessons')?links:c.endsWith('/learningPaths')?paths:new Map())].map(([id,data])=>({id,data:()=>structuredClone(data)}))});
export const updateDoc =\`);
fixture=fixture.replace('export const postToApi = async () => {};',\`export const postToApi=async(url,body)=>{
 if(window.failArchive)throw Error('Synthetic archive failure');
 window.requests=[...(window.requests||[]),body];
 if(body.action==='restore-class-path'){for(const [id,link] of saved)if(link.learningPathAssignmentId===body.assignmentId){links.set(id,link);saved.delete(id);}paths.get(body.assignmentId).archived=false;}
 else {for(const [id,link] of links)if(body.assignmentId?link.learningPathAssignmentId===body.assignmentId:id===body.linkId){saved.set(id,link);links.delete(id);}if(body.assignmentId)paths.get(body.assignmentId).archived=true;}
};\`);
fixture+='export const loadClassContext=async()=>({students:[],lessons:[]}),loadStudentProgress=async()=>({}),completionOf=()=>({percent:0});state.profile={role:"teacher"};';
(async()=>{
 await fs.mkdir(artifacts,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}}),base='http://127.0.0.1:'+server.address().port,errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 await p.goto(base+'/teacher/preview.html');await p.waitForFunction(()=>window.ready);
 assert.equal(await p.locator('[data-unlink]').count(),0);assert.equal(await p.locator('[data-archive-lesson]').count(),3);
 assert.equal(await p.locator('#add-lesson').getAttribute('aria-label'),'Add Lesson Path');
 await p.locator('[data-archive-lesson="three"]').click();await p.locator('.action-confirmation').getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await p.locator('[data-archive-lesson="three"]').count(),1);
 await p.locator('[data-archive-lesson="three"]').click();await p.locator('.action-confirmation').getByRole('button',{name:'Archive lesson',exact:true}).click();
 await p.locator('[data-archive-lesson="three"]').waitFor({state:'detached'});
 assert.match(await p.locator('.class-path-archive summary').innerText(),/\\(0\\)/);
 assert.doesNotMatch(await p.locator('.class-path-archive').innerText(),/Pagbasa at pag-unawa/);
 await p.evaluate(()=>window.failArchive=true);
 await p.locator('[data-archive-path="path"]').click();await p.locator('.action-confirmation').getByRole('button',{name:'Archive lesson path',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Synthetic archive failure'));
 assert.equal(await p.locator('[data-archive-lesson]').count(),2);await p.evaluate(()=>window.failArchive=false);
 await p.locator('[data-archive-path="path"]').click();await p.locator('.action-confirmation').getByRole('button',{name:'Archive lesson path',exact:true}).click();
 await p.locator('[data-archive-path="path"]').waitFor({state:'detached'});
 assert.equal(await p.locator('[data-archive-lesson]').count(),0);
 await p.locator('.class-path-archive summary').click();assert.match(await p.locator('.class-path-archive').innerText(),/Reading path/);
 for(const width of [1440,390])for(const theme of ['light','dark']){
  await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:path.join(artifacts,'class-archive-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await p.locator('[data-restore-path="path"]').click();await p.locator('.action-confirmation').getByRole('button',{name:'Restore lesson path',exact:true}).click();
 await p.locator('[data-archive-path="path"]').waitFor();assert.equal(await p.locator('[data-archive-lesson]').count(),2);
 assert.deepEqual(await p.evaluate(()=>progress),{one:{score:8}});assert.equal(await p.evaluate(()=>links.has('three')),false);
 assert.deepEqual(errors,[]);console.log('PASS: real classroom Archive actions, cancel/failure handling, path-only archive, whole-path restore, retained progress, Add Lesson Path controls, 4 responsive theme layouts and no browser errors.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});`;
new Function('require','__dirname',harness+run)(require,__dirname);
