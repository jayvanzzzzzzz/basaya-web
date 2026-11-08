// Isolated UI regression preview: actual class renderer, helpers, schedule and theme modules.
// Firebase and navigation dependencies are replaced only in this test server.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const auditText = require('./text-readability-audit.cjs');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'audit/class-design');
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
 {id:'one',data:()=>({lessonId:'one',order:1,mode:'assessment',dueAt:date(3),notifyPending:true})},
 {id:'two__practice',data:()=>({lessonId:'two',order:2,mode:'practice',openAt:date(2)})},
 {id:'three',data:()=>({lessonId:'three',order:3,mode:'assessment',dueAt:date(-1)})}
]) : [{data:()=>({classId:'classroom',percent:65})}])});
export const updateDoc = async () => {window.writes=(window.writes||0)+1};
export const deleteDoc = updateDoc;
export const writeBatch = () => ({set(){},delete(){},commit:updateDoc});
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
const stubbed = ['js/state.js','js/firebase.js','js/api.js','teacher/views/dashboard.js','teacher/views/messages.js','teacher/views/studentRequestsBadge.js','teacher/views/classDeletion.js'];
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
  await fs.mkdir(artifacts,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light',permissions:['clipboard-read','clipboard-write']});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url=`http://127.0.0.1:${server.address().port}/teacher/preview.html`;
    await page.goto(url);await page.waitForFunction(()=>window.ready);
    await page.evaluate(()=>document.fonts.ready);
    for(const mode of ['light','dark']) {
      if(await page.evaluate(()=>document.documentElement.dataset.theme)!==mode) await page.locator('[data-theme-toggle]').click();
      await page.waitForTimeout(800);
      for(const [name,width] of [['desktop',1440],['laptop',1100],['tablet',768],['mobile',390],['small-mobile',320]]) {
        await page.setViewportSize({width,height:1000});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${mode} ${name}: viewport overflow`);
        for (const selector of ['.class-lessons','.class-overview','.class-lesson__content']) {
          for(const element of await page.locator(selector).all()) assert.ok(await element.evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${mode} ${name}: ${selector} overflow`);
        }
        await page.screenshot({path:path.join(artifacts,`${name}-${mode}.png`),fullPage:true});
        assert.deepEqual(await auditText(page),[],`${mode} ${name}: readability`);
      }
      await page.setViewportSize({width:1440,height:1000});
      await page.mouse.move(0,0);
      for (const [name,width] of [['desktop',1440],['mobile',320]]) {
        await page.setViewportSize({width,height:1000});
        for(const state of ['pending','deadline','error']) {
          await page.evaluate(state=>{
            const notice=document.querySelector('[data-grading-notice]');
            notice.hidden=false; notice.classList.toggle('has-deadline',state==='deadline');
            const heading=notice.querySelector('[data-grading-total]');heading.hidden=state==='error';heading.textContent='1 reading needs to be graded';
            const count=notice.querySelector('[data-grading-count]');count.hidden=state==='error';count.textContent=state==='error'?'':'1';
            const deadline=notice.querySelector('[data-grading-deadline]');deadline.hidden=state!=='deadline';deadline.textContent='1 ungraded reading is due within 24 hours';
            notice.querySelector('[data-grading-error]').hidden=state!=='error';
          },state);
          assert.ok(await page.locator('[data-grading-notice]').evaluate(el=>el.scrollWidth<=el.clientWidth));
          await page.screenshot({path:path.join(artifacts,`review-notice-${name}-${mode}-${state}.png`),fullPage:true});
        }
      }
      await page.evaluate(()=>document.querySelector('[data-grading-notice]').hidden=true);
      await page.setViewportSize({width:1440,height:1000});
      // Realtime notification badges must not shift the centered action icon.
      for (const selector of ['#view-students','#class-chat','.teacher-class-actions a']) {
        const result=await page.locator(selector).evaluate(button=>{
          const badge=button.querySelector('[data-student-requests-dot], [data-class-chat-badge], [data-reading-notice-dot]');
          const icon=button.querySelector('svg');
          const previous=badge.hidden;
          badge.hidden=true; const before=icon.getBoundingClientRect();
          badge.hidden=false; const after=icon.getBoundingClientRect();
          const dot=badge.getBoundingClientRect(), box=button.getBoundingClientRect();
          badge.hidden=previous;
          return {stable:before.x===after.x&&before.y===after.y,inside:dot.top>=box.top&&dot.right<=box.right&&dot.bottom<=box.bottom&&dot.left>=box.left,animation:getComputedStyle(badge).animationName};
        });
        assert.ok(result.stable, selector+' badge shifted the icon');
        assert.ok(result.inside, selector+' badge must stay inside the upper-right corner');
        assert.equal(result.animation,'class-notification-pulse');
      }
      for (const selector of ['#class-report','#class-chat','#view-students','#add-lesson','#add-lesson-inline']) {
        const control=page.locator(selector);
        assert.equal(await control.locator('svg').count(),1);
        assert.ok(await control.getAttribute('aria-label'));
        assert.equal(await control.evaluate(el=>[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('')),'');
        await control.hover();
        await page.waitForFunction(label=>document.querySelector('.floating-tooltip:not([hidden])')?.textContent===label,await control.getAttribute('aria-label'));
      }
      await page.mouse.move(0,0);
      const schedule=page.locator('[data-schedule]').first();
      await schedule.focus();await page.locator('.floating-tooltip:visible').waitFor();
      assert.match(await page.locator('.floating-tooltip:visible').textContent(),/Edit schedule/);
      assert.deepEqual(await auditText(page),[],`${mode}: focused tooltip readability`);
      assert.ok(await page.locator('.floating-tooltip:visible').evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth}));
      await page.keyboard.press('Escape');assert.equal(await page.locator('.floating-tooltip:visible').count(),0);
      await schedule.hover();await page.locator('.floating-tooltip:visible').waitFor();
      assert.equal(await page.locator('.floating-tooltip:visible').evaluate(el=>getComputedStyle(el).animationDuration),'0.16s');
      await schedule.click();await page.locator('[role="dialog"]').waitFor();
      assert.ok(await page.locator('[role="dialog"]').getAttribute('aria-labelledby'));
      await page.waitForTimeout(250);
      assert.deepEqual(await auditText(page),[],`${mode} dialog: readability`);
      await page.screenshot({path:path.join(artifacts,`schedule-dialog-${mode}.png`),fullPage:true});
      await page.setViewportSize({width:320,height:1000});
      assert.deepEqual(await auditText(page),[],`${mode} mobile dialog readability`);
      assert.ok(await page.locator('[role="dialog"]').evaluate(el=>el.scrollWidth<=el.clientWidth));
      await page.screenshot({path:path.join(artifacts,`schedule-dialog-mobile-${mode}.png`),fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
      await page.locator('.modal-close').focus();await page.keyboard.press('Shift+Tab');
      assert.ok(await page.locator('[role="dialog"]').evaluate(el=>el.contains(document.activeElement)));
      await page.keyboard.press('Escape');assert.equal(await page.locator('[role="dialog"]').count(),0);
      assert.ok(await schedule.evaluate(el=>el===document.activeElement));
      await page.locator('[data-lesson-tab="all"]').focus();await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('[data-lesson-tab="open"]').getAttribute('aria-selected'),'true');
      assert.equal(await page.locator('.class-lesson:visible').count(),2);
      await page.keyboard.press('End');assert.equal(await page.locator('.class-lesson:visible').count(),1);
      await page.keyboard.press('Home');assert.equal(await page.locator('.class-lesson:visible').count(),3);
      const menu=page.locator('.header-menu__toggle');await menu.click();
      await page.waitForFunction(()=>document.activeElement.id==='edit-class');
      await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#class-deletion').evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');
      await page.locator('.class-overview__code').focus();await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.querySelector('.code-stub__hint').textContent==='Copied!');
      assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'RZ7ABC');
      for(const [selector,route] of [['#class-report','/classes/classroom/report'],['#view-students','/classes/classroom/students'],['#class-chat','/messages/classroom'],['#add-lesson','/classes/classroom/add-lesson']]) {
        await page.locator(selector).click();assert.equal(await page.evaluate(()=>location.hash),'#'+route);
      }
      await page.setViewportSize({width:320,height:1000});
      const original=await page.locator('.class-lesson__content p').first().textContent();
      await page.locator('.class-lesson__content p').first().evaluate(el=>el.textContent='Read the complete lesson description: '+ 'MasayangPagbabasa'.repeat(12)+' and discuss the story together.');
      const spacing=await page.addStyleTag({content:'#page-header *, #page-content *, .site-footer * {line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important;} #page-content p {margin-bottom:2em !important;}'});
      assert.deepEqual(await auditText(page),[],`${mode}: full lesson descriptions and text spacing`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(artifacts,`long-text-mobile-${mode}.png`),fullPage:true});
      await spacing.evaluate(el=>el.remove());
      await page.locator('.class-lesson__content p').first().evaluate((el,original)=>el.textContent=original,original);
      await page.setViewportSize({width:1440,height:1000});
    }
    await page.reload();await page.waitForFunction(()=>window.ready);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('[data-class-chat-badge]').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.locator('[data-schedule]').first().hover();
    assert.equal(await page.locator('.floating-tooltip').evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.goto(url+'?empty');await page.waitForFunction(()=>window.ready);
    assert.equal(await page.locator('#add-lesson-empty').count(),1);
    await page.screenshot({path:path.join(artifacts,'empty-dark.png'),fullPage:true});
    await page.locator('#add-lesson-empty').click();assert.match(page.url(),/#\/classes\/classroom\/add-lesson$/);
    assert.deepEqual(errors,[]);
    console.log('PASS: both themes at 1440/1100/768/390/320px; theme persistence; hover/focus tooltips; viewport bounds; reduced motion; keyboard filters; menu focus; dialog focus trap/Escape; class-code keyboard copy; empty state and lesson navigation.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
