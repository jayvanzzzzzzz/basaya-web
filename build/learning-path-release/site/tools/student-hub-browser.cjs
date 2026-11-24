// Local-only visual/interaction QA. Real student views and CSS; synthetic records,
// isolated Firebase/chat adapters. Never signs in or writes to a live classroom.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const auditText = require('./text-readability-audit.cjs');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'audit/student-hub');
const fixture = `
import {resultsFrom, lessonParts} from '/js/scoring.js';
export const state={},db={},auth={currentUser:{email:'learner@example.test'}};
export const student={uid:'qa-student',email:'learner@example.test',profile:{firstName:'Mika',lastName:'Santos',gender:'Ayokong sabihin',dob:'2013-05-12',classId:'qa-class',className:'Filipino 7 · Sampaguita',progressSession:'qa'},lessons:[]};
const base={difficulty:'beginner',description:'Tuklasin ang mga salita, unawain ang kuwento, at subukan ang iyong natutuhan.',practice:false,contentVersion:1};
const lessons=[
 {...base,id:'continue',order:1,title:'Ang Alamat ng Pinya',lectureFinished:true,gameFinished:true,started:true},
 {...base,id:'new',order:2,title:'Mga Kuwento ng Ating Pamayanan',difficulty:'intermediate'},
 {...base,id:'done',order:3,title:'Ang Wika at Ako',lectureFinished:true,gameFinished:true,activityFinished:true,pronunciationFinished:true,quizFinished:true},
 {...base,id:'locked',order:4,title:'Paglalakbay sa Mundo ng Panitikan',dueAt:Date.now()-86400000},
 {...base,id:'practice',order:5,title:'Magsanay sa Pagbasa',practice:true}
];
const records=lessons.filter(x=>!x.practice).map((x,i)=>({...x,skills:i<3?{talasalitaan:{attempts:10,correct:8+i%2,items:10},pagkilala:{attempts:10,correct:5+i,items:10},pagbigkas:{attempts:10,correct:9,items:10,hardWords:['pamayanan','paglalakbay']},pagsusulit:{attempts:10,correct:7,items:10}}:{}}));
export const classId=()=>student.profile.classId;
export const fullName=(p=student.profile)=>[p.firstName,p.lastName].filter(Boolean).join(' ');
export const firstName=()=>student.profile.firstName;
export const loadProfile=async()=>student.profile;
export const loadClassLessons=async()=>{if(window.qaLoading)await new Promise(r=>window.finishLoading=r);student.lessons=window.qaEmpty?[]:lessons;return student.lessons};
export const loadClassProgressDocs=async()=>window.qaEmpty?[]:records;
export const scoredLessons=()=>student.lessons.filter(x=>!x.practice);
export const scoredResults=async docs=>resultsFrom(docs);
export const isComplete=x=>lessonParts(x).finished;
export const availability=x=>x.id==='locked'?'closed':'open';
export const canOpen=x=>availability(x)==='open'||isComplete(x);
export const formatWhen=x=>new Date(x).toLocaleDateString('fil-PH');
export const downloadLesson=async()=>{},downloadedLessons=async()=>[],removeLessonDownload=async()=>{};
export const listDownloads=async()=>[],removeDownload=async()=>{},updateDownloadMetadata=async()=>{};
export const refreshBell=async()=>{},logout=()=>window.qaLogout=true,refreshTopbar=()=>{};
let cleanup=[];export const onLeave=fn=>cleanup.push(fn);export const leave=()=>{cleanup.forEach(fn=>fn());cleanup=[]};
export const openJoin=()=>{location.hash='#/join'};
export const EmailAuthProvider={credential:()=>({})},reauthenticateWithCredential=async()=>{},updatePassword=async()=>{window.qaPasswordUpdated=true};
export const deleteField=()=>null,serverTimestamp=()=>0,doc=(...args)=>args.slice(1).join('/'),collection=doc;
export const getDoc=async()=>({exists:()=>true,get:k=>window.qaMembership==='pending'&&k==='leaveRequest'?{}:null,data:()=>({teacherId:'qa-teacher',firstName:'Ana',lastName:'Reyes'})});
export const getDocs=async()=>({docs:[]});
export const updateDoc=async(ref,fields)=>{if(window.qaSaveFail)throw Error('Synthetic offline state');(window.qaWrites??=[]).push({ref,fields})};
export const STUDENT_MAX=300,STUDENT_COOLDOWN_MS=5000;
export const rosterName=async()=>fullName(),loadClassTeacher=async()=>({id:'qa-teacher',title:'Ma’am'}),teacherName=(n,t)=>t+' '+n;
export const lastRead=()=>0,markRead=()=>{},joinText=n=>n+' ay sumali sa klase';
const now=Date.now();let rows=[
 {id:'teacher',senderId:'qa-teacher',senderName:'Reyes',role:'teacher',text:'Magandang araw! Ano ang natutuhan ninyo sa binasang kuwento?',sentAt:now-120000},
 {id:'peer',senderId:'qa-peer',senderName:'Alex Cruz',role:'student',text:'Mahalaga po ang pagtutulungan sa ating pamayanan.',sentAt:now-60000},
 {id:'mine',senderId:student.uid,senderName:fullName(),role:'student',text:'May tanong po ako tungkol sa mga bagong salita.',sentAt:now-30000}
];
let recentListener,stateListener,errorListener;
export const watchRecent=(id,cb,err)=>{recentListener=cb;errorListener=err;queueMicrotask(()=>cb(window.qaEmpty?[]:rows,true));return()=>{}};
export const watchState=(id,cb)=>{stateListener=cb;queueMicrotask(()=>cb({open:true,lastAt:now}));return()=>{}};
export const emitChat=open=>stateListener({open,lastAt:now});
export const failChat=()=>errorListener(Error('Synthetic offline chat'));
export const loadOlder=async()=>({messages:[{...rows[0],id:'older',text:'Maligayang pagdating sa ating klase!',sentAt:now-86400000}],more:false});
export const sendStudentMessage=async(id,uid,name,text)=>{if(window.qaSendFail)throw Error('Synthetic send failure');window.qaSent=text;rows.push({id:'sent',senderId:uid,senderName:name,role:'student',text,sentAt:Date.now()});recentListener(rows,false)};
export const canDeleteOwn=m=>m.senderId===student.uid&&!m.deleted;
export const deleteOwnMessage=async(id,m)=>{window.qaDeleted=m.id;rows=rows.map(x=>x.id===m.id?{...x,deleted:true,deletedBy:'sender'}:x);recentListener(rows,false)};
export const chatDelivery=()=>({isNew:()=>false,status:()=>'',note(){},drawn(){},stop(){}});
`;
const stubs = new Set(['js/state.js','js/firebase.js','js/chat.js','student/data.js','student/router.js','student/session.js','student/offlineStore.js','student/views/notifications.js','student/views/join.js']);
const boot = `
import {renderHome} from './views/home.js';import {renderProgress} from './views/progress.js';import {renderAccount} from './views/account.js';import {renderChat} from './views/chat.js';import * as qa from '/fixture.mjs';import '../js/theme.js';import '../js/password-toggle.js';
window.qa=qa;window.show=async(route)=>{qa.leave();window.ready=false;document.querySelector('#app-view').classList.toggle('is-chat',route==='chat');document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===route));await ({home:renderHome,progress:renderProgress,account:renderAccount,chat:renderChat})[route]();window.ready=true};
document.querySelector('#loading-screen').hidden=true;document.querySelector('#app-view').hidden=false;document.querySelector('#app-view').classList.add('is-student-hub');document.querySelector('#st-first-name').textContent='Mika';document.querySelector('#st-avatar').textContent='M';
document.documentElement.dataset.theme=localStorage.getItem('basaya-theme')||'light';await show('home');
`;
const server = http.createServer(async (req,res) => {
  try {
    const name = decodeURIComponent(new URL(req.url,'http://preview').pathname).slice(1);
    let body,type='text/javascript';
    if (name==='fixture.mjs') body=fixture;
    else if(name==='student/hub-preview.html') {
      body=(await fs.readFile(path.join(root,'student/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>', '<script type="module">'+boot+'</script></body>');type='text/html';
    } else {
      const target=path.resolve(root,name);
      if(!target.startsWith(root+path.sep)||name.split(/[\\/]/).some(x=>x.startsWith('.'))) throw Error('Invalid path');
      body=await fs.readFile(target);
      const ext=path.extname(name);type={'.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'}[ext]||type;
      if(ext==='.js') body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,(m,q,src)=>src.startsWith('https://www.gstatic.com/firebasejs/')||stubs.has(path.posix.normalize(path.posix.join(path.posix.dirname(name),src.split('?')[0])))?"from '/fixture.mjs'":m);
    }
    res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
  } catch(e) {res.writeHead(404);res.end(e.message);}
});
(async()=>{
  await fs.mkdir(artifacts,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/student/hub-preview.html');await page.waitForFunction(()=>window.ready);await page.evaluate(()=>document.fonts.ready);
    const checks=[];
    for(const route of ['home','progress','chat','account']) {
      await page.evaluate(r=>show(r),route);
      for(const theme of ['light','dark']) {
        await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
        for(const width of [1440,768,390,320]) {
          await page.setViewportSize({width,height:1000});await page.waitForTimeout(350);
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+'/'+theme+'/'+width+' overflow');
          if(route==='chat') {
            const composer=await page.locator('[data-composer]').boundingBox(), dock=await page.locator('.st-nav').boundingBox();
            assert.ok(composer.y+composer.height<=dock.y, 'Navigation must not cover the chat composer');
          }
          checks.push({route,theme,width,issues:await auditText(page)});
          await page.screenshot({path:path.join(artifacts,route+'-'+width+'-'+theme+'.png'),fullPage:true});
        }
      }
    }
    console.log('Visual matrix captured; readability issues:', checks.flatMap(x=>x.issues).length);
    for(const theme of ['light','dark']) {
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.setViewportSize({width:320,height:760});await page.evaluate(()=>show('account'));
      for(const [name,selector] of [['profile','#account-edit'],['password','#account-password'],['leave','[data-leave="ask"]'],['logout','#account-logout']]) {
        await page.locator(selector).click();await page.waitForTimeout(300);
        checks.push({route:'dialog-'+name,theme,width:320,issues:(await auditText(page)).filter(x=>!x.label.includes('site-footer'))});
        await page.screenshot({path:path.join(artifacts,'dialog-'+name+'-'+theme+'.png'),fullPage:true});
        await page.locator('.modal-close').click();
      }
    }
    await page.setViewportSize({width:390,height:1000});
    await page.evaluate(()=>show('home'));
    assert.equal(await page.locator('[data-lesson]').count(),5);
    await page.locator('#home-search').fill('Pinya');assert.equal(await page.locator('[data-lesson]').count(),1);
    await page.locator('#home-search').fill('no matching lesson');assert.ok(await page.locator('.st-empty').isVisible());
    await page.locator('#home-search').fill('');await page.locator('[data-tab="closed"]').click();assert.equal(await page.locator('[data-lesson]').count(),1);
    await page.locator('[data-lesson="locked"]').click();assert.ok(await page.locator('[role="dialog"]').isVisible());await page.locator('.modal-close').click();
    await page.locator('[data-tab="all"]').click();await page.locator('[data-status="progress"]').click();assert.equal(await page.locator('[data-lesson]').count(),1);
    await page.locator('[data-lesson="continue"]').click();assert.equal(await page.evaluate(()=>location.hash),'#/lesson/continue');
    await page.locator('#home-refresh').focus();assert.equal(await page.locator('#home-refresh').evaluate(e=>getComputedStyle(e,'::after').content),'"I-refresh"');
    await page.evaluate(()=>show('progress'));assert.equal(await page.locator('.st-skill').count(),5);assert.equal(await page.locator('.st-ring strong').innerText(),'1/4');
    await page.locator('.st-progress-continue').click();assert.equal(await page.evaluate(()=>location.hash),'#/home');
    await page.evaluate(()=>show('account'));await page.locator('#account-edit').click();await page.locator('[name="firstName"]').fill('');await page.locator('#edit-form [type="submit"]').click();assert.ok(await page.locator('.field-error:visible').count());
    await page.locator('[name="firstName"]').fill('Mika');await page.locator('#edit-form [type="submit"]').click();await page.waitForFunction(()=>window.qaWrites?.length===2);
    await page.locator('#account-password').click();await page.locator('#password-form [type="submit"]').click();assert.ok(await page.locator('.field-error:visible').count());
    await page.screenshot({path:path.join(artifacts,'password-validation-dark.png'),fullPage:true});await page.locator('[data-close]').click();
    await page.locator('[data-leave="ask"]').click();assert.ok(await page.locator('#leave-form').isVisible());await page.locator('[data-close]').click();
    await page.locator('#account-logout').click();await page.locator('.modal-close').click();assert.equal(await page.evaluate(()=>window.qaLogout),undefined);
    await page.evaluate(()=>show('chat'));await page.locator('[data-input]').fill('Salamat po!');await page.locator('[data-send]').click();assert.equal(await page.evaluate(()=>window.qaSent),'Salamat po!');assert.ok(await page.locator('[data-input]').isDisabled());
    await page.locator('[data-id="mine"]').hover();await page.locator('[data-message-actions="mine"]').click();await page.locator('.chat-message-menu [role="menuitem"]').click();await page.locator('[data-answer="primary"]').click();assert.equal(await page.evaluate(()=>window.qaDeleted),'mine');
    await page.evaluate(()=>qa.emitChat(false));assert.ok(await page.locator('[data-chat-closed]').isVisible());assert.ok(await page.locator('[data-input]').isDisabled());
    await page.screenshot({path:path.join(artifacts,'chat-closed-dark.png'),fullPage:true});
    await page.evaluate(()=>{qaEmpty=true;return show('chat')});assert.ok(await page.locator('.chat-empty').isVisible());
    await page.evaluate(()=>qa.failChat());assert.ok((await page.locator('.chat-empty').innerText()).includes('Hindi ma-load'));
    await page.evaluate(()=>{qa.student.profile.classId=null;return show('chat')});assert.ok(await page.locator('a[href="#/join"]').isVisible());
    for(const route of ['home','progress','account']) {await page.evaluate(r=>show(r),route);await page.screenshot({path:path.join(artifacts,route+'-empty-dark.png'),fullPage:true});}
    await page.evaluate(()=>{qaEmpty=false;qa.student.profile.classId='qa-class';qa.student.profile.className='Filipino 7 — Isang Napakahabang Pangalan ng Klase para sa Pagsubok';qa.student.profile.firstName='Isang Napakahabang Pangalan';return show('account')});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Long names wrap on phones');
    await page.screenshot({path:path.join(artifacts,'account-long-name-dark.png'),fullPage:true});
    await page.evaluate(()=>{qa.student.profile.classId='qa-class';qaMembership='pending';return show('account')});assert.ok(await page.locator('[data-leave="cancel"]').isVisible());
    await page.locator('[data-theme-toggle]').click();await page.waitForTimeout(800);const chosen=await page.evaluate(()=>document.documentElement.dataset.theme);assert.equal(await page.evaluate(()=>localStorage.getItem('basaya-theme')),chosen);await page.reload();await page.waitForFunction(()=>window.ready);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),chosen);
    await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>show('progress'));assert.equal(await page.locator('.st-skill').first().evaluate(e=>getComputedStyle(e).animationName),'none');
    assert.deepEqual(errors,[],'No runtime errors');
    console.log('PASS: lesson search/filter/locked/navigation, actual progress, profile validation/save, password validation, leave/logout dialogs, chat send/cooldown/delete/closed/empty/error, theme persistence, reduced motion.');
    await fs.writeFile(path.join(artifacts,'readability.json'),JSON.stringify(checks,null,2));
    assert.deepEqual(checks.flatMap(x=>x.issues),[],'Readability');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
