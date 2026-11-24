import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { advanceReading } from '../student/fluencyStore.js';
const storage=new Map(), receipts=new Map(), uploaded=[];
let offline=false, loseResponse=false, wordAccepted=true, legacyServer=false, invalidAcceptance=false, wordRequests=0;
let server={wordVerification:1,revision:0,page:0,word:0,stage:'words',status:'draft',clips:[null,null],pages:[{sentence:'May bahay.',words:[{word:'May'},{word:'bahay'}]},{sentence:'Malaki.',words:[]}]};
const student={uid:'student',profile:{progressSession:'session'}};
const context=vm.createContext({location:{hostname:'localhost'},structuredClone,crypto:{randomUUID},navigator:{onLine:true},Uint8Array,btoa:value=>Buffer.from(value,'binary').toString('base64'),AbortSignal,Date});
const module=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context});
const data=module({student,classId:()=> 'class'});
const drafts=module({advanceReading,readingDraft:async(key,value)=>{
  if(value===undefined)return storage.has(key)?structuredClone(storage.get(key)):undefined;
  storage.set(key,structuredClone(value));return value;
}});
const api=module({postToApi:async(_path,body)=>{
  if(offline)throw Error('Offline');
  const op=body.operation.replace('fluency-','');
  if(op==='begin'){const result=structuredClone(server);if(legacyServer)delete result.wordVerification;return result;}
  if(receipts.has(body.eventId))return structuredClone(receipts.get(body.eventId));
  if(body.revision!==server.revision)throw Object.assign(new Error('Progress changed'),{status:409});
  if(op==='word') {
    assert.equal(body.speechDebug,context.location.hostname==='localhost'?true:undefined,'Only localhost requests temporary speech diagnostics');
    wordRequests++;
    assert.ok(body.audio,'A Get Ready attempt sends recorded audio to the server');
    if(invalidAcceptance)return{...structuredClone(server),wordAccepted:'true'};
    if(!wordAccepted)return{...structuredClone(server),wordAccepted:false};
  }
  if(op==='upload')uploaded.push(Buffer.from(body.audio,'base64').toString());
  server=advanceReading(server,op,{eventId:body.eventId});
  const accepted={...structuredClone(server),...(op==='word'?{wordAccepted:true}:{})};
  receipts.set(body.eventId,accepted);
  if(loseResponse){loseResponse=false;throw Error('Lost response')}
  return accepted;
}});
const source=new vm.SourceTextModule(await readFile(new URL('../student/fluencySession.js',import.meta.url),'utf8'),{context});
await source.link(name=>name.endsWith('data.js')?data:name.endsWith('api.js')?api:drafts);
await source.evaluate();
const open=()=>source.namespace.openReading({id:'lesson'});
let session=await open();
const voice=()=>({eventId:randomUUID(),blob:new Blob(['spoken word'])});
legacyServer=true;
for(let retry=0;retry<3;retry++)await assert.rejects(session.checkWord(voice()),error=>error.code==='WORD_VERIFICATION_UNAVAILABLE');
assert.equal(wordRequests,0,'Old API receives no word mutation even with a cached capability');
assert.equal(session.state.word,0);assert.equal(server.word,0);
legacyServer=false;invalidAcceptance=true;
await assert.rejects(session.checkWord(voice()),error=>error.code==='WORD_VERIFICATION_UNAVAILABLE');
assert.equal(session.state.word,0,'A truthy string is not a verified acceptance');
invalidAcceptance=false;wordAccepted=false;
for(let retry=0;retry<10;retry++) {
  await session.checkWord(voice());assert.equal(session.state.word,0,'Repeated wrong speech stays on the current word');
  assert.equal(server.word,0);assert.equal(server.revision,0);
}
context.location.hostname='basaya.onrender.com';await session.checkWord(voice());assert.equal(session.state.word,0);
context.location.hostname='localhost';wordAccepted=true;
await session.checkWord(voice());
await assert.rejects(session.act('word'),/masuri/);
context.navigator.onLine=false;offline=true;
session=await open();assert.equal(session.state.word,1,'Reopen at the second verified Get Ready word');
await assert.rejects(session.checkWord(voice()),/Offline/);
assert.equal(session.state.word,1);assert.equal(session.pending,0,'Unverified attempts are never queued as completed words');
context.navigator.onLine=true;offline=false;loseResponse=true;
await assert.rejects(session.checkWord(voice()),/Lost response/);
assert.equal(session.state.word,1,'A lost response does not optimistically advance');
await assert.rejects(session.checkWord(voice()),/Na-update/);
assert.equal(session.state.stage,'sentence','Reconcile a server-confirmed correct attempt after a lost acknowledgment');
await session.act('listen');
await session.act('upload',{eventId:randomUUID(),blob:new Blob(['first take'])});
await session.act('upload',{eventId:randomUUID(),blob:new Blob(['second take'])});
await session.sync();
assert.deepEqual(uploaded,['first take','second take'],'Each queued retake retains its original audio');
session=await open();assert.equal(session.state.stage,'preview');
assert.equal(await session.clip(0).blob.text(),'second take');
await session.act('next');
context.navigator.onLine=false;offline=true;
session=await open();assert.equal(session.state.page,1);assert.equal(session.state.stage,'sentence');
student.uid='another-student';
await assert.rejects(session.act('listen'),/account/);
assert.equal(session.state.stage,'sentence');
console.log('PASS: verified word advancement, wrong/offline attempts stay put, exact-word resume, lost-response recovery, retained retake audio, saved preview, next-page recovery, account isolation');
