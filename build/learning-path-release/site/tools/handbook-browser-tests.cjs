// Real portal shell and handbook; synthetic auth/API fixtures, no production calls.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const artifacts = process.env.BASAYA_QA_OUTPUT || path.join(root, 'audit/handbook');
let browser, tests = 0;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://fixture');
    const name = decodeURIComponent(url.pathname).slice(1);
    let source, type = 'text/javascript';
    if (/^(teacher|admin)\/preview.html$/.test(name)) {
      const role = name.split('/')[0];
      source = (await fs.readFile(path.join(root, role, 'index.html'), 'utf8'))
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
        .replace('id="app-view" class="app-shell" hidden', 'id="app-view" class="app-shell"')
        .replace('id="loading-screen"', 'hidden id="loading-screen"')
        .replace('</body>', `<script type="module">
          import {renderHandbook,leaveHandbook} from '/js/handbook.js';
          import {state} from '/js/state.js';
          state.profile.role='${role}';
          window.fixture={remaining:10,available:true,calls:0,hold:false,nextAllowedAt:0,answer:'Open My Classes and choose your classroom.\\nSelect Add lessons to browse your collection and choose the lessons you want to assign.\\nChoose Assessment or Practice, set the schedule, and save your changes.'};
          window.fixture.render=()=>renderHandbook(state.profile.role); window.fixture.cleanup=leaveHandbook;
          document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav==='handbook'));
          renderHandbook('${role}');
        </script></body>`);
      type = 'text/html';
    } else if (name === 'js/state.js') source = `export const state={user:{uid:'fixture'},profile:{role:'teacher'}};`;
    else if (name === 'js/api.js') source = `export async function postToApi(_path,body,{signal}={}) {
      const f=window.fixture;
      if(body.action==='status') return {available:f.available,remaining:f.remaining,resetAt:Date.now()+86400000,nextAllowedAt:f.nextAllowedAt};
      f.calls++; f.question=body.question;
      if(f.hold) await new Promise(resolve=>{f.release=resolve; signal?.addEventListener('abort',()=>{f.aborted=true;resolve();},{once:true});});
      if(f.fail) throw Object.assign(new Error('Please wait before asking again.'),{code:f.fail,retryAt:Date.now()+60000});
      f.remaining--;f.nextAllowedAt=Date.now()+10000;
      return {answer:f.answer,remaining:f.remaining,resetAt:Date.now()+86400000,nextAllowedAt:f.nextAllowedAt};
    }`;
    else {
      const allowed = /^(css\/|img\/)/.test(name) || ['js/handbook.js','js/handbookHelp.js','js/helpers.js','js/floatingTooltip.js'].includes(name);
      const target = path.resolve(root, name);
      if (!allowed || !target.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
      source = await fs.readFile(target);
      type = ({'.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'})[path.extname(name)] || 'text/javascript';
    }
    res.writeHead(200, {'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store'}).end(source);
  } catch { res.writeHead(404).end(); }
});
const test = async (name, run) => { await run(); tests++; console.log(`PASS: ${name}`); };
(async () => {
  await fs.mkdir(artifacts,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
    const page = await browser.newPage({viewport:{width:1440,height:1050}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**/*',route=>route.abort());
    let visit=0;
    const open = async (role='teacher')=>{await page.goto(`${base}/${role}/preview.html?v=${++visit}#/handbook`);await page.locator('#handbook-quota').filter({hasText:'10 of 10'}).waitFor();};
    await test('teacher/admin navigation, role guides, responsive light/dark layouts',async()=>{
      for(const role of ['teacher','admin']) {
        for(const [width,height,label] of [[1440,1050,'desktop'],[900,1100,'tablet'],[390,844,'mobile']]) {
          await page.setViewportSize({width,height});await open(role);
          assert.equal(await page.locator('[data-nav="handbook"]').getAttribute('href'),'#/handbook');
          assert.equal(await page.locator('[data-guide]').count(),role==='teacher'?30:27);
          assert.equal(await page.locator('#handbook-chat-title').innerText(),'BASAya AI Chat Support');
          assert.equal(await page.locator('#handbook-status').isHidden(),true);
          assert.equal(await page.getByText('10 questions daily. A 10-second pause between questions.',{exact:true}).count(),0);
          assert.equal(await page.locator('.handbook__support-avatar img').evaluate(image=>image.complete&&image.naturalWidth>0),true);
          for(const theme of ['light','dark']) {
            await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
            await page.waitForTimeout(300); // Let existing portal theme transitions settle.
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
            const bounds=await page.locator('.handbook__conversation').boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1);
            await page.screenshot({path:path.join(artifacts,`${role}-${label}-${theme}.png`),fullPage:true});
          }
        }
      }
    });
    await page.setViewportSize({width:1440,height:1050});await open();
    await test('search guides and insert a suggested question without sending',async()=>{
      await page.locator('#handbook-search').fill('password');
      assert.ok(await page.locator('[data-guide]:visible').count()>0);
      assert.ok(await page.locator('[data-guide]:visible').count()<30);
      for (const query of ['remove student','alisin student','tanggalin mag-aaral','Paano i-remove yung student sa class?']) {
        await page.locator('#handbook-search').fill(query);
        assert.ok(await page.locator('[data-guide="remove-student"]').isVisible(),query);
      }
      await page.locator('[data-guide="remove-student"] summary').click();
      assert.match(await page.locator('[data-guide="remove-student"] p').innerText(),/archived/);
      assert.match(await page.locator('[data-guide="remove-student"] p').innerText(),/account stays/);
      await page.locator('[data-guide="remove-student"] [data-ask]').click();
      assert.equal(await page.locator('#handbook-question').inputValue(),'How do I remove a student from my class?');
      assert.equal(await page.evaluate(()=>fixture.calls),0);
      await page.locator('#handbook-search').fill('xyzxyz');assert.equal(await page.locator('#handbook-no-guides').isVisible(),true);
      await page.locator('#handbook-search').fill('');
      await page.locator('.handbook__suggestions button').first().click();
      assert.equal(await page.locator('#handbook-question').inputValue(),'How do I create a class?');
      assert.equal(await page.evaluate(()=>fixture.calls),0);
    });
    await test('three moving thinking dots prevent duplicate submissions; actual wrapped lines reveal smoothly',async()=>{
      await page.evaluate(()=>fixture.hold=true);await page.locator('#handbook-send').click();
      await page.locator('.handbook__thinking').waitFor();assert.equal(await page.locator('.handbook__dots i').count(),3);
      const animations=await page.locator('.handbook__dots i').evaluateAll(nodes=>nodes.map(n=>[getComputedStyle(n).animationName,getComputedStyle(n).animationDelay]));
      assert.ok(animations.every(a=>a[0]==='handbook-thinking'));assert.equal(new Set(animations.map(a=>a[1])).size,3);
      await page.screenshot({path:path.join(artifacts,'thinking.png'),fullPage:true});
      await page.locator('#handbook-form').evaluate(form=>form.requestSubmit());assert.equal(await page.evaluate(()=>fixture.calls),1);
      await page.evaluate(()=>fixture.release());await page.locator('.handbook__reveal').first().waitFor();
      const delays=await page.locator('.handbook__reveal').evaluateAll(nodes=>nodes.map(n=>n.style.animationDelay));assert.ok(new Set(delays).size>=3);
      await page.locator('#handbook-question:enabled').waitFor();
      assert.equal(await page.locator('.handbook__thinking').count(),0);
      assert.equal(await page.locator('.handbook__message--assistant .handbook__avatar img').count(),1);
      assert.equal(await page.locator('.handbook__message--assistant .handbook__bubble').count(),1);
      assert.equal(await page.locator('.handbook__message--user .handbook__bubble').count(),1);
      assert.equal(await page.locator('#handbook-quota').innerText(),'9 of 10 questions left today');
      assert.equal(await page.locator('#handbook-send').isDisabled(),true);
      assert.match(await page.locator('#handbook-status').innerText(),/again in/);
      await page.screenshot({path:path.join(artifacts,'answer.png'),fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.waitForTimeout(300);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(artifacts,'answer-mobile-dark.png'),fullPage:true});
      await page.setViewportSize({width:1440,height:1050});
      await page.evaluate(()=>document.documentElement.dataset.theme='light');
    });
    await test('reopening keeps complete answer and server cooldown; clear does not reset quota',async()=>{
      await page.evaluate(()=>fixture.render());await page.locator('#handbook-quota').filter({hasText:'9 of 10'}).waitFor();
      assert.equal(await page.locator('.handbook__reveal').count(),0);
      assert.ok((await page.locator('#handbook-messages').innerText()).includes('Choose Assessment or Practice'));
      await page.locator('#handbook-clear').focus();await page.getByRole('tooltip').filter({hasText:'Clear conversation'}).waitFor();
      await page.locator('#handbook-clear').click();assert.equal(await page.locator('#handbook-empty').isVisible(),true);
      assert.equal(await page.locator('#handbook-quota').innerText(),'9 of 10 questions left today');
    });
    await test('exhausted quota, offline and unavailable states preserve readable guides',async()=>{
      await open();await page.evaluate(()=>{fixture.remaining=0;fixture.render();});
      await page.locator('#handbook-status').filter({hasText:'Daily limit reached'}).waitFor();
      await page.locator('#handbook-question').fill('help');assert.equal(await page.locator('#handbook-send').isDisabled(),true);
      await page.locator('[data-guide="classes"] summary').click();assert.equal(await page.locator('[data-guide="classes"] p').isVisible(),true);
      await page.context().setOffline(true);await page.locator('#handbook-status').filter({hasText:"You're offline"}).waitFor();
      await page.context().setOffline(false);
      await page.evaluate(()=>{fixture.available=false;fixture.remaining=10;fixture.render();});
      await page.locator('#handbook-retry').waitFor();await page.evaluate(()=>fixture.available=true);await page.locator('#handbook-retry').click();
      await page.locator('#handbook-retry').waitFor({state:'hidden'});
    });
    await test('errors restore input and enforce server retry; answers render as text',async()=>{
      await open();await page.evaluate(()=>fixture.fail='provider_limit');
      await page.locator('#handbook-question').fill('Need help');await page.locator('#handbook-send').click();
      await page.locator('.handbook__message--error').waitFor();assert.equal(await page.locator('#handbook-question').inputValue(),'Need help');
      assert.equal(await page.locator('#handbook-send').isDisabled(),true);
      await open();await page.emulateMedia({reducedMotion:'reduce'});
      await page.evaluate(()=>fixture.answer='<img src=x onerror=alert(1)>');
      await page.locator('#handbook-question').fill('Help');await page.locator('#handbook-question').press('Enter');
      await page.locator('.handbook__message--assistant').waitFor();
      assert.equal(await page.locator('.handbook__message--assistant .handbook__bubble img').count(),0);
      assert.equal(await page.locator('.handbook__message--assistant p').innerText(),'<img src=x onerror=alert(1)>');
      assert.equal(await page.locator('.handbook__reveal').count(),0);
    });
    await test('route cleanup aborts pending request and prevents a late answer',async()=>{
      await open();await page.evaluate(()=>fixture.hold=true);
      await page.locator('#handbook-question').fill('Help');await page.locator('#handbook-send').click();await page.locator('.handbook__thinking').waitFor();
      await page.evaluate(()=>{fixture.cleanup();document.querySelector('#page-content').textContent='Other screen';});
      assert.equal(await page.evaluate(()=>fixture.aborted),true);
      assert.equal(await page.locator('#page-content').innerText(),'Other screen');assert.deepEqual(errors,[]);
    });
    console.log(`Handbook browser: ${tests} scenarios passed.`);
  } finally { await browser?.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
