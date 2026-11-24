import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
let shared='https://basaya-tts.jayvanzsingca5.workers.dev/audio/lessons/lesson/pronunciation/page-0/take-one.mp3';
let offline=false,needsGeneration=false;
const played=[],requests=[],cache=new Map();
const context=vm.createContext({console,AbortSignal,TextEncoder,crypto:webcrypto,localStorage:{getItem:key=>cache.get(key)||null,setItem:(key,value)=>cache.set(key,value),removeItem:key=>cache.delete(key)},
  Audio:class{constructor(url){this.url=url}pause(){}async play(){played.push(this.url);if(needsGeneration&&this.url.includes('/audio/dictionary/'))throw new Error('Missing clip')}},
  fetch:async(url)=>{requests.push(url);needsGeneration=false;return Response.json({audioUrl:'https://basaya-tts.jayvanzsingca5.workers.dev/audio/generated.mp3'})}
});
const module=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context});
const auth=module({auth:{currentUser:{getIdToken:async()=> 'synthetic-token'}}});
const helpers=module({toast(){}});
const api=module({postToApi:async()=>{if(offline)throw Error('Offline');return{audioUrl:shared}}});
const tts=new vm.SourceTextModule(await readFile(new URL('../js/tts.js',import.meta.url),'utf8'),{context});
await tts.link(name=>name.endsWith('firebase.js')?auth:name.endsWith('helpers.js')?helpers:api);await tts.evaluate();
const entry={key:'bahay',word:'bahay',accent:'báhay'};
await tts.namespace.playDictionaryWord(entry);assert.equal(played.at(-1),shared);
shared=shared.replace('take-one','take-two');
await tts.namespace.playDictionaryWord(entry);assert.equal(played.at(-1),shared,'Replacement takes precedence over the previous recording');
offline=true;await tts.namespace.playDictionaryWord(entry);assert.equal(played.at(-1),shared,'Offline playback reuses the last known replacement');
assert.equal(requests.length,0,'Shared Get Ready audio never generates another TTS clip');
offline=false;shared=null;await tts.namespace.playDictionaryWord(entry);
assert.ok(played.at(-1).includes('/audio/dictionary/'));
needsGeneration=true;await tts.namespace.playDictionaryWord(entry);
assert.equal(requests.length,1);assert.ok(requests[0].endsWith('/dictionary-audio'),'Original first-tap generation remains available');
console.log('PASS: reused R2 audio, latest replacement, offline cached replacement, no duplicate synthesis, original first-tap fallback');
