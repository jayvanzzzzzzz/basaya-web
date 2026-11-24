const fs=require('node:fs');
const auth=require('C:/Users/Scean Andrei/AppData/Local/npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/auth.js');
(async()=>{
 const account=auth.getGlobalDefaultAccount();if(!account?.tokens?.refresh_token)throw Error('Firebase CLI login unavailable');
 const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
 const base='https://firestore.googleapis.com/v1/projects/basaya/databases/(default)/documents';
 const request=async(url,options={})=>{const r=await fetch(url,{...options,headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Firestore HTTP '+r.status);return r.json()};
 if(process.argv.includes('--ownership')) {
  const data=await request(base+'/lessons/8lw85XEqqvIKI6NvyjpG');
  console.log(JSON.stringify({title:data.fields?.title?.stringValue,fieldNames:Object.keys(data.fields||{}),teacherId:data.fields?.teacherId?.stringValue||null,ownerId:data.fields?.ownerId?.stringValue||null,createdBy:data.fields?.createdBy?.stringValue||null}));return;
 }
 let documents=[],pageToken=''; do {const data=await request(base+'/lessons?pageSize=300'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''));documents.push(...data.documents||[]);pageToken=data.nextPageToken;}while(pageToken);
 if(process.argv.includes('--find-idyoma')) {
  const originalId='8lw85XEqqvIKI6NvyjpG';
  const matches=documents.filter(d=>d.name.endsWith('/'+originalId)||/idyoma/i.test(d.fields?.title?.stringValue||'')||d.fields?.sourceLessonId?.stringValue===originalId||d.fields?.copiedFromLessonId?.stringValue===originalId);
  const report=[];
  for(const document of matches){
   const f=document.fields||{},sections={};
   for(const part of ['lectures','lecture','pronunciation','quiz','activity','game']){const data=await request('https://firestore.googleapis.com/v1/'+document.name+'/'+part+'?pageSize=100');sections[part]=(data.documents||[]).length;}
   report.push({id:document.name.split('/').pop(),fields:f,sections,updateTime:document.updateTime});
  }
  fs.mkdirSync('build/idyoma-audit',{recursive:true});fs.writeFileSync('build/idyoma-audit/report.json',JSON.stringify(report,null,2));
  const admins=await request(base+':runQuery',{method:'POST',body:JSON.stringify({structuredQuery:{from:[{collectionId:'users'}],select:{fields:['role','displayName','firstName','lastName'].map(fieldPath=>({fieldPath}))},where:{fieldFilter:{field:{fieldPath:'role'},op:'EQUAL',value:{stringValue:'admin'}}}}})});
  console.log(JSON.stringify({lessons:report,totalLessonCount:documents.length,copyCount:documents.filter(d=>d.fields?.sourceLessonId||d.fields?.copiedFromLessonId).length,draftCount:documents.filter(d=>d.fields?.publicationState?.stringValue==='draft').length,admins:admins.filter(r=>r.document).map(({document:d})=>({uid:d.name.split('/').pop(),name:d.fields.displayName?.stringValue||[d.fields.firstName?.stringValue,d.fields.lastName?.stringValue].filter(Boolean).join(' ')}))},null,2));return;
 }
 const lessons=documents.map(d=>({name:d.name,id:d.name.split('/').pop(),title:d.fields?.title?.stringValue,teacherId:d.fields?.teacherId?.stringValue,visibility:d.fields?.visibility?.stringValue||'(unset)',publicationState:d.fields?.publicationState?.stringValue||'(legacy)',updateTime:d.updateTime}));
 const authors=[];for(const uid of [...new Set(lessons.map(l=>l.teacherId).filter(Boolean))]) {const d=await request(base+'/users/'+encodeURIComponent(uid));authors.push({uid,role:d.fields?.role?.stringValue,name:d.fields?.displayName?.stringValue||[d.fields?.firstName?.stringValue,d.fields?.lastName?.stringValue].filter(Boolean).join(' ')});}
 fs.mkdirSync('build/content-visibility',{recursive:true});fs.writeFileSync('build/content-visibility/lesson-inventory.json',JSON.stringify({authors,lessons},null,2));
 console.log(JSON.stringify({authors,lessons:lessons.map(({name,updateTime,...l})=>l)},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
