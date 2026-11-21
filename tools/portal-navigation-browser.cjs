// Real routers and view renderers, delayed synthetic reads. No production requests or writes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'audit/portal-navigation');
const sources = new Set([
  'admin/router.js', 'teacher/router.js',
  ...['teachers','students','classes','lessons','dashboard','account'].map(name=>'admin/views/'+name+'.js'),
  ...['dashboard','landing','students','classPage','addLesson','messages','dictionary','classReport','studentProgress','accountSettings','fluencyReview'].map(name=>'teacher/views/'+name+'.js'),
  ...['helpers','teacherTitle','teacher-name','route-lifecycle','workspace-dashboard','scoring','pagination','password-rules','field-errors','floatingTooltip','theme-buttons','theme','readingSubmissions','handbook','handbookHelp'].map(name=>'js/'+name+'.js'),
]);
const names = new Set();
function rewrite(source, filename) {
  return source.replace(/import\s*{([\s\S]*?)}\s*from\s*["']([^"']+)["'];/g, (whole, bindings, specifier) => {
    const local = specifier.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(filename), specifier.split('?')[0])) : '';
    if (sources.has(local)) return whole;
    for(const binding of bindings.split(',').map(value=>value.trim()).filter(Boolean))names.add(binding.split(/\s+as\s+/)[0]);
    return `import {${bindings}} from '/fixture.mjs';`;
  });
}
let fixture, browser;
const server = http.createServer(async(req,res)=>{
  try {
    const filename = new URL(req.url,'http://fixture').pathname.slice(1);
    let body, type = 'text/javascript';
    if(filename === 'fixture.mjs' || filename === 'js/state.js')body=fixture;
    else if(/^(admin|teacher)\/preview.html$/.test(filename)){
      const role=filename.split('/')[0];
      body=(await fs.readFile(path.join(root,role+'/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,tag=>/type="module"/.test(tag)?'':tag).replace('</body>',`<script type="module">
        import {renderRoute} from '/${role}/router.js';
        window.renderRoute=renderRoute;
        document.querySelector('#loading-screen').hidden=true;
        window.addEventListener('hashchange',()=>{void renderRoute()});
        await renderRoute();window.ready=true;
      </script></body>`);
      type='text/html';
    } else {
      const target=path.resolve(root,filename);if(!target.startsWith(root+path.sep)||filename.split('/').some(part=>part.startsWith('.')))throw Error('path');
      body=await fs.readFile(target);
      if(sources.has(filename))body=rewrite(body.toString(),filename);
      type={'.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(filename)]||type;
    }
    res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
  }catch(error){res.writeHead(404);res.end(error.message)}
});
(async()=>{
  for(const file of sources)rewrite(await fs.readFile(path.join(root,file),'utf8'),file);
  const special={
    state:`{user:{uid:'fixture',email:'teacher@school.edu'},profile:{role:document.body.dataset.portal,displayName:'Maria Reyes'},classes:[],lessons:[],allLessons:[],allClasses:[],teachers:[]}`,
    db:'{}',auth:`{currentUser:{uid:'fixture',email:'teacher@school.edu',providerData:[{providerId:'password'}]}}`,
    getAllTeachers:`async()=>{const phase=window.phase;await gate('teachers');state.teachers=[{id:'teacher',displayName:phase==='old'?'Old teacher':'Current teacher',email:'teacher@school.edu',emailVerificationRequired:true,mustChangePassword:false}]}`,
    getAllClasses:`async()=>{await gate('classes');state.allClasses=[]}`,
    getAllLessons:`async()=>{await gate('lessons');state.allLessons=[]}`,
    getTeacherClasses:`async()=>{await gate('teacher-classes');state.classes=[]}`,
    getTeacherLessons:`async()=>{await gate('teacher-lessons');state.lessons=[]}`,
    getDocs:`async()=>{await gate('getDocs');return{docs:[]}}`,
    getDoc:`async()=>{await gate('getDoc');return{exists:()=>true,id:'class-a',data:()=>({teacherId:'fixture',className:'Synthetic class',classCode:'TEST01'})}}`,
    getCountFromServer:`async()=>({data:()=>({count:0})})`,
    updateDoc:`async()=>{await gate('profile-save')}`,
    collection:'(...parts)=>parts',doc:'(...parts)=>parts',where:'(...parts)=>parts',query:'(...parts)=>parts',
    postToApi:`async(_path,body)=>{await gate(body.action==='statuses'?'statuses':'api');return body.action==='statuses'?{users:window.status==='unavailable'?[]:[{uid:'teacher',emailVerified:window.status!=='pending'}]}:body.operation==='fluency-list'?{submissions:[]}:{available:false}}`,
    allWords:`async()=>{await gate('dictionary');return[]}`,
    normalizeWord:`word=>String(word).toLowerCase()`,
    loadClassContext:`async()=>{await gate('context');return{classroom:{id:'class-a',className:'Synthetic class'},lessons:[],students:window.withStudent?[{id:'student-a',fullName:'Synthetic student'}]:[]}}`,
    loadStudentProgress:`async()=>{await gate('progress');return{}}`,
    readingRoster:`async()=>{await gate('roster');return{students:[],lessonLinks:[],className:'Synthetic class'}}`,
    onChatSummaries:'()=>{}',watchState:'()=>()=>{}',
    watchDashboardNotifications:'()=>{}',hasUnreadChat:'()=>false',
    titleLabel:`title=>title==='maam'?"Ma'am":title==='sir'?'Sir':''`,
    teacherName:'name=>name',TEACHER_TITLES:`{maam:"Ma'am",sir:'Sir'}`,
    DIFFICULTY_LABELS:'{}',LABELS:'{}',STUDENT_MAX:'240',TEACHER_MAX:'1000',TEACHER_COOLDOWN_MS:'1000',
    EmailAuthProvider:'{credential:()=>({})}',Timestamp:'{fromDate:value=>value}',
  };
  fixture=`window.pending=[];window.hold=[];window.phase='new';window.status='verified';
    export function gate(name){if(!window.hold.includes(name))return Promise.resolve();return new Promise((resolve,reject)=>window.pending.push({name,resolve,reject}))}
    window.release=(reject=false)=>{const pending=window.pending.splice(0);for(const request of pending)reject?request.reject(Error('Synthetic late failure')):request.resolve()};
  `+Object.entries(special).map(([key,value])=>`export const ${key}=${value};`).join('\n');
  for(const name of names)if(!(name in special))fixture+=`\nexport const ${name}=(...args)=>{};`;
  await fs.mkdir(out,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const base='http://127.0.0.1:'+server.address().port;
  const heading=()=>page.locator('#page-header h1').textContent();
  const navigate=async(route)=>{
    const matching=page.locator('a[data-nav][href="#'+route+'"]');
    if(await matching.count())await matching.click();
    else await page.evaluate(route=>{location.hash=route},route);
  };
  const settle=async(title)=>{await page.waitForFunction(title=>document.querySelector('#page-header h1')?.textContent===title&&!document.querySelector('#page-content').hasAttribute('aria-busy'),title)};
  async function race(route,reads,lateFailure=false,returnToSame=false){
    if(await page.evaluate(route=>location.hash==='#'+route,route)){await navigate('/settings');await settle('Account settings')}
    await page.evaluate(reads=>{window.hold=reads;window.phase='old'},reads);
    await navigate(route);await page.waitForFunction(()=>window.pending.length>0);
    await page.evaluate(()=>{window.hold=[];window.phase='new'});
    await navigate('/dashboard');await settle('Dashboard');
    if(returnToSame){await navigate(route);await settle('Teacher accounts');assert.match(await page.locator('.teacher-table__name').textContent(),/Current teacher/)}
    const expected=await heading();
    await page.evaluate(fail=>window.release(fail),lateFailure);
    // A frame after all released microtasks catches old HTML, redirects, and router error screens.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await heading(),expected,route+' overwrote the latest selection');
    assert.equal(await page.locator('[data-nav].active').getAttribute('data-nav'),returnToSame?'teachers':'dashboard');
    if(returnToSame)assert.match(await page.locator('.teacher-table__name').textContent(),/Current teacher/);
    console.log(`PASS delayed ${route}${lateFailure?' failure':''}${returnToSame?' leave-and-return':''}`);
  }
  for(const role of ['admin','teacher']){
    await page.goto(base+'/'+role+'/preview.html#/dashboard');await settle('Dashboard');
    const tests=role==='admin'
      ?[['/teachers',['teachers']],['/teachers',['statuses']],['/students',['getDocs']],['/classes',['classes']],['/lessons',['lessons']],['/dictionary',['dictionary']]]
      :[['/classes',['teacher-classes']],['/messages',['teacher-classes']],['/dictionary',['dictionary']],['/classes/class-a',['teacher-lessons']],['/classes/class-a',['getDoc']],['/classes/class-a',['getDocs']],['/classes/class-a/students',['getDoc']],['/classes/class-a/students',['getDocs']],['/classes/class-a/add-lesson',['getDoc']],['/classes/class-a/add-lesson',['getDocs']],['/classes/class-a/report',['context']],['/classes/class-a/students/student-a',['context']],['/classes/class-a/readings',['api']]];
    for(const [route,reads] of tests)await race(route,reads);
    await race(tests[0][0],tests[0][1],true);
    if(role==='teacher'){
      await page.evaluate(()=>window.withStudent=true);
      await race('/classes/class-a/report',['progress']);
      await race('/classes/class-a/students/student-a',['progress']);
      await page.evaluate(()=>window.withStudent=false);
    }
    if(role==='admin'){
      await race('/teachers',['teachers'],false,true);
      await race('/teachers',['statuses'],true);
      for(const status of ['verified','pending','unavailable']){
        await page.evaluate(status=>window.status=status,status);await navigate('/settings');await settle('Account settings');await navigate('/teachers');await settle('Teacher accounts');
        for(const theme of ['light','dark']){
          await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
          await page.locator('.teacher-table__email').screenshot({path:path.join(out,`${status}-${theme}.png`)});
        }
      }
    }
    for(const [route,title] of [['/dashboard','Dashboard'],['/dictionary','Dictionary'],['/handbook','AI Handbook'],['/settings','Account settings']]){await navigate(route);await settle(title)}
    if(role==='teacher'){
      await page.locator('#account-profile-form [name=displayName]').fill('Updated teacher');
      await page.evaluate(()=>window.hold=['profile-save']);
      await page.locator('#account-profile-form [type=submit]').click();
      await page.waitForFunction(()=>window.pending.some(request=>request.name==='profile-save'));
      await page.evaluate(()=>window.hold=[]);await navigate('/dashboard');await settle('Dashboard');
      await page.evaluate(()=>window.release());
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
      assert.equal(await heading(),'Dashboard','Saving an old profile must not reopen Settings');
      console.log('PASS profile save finishing after sidebar navigation');
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS both real portal routers: late reads, late errors, same-route return, nested routes, sidebar selection, and status icons.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
