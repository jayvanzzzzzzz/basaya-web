import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startFirestoreTestServer } from './firestore-test-server.mjs';
const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: emulator.project });
const db = getFirestore(app);
const encode = value => typeof value === 'string' ? { stringValue: value }
  : typeof value === 'boolean' ? { booleanValue: value }
  : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
async function save(uid, role, key, extra = {}, editing = false) {
  const fields = {word:key,key,accent:'',syllables:'',senses:[{pos:'',definitions:['Kahulugan.'],examples:[]}],synonyms:[],hidden:false,
    createdBy:uid,createdByName:'Ana Dela Cruz',createdByRole:role,createdByLastName:'Dela Cruz',
    updatedBy:uid,updatedByName:'Ana Dela Cruz',updatedByRole:role,updatedByLastName:'Dela Cruz',edited:editing,...extra};
  // Match saveWord: preserve the original creator timestamp on edits.
  const existing = editing ? await db.doc('dictionary/'+key).get() : null;
  const encoded = encode(fields).mapValue.fields;
  if (existing?.exists) encoded.createdAt = {timestampValue:existing.data().createdAt.toDate().toISOString()};
  return fetch(emulator.documents+':commit', {method:'POST',headers:{Authorization:'Bearer '+emulator.token(uid),'Content-Type':'application/json'},body:JSON.stringify({writes:[{
    update:{name:`projects/${emulator.project}/databases/(default)/documents/dictionary/${key}`,fields:encoded},
    updateTransforms:[...(!editing ? [{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}] : []),{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}],
  }]})});
}
try {
  for (const role of ['teacher','admin','student']) await db.doc('users/'+role).set({role});
  await db.doc('users/disabled').set({role:'teacher',disabled:true});
  for (const role of ['teacher','admin']) {
    const result = await save(role,role,'new-'+role); assert.equal(result.status,200,await result.text());
    const stored = (await db.doc('dictionary/new-'+role).get()).data();
    assert.equal(stored.createdByRole,role); assert.equal(stored.edited,false);
    const edited = await save(role,role,'new-'+role,{},true); assert.equal(edited.status,200,await edited.text());
    assert.equal((await db.doc('dictionary/new-'+role).get()).data().edited,true);
  }
  for (const [uid,role,extra] of [['student','student',{}],['disabled','teacher',{}],['teacher','admin',{}],['teacher','teacher',{unexpected:'field'}]]) {
    const result = await save(uid,role,'denied-'+uid,extra); assert.equal(result.status,403,await result.text());
  }
  console.log('PASS: teacher/admin create and edit missing words with author fields; student, disabled, role spoofing and unknown fields denied.');
} finally { await db.terminate(); await deleteApp(app); await emulator.stop(); }
