import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { dictionaryAttribution, dictionaryLastName, canManageDictionaryWord } from '../js/dictionaryAttribution.js';

const added = { source: 'teacher', createdBy: 'other-person', createdByName: 'Ana Dela Cruz', createdByRole: 'teacher', createdByLastName: 'Dela Cruz', edited: false };
assert.equal(dictionaryAttribution(added), 'Added by Teacher Dela Cruz');
assert.equal(dictionaryAttribution({...added, edited:true, updatedByRole:'admin', updatedByName:'Juan Santos'}), 'Edited by Admin');
assert.equal(dictionaryAttribution({...added, edited:true, updatedByRole:'teacher', updatedByLastName:'Reyes'}), 'Edited by Teacher Reyes');
assert.equal(dictionaryAttribution({...added, createdByRole:'admin'}), 'Added by Admin');
assert.equal(dictionaryAttribution({source:'wiktionary'}), '');
assert.equal(dictionaryAttribution({...added, edited:undefined, createdAt:{seconds:1}, updatedAt:{seconds:2}}), 'Edited by Teacher Dela Cruz');
for (const name of ['Ana Dela Cruz', 'Dela Cruz, Ana', 'Ana Dela Cruz Jr.']) assert.equal(dictionaryLastName(name), 'Dela Cruz');
for (const role of ['teacher','admin']) {
  assert.ok(canManageDictionaryWord(added, role));
  assert.equal(canManageDictionaryWord({source:'wiktionary'},role), false);
}
assert.equal(canManageDictionaryWord(added, 'student'), false);

// Exercise real data-layer writes with fake Firestore; no production writes.
let writes = [], records = new Map();
const firestore = new vm.SyntheticModule(['collection','deleteDoc','doc','getDoc','getDocs','limit','orderBy','query','serverTimestamp','setDoc','where','writeBatch'], function() {
 const fns = {collection:()=>({}), doc:(_, key)=>key, getDoc:async key=>({id:key,exists:()=>records.has(key),data:()=>records.get(key)}),
 getDocs:async()=>({docs:[...records].map(([id,data])=>({id,data:()=>data}))}), serverTimestamp:()=>({seconds:5}),
 setDoc:async(key,data)=>writes.push({key,data}), deleteDoc:async key=>writes.push({deleted:key}),
 writeBatch:()=>({set:(key,data)=>writes.push({key,data}),delete:key=>writes.push({deleted:key}),commit:async()=>{}}), limit:()=>{},orderBy:()=>{},query:()=>{},where:()=>{}};
 for (const [name,fn] of Object.entries(fns)) this.setExport(name,fn);
});
const cache = new Map();
async function getModule(url) {
 if(cache.has(url)) return cache.get(url);
 const mod = new vm.SourceTextModule(await readFile(new URL(url),'utf8'), {identifier:url,initializeImportMeta:meta=>{meta.url=url;}});
 cache.set(url,mod);
 await mod.link(async spec=> {
  if(spec.startsWith('https:')) return firestore;
  if(spec==='./firebase.js') return new vm.SyntheticModule(['db'],function(){this.setExport('db',{});});
  return getModule(new URL(spec,url).href);
 }); return mod;
}
const oldFetch=globalThis.fetch;
globalThis.fetch=async()=>{await new Promise(resolve=>setTimeout(resolve,10));return {ok:true,json:async()=>[{w:'bahay',k:'bahay',s:[{p:'',d:['House']}]}]};};
try {
 const dictionary=await getModule(new URL('../js/dictionary.js',import.meta.url).href);await dictionary.evaluate();
 const {saveWord,deleteWord,renameWord,allWords,searchWords}=dictionary.namespace;
 records.set('bahay',{word:'bahay',senses:[],createdBy:'teacher'});
 assert.equal((await searchWords('bah'))[0].source,'wiktionary','First search classifies old corrections after the seed loads');
 records.delete('bahay');
 const teacher={user:{uid:'teacher'},name:'Ana Dela Cruz',profile:{role:'teacher',lastName:'Dela Cruz'}};
 const fields={word:'new-word',senses:[{pos:'',definitions:['Meaning'],examples:[]}]};
 await saveWord(fields,teacher);
 assert.equal(writes.at(-1).data.createdByRole,'teacher');assert.equal(writes.at(-1).data.createdByLastName,'Dela Cruz');assert.equal(writes.at(-1).data.edited,false);
 records.set('new-word',{...writes.at(-1).data,createdBy:'someone-else'});
 await saveWord(fields,{...teacher,user:{uid:'admin'},profile:{role:'admin'}});
 assert.equal(writes.at(-1).data.createdBy,'someone-else');assert.equal(writes.at(-1).data.updatedByRole,'admin');assert.equal(writes.at(-1).data.edited,true);
 const count=writes.length;
 await assert.rejects(saveWord({...fields,word:'bahay'},teacher),/Imported/);
 await assert.rejects(deleteWord({source:'wiktionary',key:'bahay'},teacher),/Imported/);
 await assert.rejects(deleteWord({source:'teacher',key:'bahay'},teacher),/Imported/);
 await assert.rejects(saveWord(fields,{...teacher,profile:{role:'student'}}),/Only teachers/);
 await assert.rejects(renameWord({...added,key:'new-word'},{...fields,word:'bahay'},{...teacher,profile:{role:'admin'}}),/already exists/);
 assert.equal(writes.length,count);
 await deleteWord({...added,key:'new-word'},teacher);assert.equal(writes.at(-1).deleted,'new-word');
 records.set('bahay',{word:'bahay',senses:[],createdBy:'teacher'});
 assert.equal((await allWords()).find(e=>e.key==='bahay').source,'wiktionary');
} finally {globalThis.fetch=oldFetch;}
console.log('PASS dictionary attribution, both staff roles, student denial, immutable imports, legacy imports, creator preservation and editor stamps');
