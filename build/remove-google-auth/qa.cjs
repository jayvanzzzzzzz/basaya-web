// Reuse the existing local login browser audit with the new password-only contract.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../../tools/login-design-browser.cjs');
let source = fs.readFileSync(filename, 'utf8');
source = source.replace(/  assert.equal\(html.replace[^\n]+\n/, '');
source = source.replace('export class GoogleAuthProvider', 'export const signInWithCustomToken=async()=>{}; export class GoogleAuthProvider');
source = source.replace("assert.ok(await page.locator('#google-login').isVisible());", "assert.equal(await page.locator('#google-login, .auth-google-divider').count(),0);");
source = source.replace("textContent==='Incorrect email or password.'", "textContent==='Incorrect email, username, or password.'");
source = source.replace("provider:'password'", "provider:'google.com'");
source = source.replace("assert.ok(await page.locator('#login-email-field').isHidden());", `assert.ok(await page.locator('#login-email-field').isHidden());
  assert.ok(await page.locator('#login-password-field').isVisible());
  assert.ok(await page.locator('.auth-forgot').isVisible());
  assert.ok(await page.locator('.login-submit').isVisible());`);
source = source.replace('PASS: exact original copy preserved;', 'PASS: Google sign-in absent; saved Google profile uses password and recovery;');
const audit = new Module(filename, module);
source = source.replace('width,height:1000', 'width,height:768');
source = source.replace("assert.ok(await page.locator('#showcase-panel-'+tab).isVisible());", `assert.ok(await page.locator('#showcase-panel-'+tab).isVisible());
        if(width>900) {
          const title=await page.locator('#showcase-panel-'+tab+' h1').boundingBox();
          const nav=await page.locator('.auth-showcase__nav').boundingBox();
          assert.ok(title.y>=0 && title.y+title.height<=768,'Slide title fits viewport');
          assert.ok(nav.y+nav.height<=768,'Slide navigation fits viewport');
        }`);
audit.filename = filename;
audit.paths = Module._nodeModulePaths(path.dirname(filename));
audit._compile(source, filename);
