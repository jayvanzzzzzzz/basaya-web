const fs=require('node:fs');
const auth=require('C:/Users/Scean Andrei/AppData/Local/npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/auth.js');
(async()=>{
 const inventory=JSON.parse(fs.readFileSync('build/content-visibility/lesson-inventory.json','utf8'));
 if(inventory.lessons.length!==26||inventory.lessons.some(l=>l.visibility!=='(unset)'||l.publicationState!=='(legacy)'))throw Error('Inventory does not match the reviewed 26 legacy lessons.');
 const account=auth.getGlobalDefaultAccount();if(!account?.tokens?.refresh_token)throw Error('Firebase CLI login unavailable');
 const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
 const base='https://firestore.googleapis.com/v1/projects/basaya/databases/(default)/documents';
 const request=async(url,options={})=>{const r=await fetch(url,{...options,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Firestore HTTP '+r.status);return r.json()};
 if(process.argv.includes('--admin-rights')) {
  const documents=await Promise.all(inventory.lessons.map(l=>request('https://firestore.googleapis.com/v1/'+l.name)));
  if(documents.some(d=>d.fields?.teacherId?.stringValue||d.fields?.ownerId?.stringValue||d.fields?.createdBy?.stringValue))throw Error('An existing owner needs review before granting admin-library ownership.');
  fs.mkdirSync('build/idyoma-audit',{recursive:true});fs.writeFileSync('build/idyoma-audit/before-admin-rights.json',JSON.stringify(documents,null,2));
  const writes=documents.map(d=>({update:{name:d.name,fields:{visibility:{stringValue:'shared'},adminManaged:{booleanValue:true}}},updateMask:{fieldPaths:['visibility','adminManaged']},currentDocument:{updateTime:d.updateTime}}));
  const result=await request(base+':commit',{method:'POST',body:JSON.stringify({writes})});
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):value;
  const remaining=fields=>JSON.stringify(stable(Object.fromEntries(Object.entries(fields).filter(([k])=>!['visibility','adminManaged'].includes(k)))));
  for(const before of documents){const after=await request('https://firestore.googleapis.com/v1/'+before.name);if(after.fields.visibility?.stringValue!=='shared'||after.fields.adminManaged?.booleanValue!==true||remaining(before.fields)!==remaining(after.fields))throw Error('Verification failed: '+before.name.split('/').pop());}
  fs.writeFileSync('build/idyoma-audit/admin-rights-result.json',JSON.stringify({count:documents.length,verified:documents.length,commitTime:result.commitTime,ids:documents.map(d=>d.name.split('/').pop())},null,2));
  console.log(JSON.stringify({updated:documents.length,verified:documents.length,visibility:'shared',adminManaged:true,contentPreserved:true,idyomaTitle:documents.find(d=>d.name.endsWith('/8lw85XEqqvIKI6NvyjpG'))?.fields.title.stringValue}));return;
 }
 const writes=inventory.lessons.map(l=>({update:{name:l.name,fields:{visibility:{stringValue:'shared'}}},updateMask:{fieldPaths:['visibility']},currentDocument:{updateTime:l.updateTime}}));
 const committed=await request(base+':commit',{method:'POST',body:JSON.stringify({writes})});
 let verified=0;
 for(const lesson of inventory.lessons){const d=await request('https://firestore.googleapis.com/v1/'+lesson.name);if(d.fields?.visibility?.stringValue!=='shared')throw Error('Verification failed for '+lesson.id);verified++;}
 fs.writeFileSync('build/content-visibility/shared-lessons-result.json',JSON.stringify({commitTime:committed.commitTime,updated:committed.writeResults.length,verified,ids:inventory.lessons.map(l=>l.id)},null,2));
 console.log(JSON.stringify({updated:committed.writeResults.length,verified,visibility:'shared',commitTime:committed.commitTime}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
