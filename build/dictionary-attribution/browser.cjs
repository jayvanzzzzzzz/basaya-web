// Reuse the existing dictionary preview server and responsive checks with the new policy.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
let source = fs.readFileSync(path.resolve(__dirname, '../../tools/dictionary-design-browser.cjs'), 'utf8');
source = source.replace("audit/dictionary-design", "audit/dictionary-attribution");
source = source.replace('await renderDictionary();', "location.hash='/dictionary';await renderDictionary();");
source = source.replace("p.on('pageerror',e=>errors.push(e.message));", "p.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});");
source = source.replace("source:i===1?'teacher':'wiktionary',createdBy:i===1?'teacher':'seed',", "source:i===1||i===2?'teacher':'wiktionary',createdBy:'other-person',createdByRole:i===2?'admin':'teacher',createdByLastName:i===1?'Dela Cruz':'',createdByName:i===1?'Ana Dela Cruz':'Admin',updatedByRole:'admin',edited:i===2,");
source = source.replace("assert.equal(await p.locator('[data-act=\"delete\"]').count(),role==='admin'?1:0);", `assert.equal(await p.locator('[data-act="delete"]').count(),0);
 assert.equal(await p.locator('[data-act="edit"]').count(),0);
 assert.equal(await p.locator('.dict-entry .tag').filter({hasText:'Wiktionary'}).count(),0);`);
source = source.replace(" await p.locator('[data-act=\"speak\"]').focus();", ` await p.locator('[data-word="salita1"]').click();
 assert.equal(await p.locator('.dict-entry .tag').first().innerText(),'Added by Teacher Dela Cruz');
 assert.equal(await p.locator('[data-act="delete"]').count(),1);
 assert.equal(await p.locator('[data-act="edit"]').count(),1);
 await p.locator('[data-act="speak"]').focus();`);
source = source.replace("selectOption('teacher');assert.equal(await p.locator('.dict-row:visible').count(),1)", "selectOption('teacher');assert.equal(await p.locator('.dict-row:visible').count(),2)");
source = source.replace(" await p.locator('#dict-search').fill('zzzz');", ` await p.locator('[data-key="salita2"] [data-act="open"]').click();
 assert.equal(await p.locator('.dict-entry .tag').first().innerText(),'Edited by Admin');
 await p.locator('[data-act="delete"]').click();await p.locator('[data-confirm]').click();
 await p.waitForFunction(()=>window.deleted==='salita2');await p.waitForSelector('.dict-row');
 await p.locator('#dict-search').fill('zzzz');`);
// The harness expects to run from tools/ so its relative assets resolve correctly.
const runner = new Module(path.resolve(__dirname, '../../tools/dictionary-attribution-preview.cjs'), module);
runner.filename = runner.id;
runner.paths = module.paths;
runner._compile(source, runner.filename);
