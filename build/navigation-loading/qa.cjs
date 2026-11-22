const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const helpers = `
import {skeleton} from '/js/page-loading.js';
export const state={user:{uid:'qa-user'},profile:{displayName:'QA Teacher'},classes:[],lessons:[]};
export const $=s=>document.querySelector(s),currentRoute=()=>location.hash.slice(1)||'/dashboard';
export const navigate=p=>location.hash=p,shell=()=>{},empty=()=>'<div role="alert">Unable to load <button id="retry">Retry</button></div>';
export function page(title){document.querySelector('#page-header').innerHTML='<h1>'+title+'</h1>'}
export const getTeacherClasses=async()=>{},getTeacherLessons=async()=>{},getAllLessons=async()=>{};
async function render(){
 const route=currentRoute();
 // Dashboards and dictionaries mount their local loading regions before fetching.
 if(route==='/dashboard'||route==='/dictionary')document.querySelector('#page-content').innerHTML=skeleton(route==='/dashboard'?'overview':'list');
 await new Promise(resolve=>window.requests.push({route,resolve}));
 if(window.failRoute===route)throw Error('Fixture request failed');
 if(currentRoute()!==route)return;
 page(route.slice(1));
 document.querySelector('#page-content').innerHTML='<section class="fixture-data"><h2>'+route.slice(1)+' result '+(++window.version)+'</h2><p>Classroom information from the latest request.</p><label>Find a class<input id="fixture-search" type="search" value="Grade 1"></label><button id="fixture-action">Open classroom</button></section>';
}
export {render};
`;
let browser;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    let file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    let body;
    if (url.pathname === '/fixture.js') body = helpers;
    else if (/^\/(teacher|admin)\/$/.test(url.pathname) || url.pathname === '/student/index.html') {
      if(!file.endsWith('.html')) file = path.join(file, 'index.html');
      body = (await fs.readFile(file, 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*href="https:[^>]*>/gi, '');
      if(url.pathname !== '/student/index.html') body += `<script type="module">
      import {state} from '/fixture.js';import {renderRoute} from './router.js';
      window.state=state;window.renderRoute=renderRoute;window.requests=[];window.version=0;
      document.querySelector('#loading-screen').hidden=true;document.querySelector('#app-view').hidden=false;
      window.ready=true;
      </script>`;
    } else {
      body = await fs.readFile(file);
      if (/\/(teacher|admin)\/router.js$/.test(url.pathname)) {
        body = body.toString().replace(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/g, (all, names, source) => {
          if (source.endsWith('/page-loading.js') || source.endsWith('/route-lifecycle.js')) return all;
          if (source.endsWith('/helpers.js') || source.endsWith('/state.js')) return `import {${names}} from '/fixture.js';`;
          return names.split(',').map(n => n.trim()).filter(Boolean).map(n => n.startsWith('render') ? `import {render as ${n}} from '/fixture.js';` : `const ${n}=()=>{};`).join('\n');
        });
      }
    }
    const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript';
    res.writeHead(200, {'Content-Type':type});res.end(body);
  } catch (e) { res.writeHead(404).end(String(e)); }
});
(async()=>{
  await fs.mkdir(path.join(root,'audit/navigation-loading'),{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  for(const portal of process.argv.includes('--admin')?['admin']:['teacher','admin']){
    const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'no-preference'});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    const secondary=portal==='teacher'?'/dictionary':'/students';
    const base=`http://127.0.0.1:${server.address().port}/${portal}/`;
    const go=async route=>{await page.evaluate(route=>{location.hash=route;window.flight=window.renderRoute()},route);await page.waitForFunction(()=>window.requests.length>0)};
    const release=async()=>{await page.evaluate(()=>window.requests.shift().resolve());await page.evaluate(()=>window.flight)};
    await page.goto(base);await page.waitForFunction(()=>window.ready);await page.waitForTimeout(400);
    await go('/classes');
    assert.equal(await page.locator('#page-header h1').textContent(),portal==='teacher'?'Your classrooms':'All classes');
    assert.equal(await page.locator('#page-content .page-skeleton').count(),1);
    assert.equal(await page.locator('#page-content').getAttribute('aria-busy'),'true');
    for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.waitForTimeout(220);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${portal} ${theme} ${width} overflow`);
      assert.equal(await page.locator('.page-skeleton__line').first().evaluate(el=>getComputedStyle(el).animationName),'none');
      await page.screenshot({path:path.join(root,`audit/navigation-loading/${portal}-${theme}-${width}.png`)});
    }
    await release();assert.equal(await page.locator('#page-content').getAttribute('aria-busy'),null);
    assert.equal(await page.locator('.fixture-data').evaluate(el=>getComputedStyle(el).animationName),'none');
    const loadedTop=await page.locator('.fixture-data').evaluate(el=>el.getBoundingClientRect().top);
    await go(secondary);await release();await go('/classes');
    assert.equal(await page.locator('.page-refresh-preview').count(),1);
    assert.match(await page.locator('.page-refresh-preview').textContent(),/classes result 1/);
    assert.equal(await page.locator('.page-refresh-preview [id]').count(),0);
    assert.equal(await page.locator('.page-refresh-preview [inert]').count(),1);
    assert.equal(await page.locator('.page-refresh-preview input').count(),1,'Preview retains toolbar geometry');
    assert.equal(await page.locator('.page-refresh-preview .fixture-data').evaluate(el=>el.getBoundingClientRect().top),loadedTop,'Progress rail must not shift the preview');
    assert.equal(await page.locator('.page-refresh-preview .fixture-data').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.screenshot({path:path.join(root,`audit/navigation-loading/${portal}-cached-dark.png`)});
    await release();assert.equal(await page.locator('.page-refresh-preview').count(),0);
    assert.match(await page.locator('#page-content').textContent(),/classes result 3/);
    // A late completion must not reveal or replace the new route's loading state.
    await go(portal==='teacher'?'/messages':'/lessons');await go(portal==='teacher'?'/settings':'/teachers');
    await page.evaluate(()=>window.requests.shift().resolve());
    assert.equal(await page.locator('#page-content').getAttribute('aria-busy'),'true');
    await release();assert.match(await page.locator('#page-content').textContent(),portal==='teacher'?/settings result/:/teachers result/);
    // Failure removes the passive preview and restores a working retry control.
    await go(secondary);await page.evaluate(route=>window.failRoute=route,secondary);await release();
    assert.equal(await page.locator('.page-refresh-preview').count(),0);
    assert.equal(await page.locator('#page-content').isVisible(),true);
    assert.equal(await page.locator('#retry').count(),1);
    await page.evaluate(()=>window.failRoute=null);await page.locator('#retry').click();await page.waitForFunction(()=>window.requests.length>0);await release();
    // No cached classroom information crosses account boundaries.
    await page.evaluate(()=>window.state.user.uid='another-user');await go('/classes');
    assert.equal(await page.locator('.page-refresh-preview').count(),0);await release();
    // Existing theme controls still save the choice across reload/navigation.
    await page.evaluate(async()=>{await import('/js/theme.js')});
    const toggle=page.locator('[data-theme-toggle]').first();
    if(await toggle.count()){await toggle.click({force:true});assert.ok(await page.evaluate(()=>['light','dark'].includes(localStorage.getItem('basaya-theme'))));}
    await page.evaluate(()=>{
      document.querySelector('#page-content').innerHTML='<div class="workspace-overview"><div class="overview-welcome">Welcome</div><div class="overview-stats">Counts</div><div class="overview-layout">Classes</div></div><div class="stagger-in"><article>Class</article></div>';
    });
    for(const selector of ['.workspace-overview','.overview-welcome','.overview-stats','.overview-layout','.stagger-in>article']){
      const style=await page.locator(selector).evaluate(el=>({animation:getComputedStyle(el).animationName,opacity:getComputedStyle(el).opacity}));
      assert.equal(style.animation,'none',portal+' '+selector+' must not replay entrances');assert.equal(style.opacity,'1');
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS ${portal}: headings, delayed fetching, cached return, latest response, retry, account isolation; both themes at 4 widths`);
    const variants=portal==='teacher'?['teacher-classes','teacher-overview','dictionary','classroom','inbox','roster']:['admin-teachers','admin-students','admin-classes','admin-lessons','admin-overview'];
    for(const kind of variants)for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:1000});
      await page.evaluate(async({kind,theme})=>{
        const {skeleton}=await import('/js/page-loading.js');
        document.documentElement.dataset.theme=theme;
        document.querySelector('#page-content').innerHTML=kind.endsWith('overview')?'<div class="workspace-overview">'+skeleton(kind)+'</div>':skeleton(kind);
      },{kind,theme});
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.page-skeleton__shapes')).visibility==='visible');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' '+theme+' '+width+' must fit');
      if(width===1440||width===390)await page.screenshot({path:path.join(root,`audit/navigation-loading/${kind}-${theme}-${width}.png`)});
    }
    console.log('PASS '+portal+' page-shaped variants at 4 widths in both themes');
    await context.close();
  }
  // Student skeletons use the same stylesheet and keep semantic list markup.
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});
  await page.goto(`http://127.0.0.1:${server.address().port}/student/index.html`);
  await page.evaluate(async()=>{
    document.querySelector('#loading-screen').hidden=true;document.querySelector('#app-view').hidden=false;document.querySelector('#app-view').classList.add('is-student-hub');
    const {skeleton}=await import('/js/page-loading.js');
    document.querySelector('#page-content').innerHTML='<section class="st-home"><header class="st-hero"><h1>Mga Aralin</h1></header>'+skeleton('student-lessons',{label:'Inihahanda ang mga aralin'})+'</section>';
  });
  for(const theme of ['light','dark']){
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await page.screenshot({path:path.join(root,`audit/navigation-loading/student-${theme}.png`)});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  for(const kind of ['student-lessons','student-progress','student-dictionary','notifications','messages','reader','activity','quiz','game','pronunciation','lesson-steps'])for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(async({kind,theme})=>{
      const {skeleton}=await import('/js/page-loading.js');
      document.documentElement.dataset.theme=theme;
      const cls=kind==='student-lessons'?'st-home':kind==='student-progress'?'st-progress':kind==='student-dictionary'?'st-dict':kind==='notifications'?'st-notifs':'';
      document.querySelector('#page-content').innerHTML='<section class="'+cls+'">'+skeleton(kind)+'</section>';
    },{kind,theme});
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.page-skeleton__shapes')).visibility==='visible');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' '+theme+' '+width+' must fit');
    if(width===390)await page.screenshot({path:path.join(root,`audit/navigation-loading/${kind}-${theme}-${width}.png`)});
  }
  console.log('PASS student page-shaped variants at 4 widths in both themes');
  // Real entrance styles must not fade ready data back to zero opacity.
  await page.evaluate(()=>{
    const content=document.querySelector('#page-content');
    content.innerHTML='<div class="workspace-overview"><div class="overview-welcome">Welcome</div><div class="overview-stats">Counts</div><div class="overview-layout">Classes</div></div><section class="st-progress"><div class="st-skill">Skill</div></section><ul class="st-lessons"><li>Lesson</li></ul><div class="stagger-in"><article>Class</article></div>';
  });
  for(const selector of ['.workspace-overview','.overview-welcome','.overview-stats','.overview-layout','.st-skill','.st-lessons>li','.stagger-in>article']){
    const style=await page.locator(selector).evaluate(el=>({animation:getComputedStyle(el).animationName,opacity:getComputedStyle(el).opacity}));
    assert.equal(style.animation,'none',selector+' entrance must stay off');assert.equal(style.opacity,'1');
  }
  await page.evaluate(async()=>{
    const {skeleton}=await import('/js/page-loading.js');const content=document.querySelector('#page-content');
    content.innerHTML=skeleton();
    window.fastPlaceholderVisibility=getComputedStyle(content.querySelector('.page-skeleton__shapes')).visibility;
  });
  assert.equal(await page.evaluate(()=>window.fastPlaceholderVisibility),'hidden','Fast requests must not flash skeleton shapes');
  await page.waitForTimeout(190);
  assert.equal(await page.locator('.page-skeleton__shapes').evaluate(el=>getComputedStyle(el).visibility),'visible');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.page-skeleton__line').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  console.log('PASS student shared skeleton: light/dark mobile; no ready-content fades, delayed placeholder reveal, reduced motion');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close()});
