const fs=require('node:fs'),path=require('node:path');
const dir=path.join(process.cwd(),'build/learning-path-release'),site=path.join(dir,'site');
const normalize=text=>text.replaceAll('\r\n','\n').trim();
(async()=>{
 if(!process.argv.includes('--web-only')) {
 const auth=require('C:/Users/Scean Andrei/AppData/Local/npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/auth.js');
 const account=auth.getGlobalDefaultAccount(),token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
 const read=async url=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Rules verification HTTP '+r.status);return r.json();};
 const release=await read('https://firebaserules.googleapis.com/v1/projects/basaya/releases/cloud.firestore');
 const rules=await read('https://firebaserules.googleapis.com/v1/'+release.rulesetName);
 if(normalize(rules.source.files.find(file=>file.name.endsWith('.rules')).content)!==normalize(fs.readFileSync(path.join(site,'firestore.rules'),'utf8')))throw Error('Active rules differ from tested release.');
 console.log('PASS: active production rules exactly match the tested release.');
 }
 const files=JSON.parse(fs.readFileSync(path.join(dir,'files.json'),'utf8')).filter(name=>/^(js|css|teacher|admin)\//.test(name)||name==='offline-shell.js');
 const results=await Promise.all(files.map(async name=>{const r=await fetch('https://basaya.onrender.com/'+name+'?learning-path-release='+Date.now(),{signal:AbortSignal.timeout(45000)});return {name,status:r.status,matches:r.ok&&normalize(await r.text())===normalize(fs.readFileSync(path.join(site,name),'utf8'))};}));
 fs.writeFileSync(path.join(dir,'live-verification.json'),JSON.stringify(results,null,2));
 const pending=results.filter(item=>!item.matches);
 if(pending.length){console.log('Web deployment pending: '+pending.map(item=>item.name).join(', '));process.exitCode=2;}
 else console.log('PASS: all '+files.length+' released web assets match production, including the refreshed offline manifest.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
