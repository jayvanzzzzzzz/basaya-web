// Isolated regression checks: real teacher renderer, chat data layer, members dialog,
// helpers, theme, and tooltips. Only Firebase transport/state/API are replaced locally.
// Test records never reach Firebase or ship in the application.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const auditText = require('./text-readability-audit.cjs');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'audit/messages-design');
const fixture = `
export const db = {};
export const state = {user:{uid:'teacher',email:'teacher@example.test'},profile:{displayName:'Ana Reyes'},classes:[]};
const classes=[{id:'rizal',className:'Grade 7 — Rizal'},{id:'mabini',className:'Grade 8 — Mabini'},{id:'bonifacio',className:'Filipino — Bonifacio'}];
export const getTeacherClasses = async () => {if(window.chatTest?.classDelay)await new Promise(resolve=>setTimeout(resolve,window.chatTest.classDelay));state.classes=location.search.includes('no-classes')?[]:classes;return state.classes;};
const docs=new Map(), listeners=new Set(); let sequence=0;
const stamp = n => ({toMillis:()=>n});
const ref=(parent,...parts)=>({path:[parent.path,...parts].filter(Boolean).join('/')});
export const collection = ref;
export const doc = (parent,...parts)=>ref(parent,...(parts.length?parts:['sent-'+(++sequence)]));
export const orderBy = (field,direction)=>({kind:'order',field,direction});
export const limit = count=>({kind:'limit',count});
export const startAfter = snap=>({kind:'after',path:snap.path});
export const query = (source,...constraints)=>({...source,constraints});
export const serverTimestamp = ()=>stamp(Date.now());
const snapshot=(p,data)=>({id:p.split('/').at(-1),path:p,exists:()=>!!data,get:key=>data?.[key],data:()=>data,metadata:{hasPendingWrites:!!data?.pending}});
const matching=q=>{
 let rows=[...docs].filter(([p])=>p.startsWith(q.path+'/')&&p.slice(q.path.length+1).indexOf('/')<0).map(([p,d])=>snapshot(p,d));
 if(q.constraints?.some(c=>c.kind==='order'))rows.sort((a,b)=>b.get('sentAt').toMillis()-a.get('sentAt').toMillis());
 const after=q.constraints?.find(c=>c.kind==='after'); if(after)rows=rows.slice(rows.findIndex(s=>s.path===after.path)+1);
 const count=q.constraints?.find(c=>c.kind==='limit'); if(count)rows=rows.slice(0,count.count);
 return {docs:rows,size:rows.length};
};
export const getDoc = async q=>snapshot(q.path,docs.get(q.path));
export const getDocs = async q=>matching(q);
const emit=()=>listeners.forEach(l=>l.next(l.q.constraints?matching(l.q):snapshot(l.q.path,docs.get(l.q.path))));
export const onSnapshot=(q,options,next,error)=>{
 if(typeof options==='function'){error=next;next=options;}
 const l={q,next,error};listeners.add(l);
 setTimeout(()=>{if(listeners.has(l)){if(window.chatTest.loadError&&q.constraints)error?.(Error('Expected load failure'));else next(q.constraints?matching(q):snapshot(q.path,docs.get(q.path)));}},10);
 return ()=>listeners.delete(l);
};
export const setDoc=async(q,data)=>{if(window.chatTest.failToggle){window.chatTest.failToggle=false;throw Error('Expected toggle failure');}docs.set(q.path,{...docs.get(q.path),...data});emit();};
export const writeBatch=()=>{
 const writes=[];const batch={set:(q,data,options)=>writes.push({q,data,merge:options?.merge}),update:(q,data)=>writes.push({q,data,merge:true}),commit:async()=>{
  if(window.chatTest.failSend){window.chatTest.failSend=false;throw Error('Expected send failure');}
  window.chatTest.commits++;
  writes.forEach(({q,data,merge})=>docs.set(q.path,{...(merge?docs.get(q.path):{}),...data,...(q.path.includes('/messages/')&&!merge?{pending:true}:{})}));emit();
  await new Promise(resolve=>setTimeout(resolve,40));
  writes.forEach(({q})=>{const d=docs.get(q.path);if(d.pending)docs.set(q.path,{...d,pending:false});});emit();
 }};return batch;
};
export const postToApi=async()=>{window.chatTest.pushes++;};
const now=Date.now(),today=new Date().setHours(9,0,0,0);
classes.forEach((c,i)=>{
 docs.set('classes/'+c.id,{...c,teacherId:'teacher'});
 docs.set('classes/'+c.id+'/chat/state',{open:i!==1,lastAt:stamp(today+6*60000),lastText:i===1?'Bring your reading journal tomorrow.':'Thank you, Ma’am!',lastSenderName:'Santos, Miguel',lastRole:'student'});
 for(let n=0;n<10;n++)docs.set('classes/'+c.id+'/students/student-'+n,{fullName:['Santos, Miguel','Dela Cruz, Sofia','Bautista, Isabel'][n%3]+' '+(n+1)});
});
docs.set('users/teacher',{displayName:'Ana Reyes',role:'teacher',title:'maam'});
const message=(id,data)=>docs.set('classes/rizal/messages/'+id,{senderId:'student-1',senderName:'Dela Cruz, Sofia',role:'student',sentAt:stamp(today),...data});
if(!location.search.includes('empty-chat')){
 message('join',{kind:'join',senderName:'Santos, Miguel',sentAt:stamp(today-86400000)});
 message('hello',{senderId:'teacher',senderName:'Ana Reyes',role:'teacher',text:'Magandang umaga, class! Let’s keep our questions and discoveries here.',sentAt:stamp(today)});
 message('question',{text:'Ma’am, can we share our reading reflections here?',sentAt:stamp(today+60000)});
 message('grouped',{text:'I enjoyed the story about our community.',sentAt:stamp(today+65000)});
 message('reply',{senderId:'teacher',senderName:'Ana Reyes',role:'teacher',text:'Of course! Share one thing you learned, and a question you would like us to discuss.',sentAt:stamp(today+180000)});
 message('removed',{text:'',deleted:true,deletedBy:'teacher',sentAt:stamp(today+240000)});
 message('thanks',{senderId:'student-2',senderName:'Santos, Miguel',text:'Thank you, Ma’am!',sentAt:stamp(today+360000)});
}
window.chatTest={commits:0,pushes:0,failSend:false,failToggle:false,loadError:location.search.includes('load-error'),
 listeners:()=>listeners.size,
 add:(text='A new class message')=>{message('realtime-'+(++sequence),{text,sentAt:stamp(Date.now()+sequence)});emit();},
 history:()=>{for(let i=1;i<=42;i++)message('history-'+i,{text:'Earlier discussion '+i,sentAt:stamp(today-i*600000)});emit();},
 long:()=>{message('long',{senderName:'A very long participant name with multiple family names',text:'MasayangPagbabasa'.repeat(30)+'\\nAnother line of class discussion.',sentAt:stamp(now+60000)});emit();},
 summary:()=>{docs.set('classes/mabini/chat/state',{open:false,lastAt:stamp(Date.now()),lastText:'A real-time class preview',lastSenderName:'Bautista, Isabel',lastRole:'student'});emit();},
 permission:open=>{docs.set('classes/rizal/chat/state',{...docs.get('classes/rizal/chat/state'),open});emit();},
 closeMabini:()=>{docs.set('classes/mabini/chat/state',{...docs.get('classes/mabini/chat/state'),open:false});emit();},
 rename:()=>{classes[0].className='Grade 7 — A longer class name for Filipino language and community studies';},
};
`;
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://preview').pathname).slice(1);
    let body, type = 'text/javascript';
    if (name === 'fixture.mjs') body = fixture;
    else if (name === 'teacher/messages-preview.html') {
      body = (await fs.readFile(path.join(root, 'teacher/index.html'), 'utf8'))
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, s => /type="module"/.test(s) ? '' : s)
        .replace('</body>', `<script type="module">
          import {renderMessages,leaveMessages} from './views/messages.js';
          import {page} from '../js/helpers.js';
          import '../js/theme.js';
          document.querySelector('#loading-screen').hidden=true;
          document.querySelector('#app-view').hidden=false;
          document.querySelector('[data-nav="messages"]').classList.add('active');
          const render=async()=>{window.ready=false;leaveMessages();const id=location.hash.split('/')[2];await renderMessages(id);window.ready=true;};
          window.addEventListener('hashchange',render);
          window.leavePreview=()=>{leaveMessages();page('Other page','');document.querySelector('#page-content').replaceChildren();};
          if(!location.hash)location.hash='#/messages/rizal';else await render();
        </script></body>`);
      type = 'text/html';
    } else {
      const target = path.resolve(root, name);
      if (!target.startsWith(root + path.sep) || name.split(/[\\/]/).some(p => p.startsWith('.'))) throw Error('Invalid path');
      body = await fs.readFile(target);
      type = { '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(name)] || type;
      if (name.endsWith('.js')) body = body.toString().replace(/from\s+(["'])([^"']+)\1/g, (match, q, source) => {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), source));
        return source.startsWith('https://www.gstatic.com/firebasejs/') || ['js/state.js', 'js/firebase.js', 'js/api.js'].includes(resolved) ? "from '/fixture.mjs'" : match;
      });
    }
    res.writeHead(200, { 'Content-Type': type + ';charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body);
  } catch (e) { res.writeHead(404); res.end(e.message); }
});
async function ready(page) { await page.waitForFunction(() => window.ready && !document.querySelector('.chat-loading')); await page.waitForTimeout(600); }
async function overflow(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + ': viewport overflow');
  for (const selector of ['.inbox', '.chat', '.chat-head', '.chat-composer', '.chat-scroll', '.inbox-list']) {
    for (const el of await page.locator(selector + ':visible').all()) assert.ok(await el.evaluate(e => e.scrollWidth <= e.clientWidth + 1), label + ': ' + selector);
  }
}
async function readable(page) {
  const issues=await auditText(page);
  // Conversation previews intentionally clamp to two lines. The full preview is
  // present in the link's accessible name and the span's title; opening the class
  // exposes the complete message on touch devices.
  const previews=await page.locator('.inbox-class__preview > span:last-child').evaluateAll(elements=>elements.filter(el=>el.title&&el.closest('a').getAttribute('aria-label').includes(el.title)).map(el=>el.textContent.trim().slice(0,75)));
  return issues.filter(issue=>{
    if(issue.type==='vertical-clip'&&previews.some(text=>issue.label==='SPAN: '+text))return false;
    return true;
  });
}
async function screenshot(page, name) { await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'})); await page.screenshot({ path: path.join(artifacts, name + '.png'), fullPage: true }); }
(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const report = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const url = `http://127.0.0.1:${server.address().port}/teacher/messages-preview.html`;
    await page.goto(url); await ready(page); await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.inbox-class').count(), 3);
    assert.equal(await page.locator('.chat-msg.is-grouped').count(), 1);
    assert.equal(await page.locator('.chat-msg.is-mine').count(), 2);
    assert.equal(await page.locator('.chat-notice').count(), 1);
    // Slow class loading previously exposed the legacy CSS and oversized header
    // icon after leaveMessages() removed the current page's styling.
    for (const target of ['mabini', 'rizal']) {
      await page.evaluate(target=>{window.chatTest.classDelay=350;location.hash='#/messages/'+target;},target);
      await page.waitForFunction(()=>window.ready===false);
      const pending=await page.evaluate(async()=>{
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const root=document.querySelector('#page-content');
        return {styled:root.classList.contains('teacher-messages'),header:document.querySelector('#page-header').classList.contains('teacher-messages-header'),icons:document.querySelectorAll('#page-header .page-header__icon').length,animation:getComputedStyle(root.querySelector('.inbox')).animationName};
      });
      assert.deepEqual(pending,{styled:true,header:true,icons:0,animation:'none'},'Class switching must never expose the legacy layout or header icon');
      await ready(page);
      assert.equal(await page.locator('#page-header .page-header__icon').count(),0);
    }
    await page.evaluate(()=>window.chatTest.classDelay=0);
    for (const theme of ['light', 'dark']) {
      if (await page.evaluate(() => document.documentElement.dataset.theme) !== theme) { await page.locator('[data-theme-toggle]').click(); await page.waitForTimeout(750); }
      for (const [name, width] of [['desktop', 1440], ['laptop', 1100], ['tablet', 768], ['mobile', 390], ['small-mobile', 320]]) {
        await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(200);
        await overflow(page, theme + ' ' + name);
        assert.ok(await page.locator('[data-chat-open-label]').isVisible(), name + ': availability label stays visible');
        const issues = await readable(page);
        if(issues.length) console.log(theme,name,JSON.stringify(issues));
        report.push({ theme, viewport: name, textIssues: issues });
        await screenshot(page, name + '-' + theme);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      const input = page.locator('[data-input]'); await input.fill('A class message');
      for (const selector of ['[data-members]', '[data-send]', '[data-remove]']) {
        const control = page.locator(selector).first();
        assert.ok(await control.getAttribute('aria-label')); assert.equal(await control.locator('svg').count(), 1);
        await control.hover(); await page.locator('.floating-tooltip:visible').waitFor(); await page.waitForTimeout(250);
        assert.equal(await page.locator('.floating-tooltip:visible').textContent(), await control.getAttribute('aria-label'));
        assert.ok(await page.locator('.floating-tooltip:visible').evaluate(el => { const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight; }));
        if(selector==='[data-send]') { report.push({theme,state:'tooltip',textIssues:await readable(page)}); await screenshot(page,'send-tooltip-'+theme); }
        await page.mouse.move(0, 0); await control.focus(); await page.locator('.floating-tooltip:visible').waitFor();
        await page.keyboard.press('Escape'); assert.equal(await page.locator('.floating-tooltip:visible').count(), 0);
      }
      await input.fill('');
      await page.locator('[data-members]').click(); await page.locator('.cm-row:not(.is-skeleton)').first().waitFor();
      await page.waitForTimeout(450);
      assert.equal(await page.locator('[role="dialog"]').getAttribute('aria-labelledby'), 'cm-title');
      await page.locator('.modal-close').focus(); await page.keyboard.press('Shift+Tab');
      assert.ok(await page.locator('[role="dialog"]').evaluate(el=>el.contains(document.activeElement)));
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        report.push({theme,dialog:width,textIssues:await readable(page)});
        await screenshot(page, 'members-' + width + '-' + theme);
      }
      await page.keyboard.press('Escape'); await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
      assert.equal(await page.locator('[data-members]').evaluate(el=>el===document.activeElement),true);
      await page.locator('.chat-head__back').click(); await ready(page);
      assert.ok(await page.locator('.inbox-list').isVisible());
      await overflow(page,theme+' mobile conversation list'); await screenshot(page,'list-mobile-'+theme);
      await page.evaluate(()=>window.chatTest.closeMabini());
      await page.locator('.inbox-class').nth(1).click(); await ready(page);
      assert.equal(await page.locator('[data-chat-open-label]').textContent(),'Closed');
      assert.ok(await page.locator('[data-chat-closed]').isVisible()); await overflow(page,theme+' closed mobile');
      report.push({theme,state:'closed',textIssues:await readable(page)}); await screenshot(page,'closed-mobile-'+theme);
      await page.locator('[data-reopen]').click(); await page.waitForFunction(()=>document.querySelector('[data-chat-open-label]').textContent==='Open');
      await page.evaluate(()=>location.hash='#/messages/rizal'); await ready(page);
      await page.setViewportSize({ width:1440,height:1000 });
    }
    // Real chat.js batching, rendering, keyboard behavior, cooldown and failure recovery.
    const input=page.locator('[data-input]'),send=page.locator('[data-send]');
    await input.fill(''); assert.ok(await send.isDisabled());
    await input.fill('   '); assert.ok(await send.isDisabled());
    await input.fill('First line'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('Second line');
    assert.equal(await input.inputValue(),'First line\nSecond line');
    const before=await page.evaluate(()=>window.chatTest.commits);
    await page.keyboard.press('Enter'); await page.waitForFunction(()=>window.chatTest.commits>0);
    assert.equal(await input.inputValue(),''); assert.ok(await send.isDisabled());
    await page.waitForFunction(()=>document.querySelector('.chat-msg__status')?.textContent==='Sent');
    await input.fill('Wait for the cooldown'); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>window.chatTest.commits),before+1);
    await page.waitForFunction(()=>!document.querySelector('[data-send]').disabled);
    await page.evaluate(()=>window.chatTest.failSend=true); await input.fill('Restore this draft'); await send.click();
    await page.waitForFunction(()=>document.querySelector('[data-send-error]').textContent.includes('restored'));
    assert.equal(await input.inputValue(),'Restore this draft'); assert.ok(await send.isEnabled());
    await screenshot(page,'send-error-dark');
    await send.click(); await page.waitForFunction(()=>document.querySelector('[data-send-error]').textContent==='');
    await page.waitForFunction(()=>window.chatTest.pushes===2);
    await page.evaluate(()=>window.chatTest.permission(false));
    await input.fill('Teacher can still send'); await page.waitForFunction(()=>!document.querySelector('[data-send]').disabled);
    assert.equal(await page.locator('[data-chat-open-label]').textContent(),'Closed');
    await page.evaluate(()=>window.chatTest.failToggle=true); await page.locator('[data-chat-open]').focus(); await page.keyboard.press('Space');
    await page.waitForFunction(()=>!document.querySelector('[data-chat-open]').checked);
    await page.locator('[data-reopen]').click();
    await input.fill('x'.repeat(1850)); assert.equal(await input.getAttribute('maxlength'),'2000');
    assert.equal(await page.locator('[data-count]').textContent(),'1850/2000'); await input.fill('');
    const remove=page.locator('[data-remove="question"]'); await remove.click();
    assert.ok(await page.locator('[data-id="question"]').evaluate(el=>el.classList.contains('is-confirming')));
    await remove.click(); await page.waitForFunction(()=>!document.querySelector('[data-id="question"]'));
    await page.evaluate(()=>window.chatTest.summary());
    await page.waitForFunction(()=>document.querySelectorAll('.inbox-class__preview')[1].textContent.includes('real-time class preview'));
    await page.evaluate(()=>window.chatTest.history());
    await page.locator('[data-load-older]').waitFor();
    await page.locator('[data-chat-scroll]').evaluate(el=>el.scrollTop=0);
    await page.locator('[data-load-older]').hover(); await page.locator('.floating-tooltip:visible').waitFor();
    assert.equal(await page.locator('.floating-tooltip:visible').textContent(),'Load older messages');
    await page.locator('[data-load-older]').click();
    await page.waitForFunction(()=>document.querySelector('[data-messages]').textContent.includes('Earlier discussion 42'));
    await page.locator('[data-chat-scroll]').evaluate(el=>el.scrollTop=0);
    await page.evaluate(()=>window.chatTest.add('A live update while reading history'));
    await page.waitForFunction(()=>!document.querySelector('[data-jump-count]').hidden);
    await page.locator('[data-jump-button]').focus(); await page.locator('.floating-tooltip:visible').waitFor();
    assert.match(await page.locator('.floating-tooltip:visible').textContent(),/Go to newest message/);
    await page.locator('[data-jump-button]').click(); await page.waitForFunction(()=>document.querySelector('[data-jump]').hidden);
    await page.evaluate(()=>window.chatTest.long()); await page.setViewportSize({width:320,height:740});
    await overflow(page,'long messages on mobile'); await screenshot(page,'long-mobile-dark');
    await page.emulateMedia({reducedMotion:'reduce'}); await page.locator('[data-members]').hover();
    assert.equal(await page.locator('.floating-tooltip:visible').evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal(await page.locator('.chat-msg').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    const active=await page.evaluate(()=>window.chatTest.listeners());
    await page.evaluate(()=>window.leavePreview());
    assert.equal(await page.locator('.floating-tooltip').count(),0);
    assert.equal(await page.locator('.teacher-messages').count(),0);
    assert.equal(await page.evaluate(()=>window.chatTest.listeners()),active-2);
    await page.goto(url+'?empty-chat');await ready(page);assert.ok(await page.locator('.chat-empty').isVisible());
    await screenshot(page,'empty-chat-mobile-dark');
    await page.goto(url+'?no-classes#/messages');await ready(page);assert.equal(await page.locator('.inbox-class').count(),0);
    await screenshot(page,'no-classes-mobile-dark');
    await page.goto(url+'?load-error');await ready(page);assert.match(await page.locator('.chat-empty').textContent(),/Couldn't load/);
    await screenshot(page,'load-error-mobile-dark');
    await page.setViewportSize({width:1440,height:1000}); await page.goto(url);await ready(page);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));
    const issues=report.filter(r=>r.textIssues.length);
    assert.deepEqual(issues,[], 'Readability issues (see audit/messages-design/report.json)');
    console.log('PASS: light/dark at desktop, laptop, tablet, mobile, 320px; live summaries/messages; grouped/system/removed messages; history/jump; send/Shift+Enter/Enter/cooldown/limits/error recovery; availability; moderation; members dialog/focus; tooltips; reduced motion; route cleanup; empty/error states; saved theme.');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
