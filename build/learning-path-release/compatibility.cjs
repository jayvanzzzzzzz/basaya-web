const fs=require('node:fs');
const auth=require('C:/Users/Scean Andrei/AppData/Local/npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/auth.js');
(async()=>{
 const account=auth.getGlobalDefaultAccount();const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
 const documents=[];let pageToken='';
 do {const url=new URL('https://firestore.googleapis.com/v1/projects/basaya/databases/(default)/documents/lessons');url.searchParams.set('pageSize','300');url.searchParams.append('mask.fieldPaths','visibility');url.searchParams.append('mask.fieldPaths','teacherId');if(pageToken)url.searchParams.set('pageToken',pageToken);const res=await fetch(url,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('Firestore metadata HTTP '+res.status);const data=await res.json();documents.push(...(data.documents||[]));pageToken=data.nextPageToken;}while(pageToken);
 fs.writeFileSync('build/learning-path-release/lesson-visibility-backup.json',JSON.stringify(documents,null,2));
 const missing=documents.filter(item=>!item.fields?.visibility);
 if(missing.length)throw Error(missing.length+' legacy lessons need visibility backfill before release.');
 console.log('PASS: '+documents.length+' production lessons have explicit visibility. No migration required; no production data changed.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
