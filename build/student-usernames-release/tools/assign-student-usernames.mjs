// Requires FIREBASE_SERVICE_ACCOUNT. Reports only unless --apply is supplied.
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { db } from '../notify-api/lib/firebase.js';
import { studentUsernameBase, assignStudentUsername } from '../notify-api/lib/studentUsernames.js';
const apply = process.argv.includes('--apply');
let database;
if (process.argv.includes('--firebase-cli')) {
  const require = createRequire(new URL('../notify-api/package.json',import.meta.url));
  const cliAuth = require('C:/Users/Scean Andrei/AppData/Local/npm-cache/_npx/7750544ccf494d8b/node_modules/firebase-tools/lib/auth.js');
  const account = cliAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw Error('Firebase CLI sign-in is unavailable.');
  const token = await cliAuth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
  const {OAuth2Client}=require('google-auth-library');
  const client=new OAuth2Client();
  client.setCredentials({access_token:token.access_token,expiry_date:Date.now()+3000000});
  const {Firestore}=require('@google-cloud/firestore');
  database=new Firestore({projectId:'basaya',authClient:client,preferRest:true});
} else database = db();
try {
  const snapshot = await database.collection('users').where('role','==','student').get();
  const docs = [...snapshot.docs].sort((a,b)=>a.id.localeCompare(b.id));
  const before = docs.map(doc=>({id:doc.id,...doc.data()}));
  const unresolved=[];
  for (const doc of docs) { try { studentUsernameBase(doc.data()); } catch { unresolved.push({id:doc.id,firstName:doc.get('firstName')||'',lastName:doc.get('lastName')||'',fullName:doc.get('fullName')||doc.get('displayName')||''}); } }
  await mkdir('output/student-usernames',{recursive:true});
  await writeFile('output/student-usernames/before.json',JSON.stringify(before,null,2),{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
  await writeFile('output/student-usernames/unresolved.json',JSON.stringify(unresolved,null,2));
  if (unresolved.length) throw Error(`${unresolved.length} students need first/last name review. See private output/student-usernames/unresolved.json. No usernames changed.`);
  const results=[];
  for (const doc of docs) {
    if (apply) results.push(await assignStudentUsername(database,doc.id));
    else results.push({studentId:doc.id,previousUsername:doc.get('username')||null,base:studentUsernameBase(doc.data())});
  }
  await writeFile(`output/student-usernames/${apply?'applied':'preview'}.json`,JSON.stringify(results,null,2));
  if (apply) for (const result of results) {
    const profile=await database.doc(`users/${result.studentId}`).get();
    const alias=await database.doc(`usernames/${result.username}`).get();
    if(profile.get('username')!==result.username || alias.get('uid')!==result.studentId)throw Error('Username verification failed.');
  }
  console.log(JSON.stringify({apply,students:docs.length,changed:apply?results.filter(r=>r.username!==r.previousUsername).length:undefined,verified:apply?results.length:0,report:`output/student-usernames/${apply?'applied':'preview'}.json`}));
} finally { await database.terminate(); }
