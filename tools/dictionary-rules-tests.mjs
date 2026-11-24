import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startFirestoreTestServer } from './firestore-test-server.mjs';
const emulator=await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST=emulator.host;
const require=createRequire(new URL('../notify-api/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
const app=initializeApp({projectId:emulator.project});const db=getFirestore(app);
const encode=value=>typeof value==='string'?{stringValue:value}:typeof value==='boolean'?{booleanValue:value}:Array.isArray(value)?{arrayValue:{values:value.map(encode)}}:value instanceof Timestamp?{timestampValue:value.toDate().toISOString()}:{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]))}};
const word={word:'custom',key:'custom',accent:'',syllables:'',senses:[{pos:'',definitions:['Meaning'],examples:[]}],synonyms:[],hidden:false,createdBy:'original',createdByName:'Original Teacher',createdAt:Timestamp.fromMillis(1000),updatedBy:'original',updatedByName:'Original Teacher',updatedAt:Timestamp.fromMillis(1000)};
const remove=uid=>fetch(emulator.documents+'/dictionary/custom',{method:'DELETE',headers:{Authorization:'Bearer '+emulator.token(uid)}});
const save=(uid,role)=>fetch(emulator.documents+':commit',{method:'POST',headers:{Authorization:'Bearer '+emulator.token(uid),'Content-Type':'application/json'},body:JSON.stringify({writes:[{update:{name:`projects/${emulator.project}/databases/(default)/documents/dictionary/custom`,fields:encode({...word,updatedBy:uid,updatedByName:'Ana Dela Cruz',updatedByRole:role,updatedByLastName:'Dela Cruz',edited:true}).mapValue.fields},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}]})});
try {
 for(const [uid,role] of [['teacher','teacher'],['admin','admin'],['student','student']]) await db.doc('users/'+uid).set({role});
 await db.doc('users/disabled').set({role:'teacher',disabled:true});
 for(const [uid,role] of [['teacher','teacher'],['admin','admin']]) {
  await db.doc('dictionary/custom').set(word);
  const result=await save(uid,role);assert.equal(result.status,200,await result.text());
  const deletion=await remove(uid);assert.equal(deletion.status,200,await deletion.text());
 }
 for(const uid of ['student','disabled']) {
  await db.doc('dictionary/custom').set(word);
  const result=await save(uid,'teacher');assert.equal(result.status,403,await result.text());
  assert.equal((await remove(uid)).status,403);
 }
 await db.doc('dictionary/custom').set(word);
 assert.equal((await save('teacher','admin')).status,403,'Teacher cannot stamp themselves as Admin');
 console.log('PASS dictionary Firestore rules: both staff roles edit/delete another creator’s word; student/disabled writes denied; role spoofing denied');
} finally {await db.terminate();await deleteApp(app);await emulator.stop();}
