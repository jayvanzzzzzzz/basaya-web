const fs=require('node:fs'),cp=require('node:child_process');
const auth=require('C:/Users/Scean Andrei/AppData/Local/npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/auth.js');
(async()=>{
 const account=auth.getGlobalDefaultAccount();if(!account?.tokens?.refresh_token)throw Error('Firebase CLI login is unavailable.');
 const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
 const read=async url=>{const response=await fetch(url,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Rules API HTTP '+response.status);return response.json()};
 const release=await read('https://firebaserules.googleapis.com/v1/projects/basaya/releases/cloud.firestore');
 const ruleset=await read('https://firebaserules.googleapis.com/v1/'+release.rulesetName);
 const content=ruleset.source.files.find(file=>file.name.endsWith('.rules')).content;
 const normalize=s=>s.replaceAll('\r\n','\n').trim();
 const expected=fs.readFileSync('build/module-deploy/release/firestore.rules','utf8');
 if(process.argv.includes('--verify')){
  if(normalize(content)!==normalize(expected))throw Error('Deployed Firestore rules do not match the module release.');
  console.log('Verified active Firestore rules match the module release.');return;
 }
 fs.writeFileSync('build/module-deploy/active-firestore.rules',content);
 const head=cp.execFileSync('git',['show','HEAD:firestore.rules'],{encoding:'utf8'});
 console.log(JSON.stringify({activeMatchesProductionCommit:normalize(content)===normalize(head),activeMatchesWorkspace:normalize(content)===normalize(fs.readFileSync('firestore.rules','utf8'))}));
})().catch(error=>{console.error(error.message);process.exitCode=1});
