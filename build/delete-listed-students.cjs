const fs = require('node:fs');
const cliAuth = require('C:/Users/Scean Andrei/AppData/Local/npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/auth.js');
const targets = ['1 2', 'cgj b fkcjf', 'dj fn gj', 'djc cn cnc', 'ehd dnc djcjxj', 'fj dn clnfn', 'fj fv fc'];
const base = 'https://firestore.googleapis.com/v1/projects/basaya/databases/(default)/documents';
const decode = v => v?.stringValue ?? v?.booleanValue ?? v?.integerValue ?? (v?.arrayValue ? (v.arrayValue.values || []).map(decode) : v?.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x])=>[k,decode(x)])) : null);
const data = d => Object.fromEntries(Object.entries(d.fields || {}).map(([k,v])=>[k,decode(v)]));
(async()=>{
 const account = cliAuth.getGlobalDefaultAccount();
 if (!account?.tokens?.refresh_token) throw Error('Firebase CLI login unavailable');
 const token = await cliAuth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
 const request = async (url, options={}) => {
  const r=await fetch(url,{...options, headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});
  if(!r.ok) throw Error('HTTP '+r.status+' '+(await r.text()).slice(0,400));
  return r.status===204 ? {} : r.json();
 };
 const list = async path => {const docs=[];let page='';do {const r=await request(base+'/'+path+'?pageSize=300'+(page?'&pageToken='+encodeURIComponent(page):''));docs.push(...r.documents||[]);page=r.nextPageToken;}while(page);return docs;};
 const users = await list('users');
 const nameOf = p => [p.firstName,p.middleName,p.lastName].map(x=>(x||'').trim()).filter(Boolean).join(' ') || (p.fullName||'').trim().replace(/^,\s*|,\s*$/g,'') || (p.displayName||'').trim() || p.username || p.lrn || '';
 const matches = targets.map(name=>({name, docs:users.filter(d=>{const p=data(d);return p.role==='student' && nameOf(p)===name;})}));
 for(const m of matches) if(m.docs.length!==1)throw Error('Expected exactly one match for '+m.name+', found '+m.docs.length);
 const selected=matches.map(m=>({name:m.name,doc:m.docs[0],profile:data(m.docs[0]),uid:m.docs[0].name.split('/').pop()}));
 const classes=await list('classes');
 for(const s of selected) if(s.profile.lrn || classes.some(d=>d.name.split('/').pop()===s.profile.classId))throw Error('LRN or class found for '+s.name);
 console.log(JSON.stringify(selected.map(s=>({name:s.name,uid:s.uid,lrn:s.profile.lrn||null,classId:s.profile.classId||null,disabled:s.profile.disabled||false})),null,2));
 const lookup=await request('https://identitytoolkit.googleapis.com/v1/projects/basaya/accounts:lookup',{method:'POST',body:JSON.stringify({localId:selected.map(s=>s.uid)})});
 console.log(JSON.stringify({authAccounts:(lookup.users||[]).map(u=>({uid:u.localId,disabled:u.disabled||false}))}));
 if(!process.argv.includes('--apply'))return;
 const uids=new Set(selected.map(s=>s.uid));
 for(const c of classes){const p=data(c);if(['students','studentIds','members'].some(k=>Array.isArray(p[k])&&p[k].some(x=>uids.has(typeof x==='string'?x:x?.uid||x?.studentId))))throw Error('Class membership still references a target');}
 const aliases=(await Promise.all(['usernames','learnerNumbers'].map(list))).flat().filter(d=>uids.has(data(d).uid));
 const descendants=[];
 const walk=async path=>{
  let page='';do {
   const r=await request(base+'/'+path+':listCollectionIds',{method:'POST',body:JSON.stringify({pageSize:100,...(page?{pageToken:page}:{})})});
   for(const id of r.collectionIds||[])for(const d of await list(path+'/'+id)){descendants.push(d);await walk(d.name.split('/documents/')[1]);}
   page=r.nextPageToken;
  }while(page);
 };
 for(const s of selected)await walk('users/'+s.uid);
 const documents=[...selected.map(s=>s.doc),...aliases,...descendants];
 if(documents.length>450)throw Error('Unexpectedly large deletion; inspect linked records');
 fs.mkdirSync('tmp/listed-student-deletion',{recursive:true});
 fs.writeFileSync('tmp/listed-student-deletion/backup.json',JSON.stringify({createdAt:new Date().toISOString(),targets,documents},null,2));
 for(const s of selected){
  await request('https://identitytoolkit.googleapis.com/v1/projects/basaya/accounts:delete',{method:'POST',body:JSON.stringify({localId:s.uid})});
  console.log('Deleted sign-in: '+s.name);
 }
 await request(base+':commit',{method:'POST',body:JSON.stringify({writes:documents.map(d=>({delete:d.name,currentDocument:{updateTime:d.updateTime}}))})});
 const remainingUsers=(await list('users')).filter(d=>uids.has(d.name.split('/').pop()));
 const remainingAliases=(await Promise.all(['usernames','learnerNumbers'].map(list))).flat().filter(d=>uids.has(data(d).uid));
 const remainingAuth=await request('https://identitytoolkit.googleapis.com/v1/projects/basaya/accounts:lookup',{method:'POST',body:JSON.stringify({localId:[...uids]})});
 if(remainingUsers.length||remainingAliases.length||remainingAuth.users?.length)throw Error('Deletion verification failed');
 const result={deleted:targets,profileCount:selected.length,aliasCount:aliases.length,descendantCount:descendants.length,verified:true};
 fs.writeFileSync('tmp/listed-student-deletion/result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
