// Read-only reproduction: inject latency into the isolated directory fixture.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const filename=path.resolve(__dirname,'../../tools/teacher-status-browser.cjs');
let source=fs.readFileSync(filename,'utf8');
source=source.replace('window.calls.push(body);', "window.calls.push(body); if(body.action==='statuses') await new Promise(resolve=>setTimeout(resolve,3000));");
const start=source.indexOf(' await page.goto(url);');
const end=source.indexOf('})().catch',start);
if(start<0||end<0)throw Error('Fixture markers missing');
source=source.slice(0,start)+`
 const started=Date.now();
 await page.goto(url);
 await page.waitForFunction(()=>window.calls.some(call=>call.action==='statuses'));
 await page.waitForTimeout(500);
 const before=await page.locator('tr[data-teacher-name]').count();
 await page.waitForFunction(()=>window.ready);
 console.log(JSON.stringify({injectedStatusDelayMs:3000,teacherRowsWhileStatusPending:before,teacherRowsAfterStatusResponse:await page.locator('tr[data-teacher-name]').count(),totalLoadMs:Date.now()-started,pageErrors:errors}));
`+source.slice(end);
const audit=new Module(filename,module);audit.filename=filename;audit.paths=Module._nodeModulePaths(path.dirname(filename));audit._compile(source,filename);
