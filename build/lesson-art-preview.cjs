// Isolated UI regression preview: actual class renderer, helpers, schedule and theme modules.
// Firebase and navigation dependencies are replaced only in this test server.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const artifacts = process.env.BASAYA_QA_OUTPUT || path.join(root, 'audit/lesson-art');
const fixture = `
export const state = {user:{uid:'teacher'},allLessons:[
 {id:'one',title:'Ang ating pamayanan',description:'Pagyamanin ang pag-unawa sa mga kuwento ng ating komunidad.'},
 {id:'two',title:'Mga salita sa araw-araw',description:'Practice reading and build confidence with familiar Filipino words.'},
 {id:'three',title:'Pagbasa at pag-unawa',description:'Read, reflect, and share what you have learned.'}
]};
export const db = {};
export const Timestamp = {fromDate: d => ({toDate:()=>d,toMillis:()=>+d})};
const date = offset => Timestamp.fromDate(new Date(Date.now()+offset*86400000));
export const collection = (...args) => args.slice(1).join('/');
export const doc = (...args) => args.slice(1).join('/');
export const where = () => {};
export const query = c => c;
export const getDoc = async () => ({id:'classroom',exists:()=>true,data:()=>({teacherId:'teacher',className:'Grade 7 — Rizal',gradeLevel:'7',section:'Rizal',description:'Our shared space for Filipino language, stories, and discovery.',classCode:'RZ7ABC'})});
export const getDocs = async c => ({docs: (c.endsWith('/students') ? [{id:'student',data:()=>({displayName:'Preview student'})}] : c.endsWith('/classLessons') ? (location.search.includes('empty') ? [] : [
 {id:'one',data:()=>({lessonId:'one',order:1,mode:'assessment',openAt:date(-2),dueAt:date(3),notifyPending:true})},
 {id:'two__practice',data:()=>({lessonId:'two',order:2,mode:'practice',openAt:date(2)})},
 {id:'three',data:()=>({lessonId:'three',order:3,mode:'assessment',dueAt:date(-1)})}
]) : [{data:()=>({classId:'classroom',percent:65})}])});
export const updateDoc = async (path, values) => {window.writes=(window.writes||0)+1;window.savedSchedule=values;};
export const deleteDoc = updateDoc;
export const writeBatch = () => ({set(){},delete(){},commit:updateDoc});
export const loadClassContext=async()=>null,loadStudentProgress=async()=>({}),completionOf=()=>({});
export const postToApi = async () => {};
export const removeClassLesson = async () => {};
export const openClassModal = () => {};
export const hasUnreadChat = () => true;
export const onChatSummaries = () => {};
export const watchStudentRequestsBadge = () => {};
export const confirmCancelRequest = () => {};
export const deletionBanner = () => '';
export const openRequestDeletionModal = () => {};
export const wireDeletionBanner = () => {};
`;
const stubbed = ['js/state.js','js/firebase.js','js/api.js','teacher/views/dashboard.js','teacher/views/messages.js','teacher/views/studentRequestsBadge.js','teacher/views/classDeletion.js','teacher/views/progressData.js'];
const server = http.createServer(async (req,res) => {
  try {
    const name = decodeURIComponent(new URL(req.url,'http://preview').pathname).slice(1);
    let body, type='text/javascript';
    if (name === 'fixture.mjs') body=fixture;
    else if(name === 'teacher/preview.html') {
      const app=await fs.readFile(path.join(root,'teacher/app.js'),'utf8');
      const copy=app.slice(app.indexOf('// Class-code copy-to-clipboard'),app.indexOf('$("#logout-button")'));
      body=(await fs.readFile(path.join(root,'teacher/index.html'),'utf8'))
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/type="module"/.test(s)?'':s)
        .replace('</body>',`<script type="module">
        import {renderClass} from './views/classPage.js';
        import {toast} from '../js/helpers.js';
        import '../js/theme.js';
        ${copy}
        document.querySelector('#loading-screen').hidden=true;
        document.querySelector('#app-view').hidden=false;
        document.querySelector('[data-nav="classes"]').classList.add('active');
        await renderClass('classroom'); window.ready=true;
        </script></body>`);
      type='text/html';
    } else {
      const target=path.resolve(root,name);
      if(!target.startsWith(root+path.sep)||name.split(/[\\/]/).some(p=>p.startsWith('.'))) throw Error('Invalid path');
      body=await fs.readFile(target);
      const ext=path.extname(name);
      type={'.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'}[ext]||type;
      if(ext==='.js') body=body.toString().replace(/from\s+(["'])([^"']+)\1/g,(match,q,source)=>{
        const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),source));
        return source.startsWith('https://www.gstatic.com/firebasejs/')||stubbed.includes(resolved)?`from '/fixture.mjs'`:match;
      });
    }
    res.writeHead(200,{'Content-Type':type+';charset=utf-8'});res.end(body);
  } catch(e) {res.writeHead(404);res.end(e.message);}
});

(async()=>{
 await fs.mkdir(artifacts,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',error=>console.error(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/teacher/preview.html#/classes/classroom');await page.waitForFunction(()=>window.ready);
  for(const theme of ['light','dark'])for(const width of [1440,390,320]) {
   await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('basaya-theme',theme);},theme);await page.setViewportSize({width,height:1000});
   await page.locator('.class-lessons').scrollIntoViewIfNeeded();
   console.log(JSON.stringify(await page.evaluate(()=>({theme:document.documentElement.dataset.theme,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,tiles:document.querySelectorAll('.class-lesson__art').length,background:getComputedStyle(document.querySelector('.class-lesson__art')).backgroundColor,ink:getComputedStyle(document.querySelector('.class-lesson__art')).color}))));
   await page.screenshot({path:path.join(artifacts,'lessons-'+theme+'-'+width+'.png'),fullPage:true});
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
