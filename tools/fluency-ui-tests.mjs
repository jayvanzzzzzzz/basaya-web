import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setImmediate as flush } from 'node:timers/promises';
import { advanceReading } from '../student/fluencyStore.js';
const require=createRequire(new URL('../notify-api/package.json',import.meta.url));
const {parseHTML}=require('linkedom');
const {document,window}=parseHTML('<html><body><main></main></body></html>');
let state={revision:0,page:0,word:1,stage:'words',status:'draft',pages:[{sentence:'May magandang bahay.',audioUrl:'https://model/1',words:[{word:'May'},{word:'magandang'}]},{sentence:'Malaki ang bahay.',audioUrl:'https://model/2',words:[{word:'Malaki'}]}],clips:[null,null]};
const clips={},leaves=[];
let recorded=0, microphoneClosed=0;
const session={get state(){return state},pending:0,clip:page=>clips[page],sync:async()=>{},act:async(op,clip)=>{if(clip)clips[state.page]=clip;state=advanceReading(state,op,clip)},submit:async()=>{state.status='submitted'},playback:async()=> 'https://private/recording'};
const $=(selector,root=document)=>root.querySelector(selector);
const context=vm.createContext({document,window,console,Blob,AbortController,structuredClone,setTimeout,clearTimeout,crypto:{randomUUID:()=>`record-${++recorded}`},URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},SpeechSynthesisUtterance:class{},Audio:class{
  pause(){} play(){queueMicrotask(()=>this.onended?.());return Promise.resolve()}
}});
window.Element.prototype.pause=()=>{};
const module=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[key,value]of Object.entries(exports))this.setExport(key,value)},{context});
const helpers=module({$,escapeHtml:value=>String(value),navigate(){}});
const ui=module({content:()=>document.querySelector('main'),icon:()=>'<svg></svg>',talkingBuddy:()=>'<div class="st-reading__buddy"></div>',setTalking(){}});
const router=module({onLeave:fn=>leaves.push(fn)});
const speech=module({Microphone:class{
  async open(){return'ok'}
  record(level,cancel,release){return new Promise(resolve=>{release.addEventListener('abort',()=>resolve({wav:new Blob(['voice'])}),{once:true});cancel.addEventListener('abort',()=>resolve({cancelled:true}),{once:true})})}
  close(){microphoneClosed++}
}});
const data=module({invalidateStudentData(){}});
const service=module({openReading:async()=>session});
const controller=new vm.SourceTextModule(await readFile(new URL('../student/views/fluency.js',import.meta.url),'utf8'),{context});
await controller.link(name=>name.endsWith('helpers.js')?helpers:name.endsWith('ui.js')?ui:name.endsWith('router.js')?router:name.endsWith('speech.js')?speech:name.endsWith('data.js')?data:service);
await controller.evaluate();
await controller.namespace.renderFluency({id:'lesson'});
assert.match($('.st-reading__card-label').textContent,/SALITA 2/);
assert.equal($('.st-reading__top > strong').textContent,'1/2');
assert.equal(document.querySelector('.st-lives'),null,'Word warmup has no lives');
const event=(type,fields={})=>Object.assign(new window.Event(type,{bubbles:true,cancelable:true}),fields);
async function hold(){
  $('[data-reading-mic]').dispatchEvent(event('pointerdown',{pointerType:'mouse',button:0,pointerId:1}));
  await flush();
  assert.equal($('[data-reading-mic]').getAttribute('aria-pressed'),'true');
  $('[data-reading-mic]').dispatchEvent(event('pointerup'));
  await flush();await flush();
}
await hold(); assert.equal(state.stage,'sentence');
assert.ok($('[data-reading-mic]').disabled,'Listen to sentence model before recording');
$('[data-reading-listen]').dispatchEvent(event('click'));await flush();await flush();
assert.equal(state.stage,'record');
await hold();assert.equal(state.stage,'preview');
assert.ok($('#reading-preview').src.startsWith('blob:'));
const first=state.clips[0].eventId;
await hold();assert.notEqual(state.clips[0].eventId,first,'Retake replaces the selected clip');
$('[data-reading-next]').dispatchEvent(event('click'));await flush();await flush();
assert.equal(state.page,1);assert.equal(state.word,0);assert.equal(state.stage,'words');
assert.equal($('.st-reading__top > strong').textContent,'2/2');
await hold();
$('[data-reading-listen]').dispatchEvent(event('click'));await flush();await flush();
await hold();
assert.match($('[data-reading-next]').textContent,/Tapusin at ipasa/);
$('[data-reading-next]').dispatchEvent(event('click'));await flush();await flush();
assert.equal(state.status,'submitted');
assert.match(document.querySelector('main').textContent,/Pakikinggan ng iyong guro/);
leaves.forEach(fn=>fn());assert.ok(microphoneClosed);
console.log('PASS: hold/release for warmup and sentence, page counter, model listening gate, audio preview, retake, next page, final submit, microphone cleanup');
