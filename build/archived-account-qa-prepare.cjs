const fs=require('node:fs');
const source=fs.readFileSync('tools/student-hub-browser.cjs','utf8');
const prefix=source.slice(0,source.indexOf('(async()=>{')).replace("require('./text-readability-audit.cjs')","require('../tools/text-readability-audit.cjs')");
const setup=source.slice(source.indexOf('(async()=>{'),source.indexOf('    const checks=[];'));
const checks=source.slice(source.indexOf('    await page.evaluate(()=>{qa.student.classroom={archived:true'),source.indexOf("    await page.locator('[data-theme-toggle]').click();await page.waitForTimeout(800);const chosen="));
fs.writeFileSync('build/archived-account-qa.cjs',prefix+setup+checks+`
    assert.deepEqual(errors,[]);
    console.log('PASS: archived student Account shows archive status; submit reason, pending teacher approval, preservation copy and cancellation work with isolated Firestore adapters. Both themes captured.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
`);
