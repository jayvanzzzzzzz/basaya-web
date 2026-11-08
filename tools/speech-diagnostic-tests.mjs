import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const context=vm.createContext({console});
const module=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[key,value]of Object.entries(exports))this.setExport(key,value)},{context});
let options,calls=0,signedIn=true;
const sdk=module({db:()=>({})});
const http=module({allowCors(){},requireUser:async(_req,res)=>{if(!signedIn){res.status(401).json({error:'Not signed in'});return null}return 'student'}});
const assessment=module({AssessmentError:class extends Error{},assessmentOperation(){throw Error('Unexpected operation')}});
const speech=module({submitSpeech(){throw Error('Unexpected legacy request')}});
const fluency=module({fluencyOperation:async(...args)=>{calls++;options=args[5];return{wordAccepted:false}}});
const dictionary=module({dictionaryAudioOperation(){throw Error('Unexpected dictionary request')}});
const handler=new vm.SourceTextModule(await readFile(new URL('../notify-api/handlers/assessment.js',import.meta.url),'utf8'),{context});
await handler.link(name=>name.endsWith('firebase.js')?sdk:name.endsWith('http.js')?http:name.endsWith('assessments.js')?assessment:name.endsWith('assessmentSpeech.js')?speech:name.endsWith('fluency.js')?fluency:dictionary);await handler.evaluate();
const run=async(origin,speechDebug)=>{
  const res={code:0,status(code){this.code=code;return this},json(body){this.body=body;return this},setHeader(){}};
  await handler.namespace.default({method:'POST',headers:{origin,authorization:'Bearer synthetic'},body:{operation:'fluency-word',speechDebug}},res);
  return res;
};
for(const [origin,requested,expected]of [
  ['http://localhost',true,true],['http://127.0.0.1',true,true],['http://localhost:8080',true,true],
  ['http://localhost',false,false],['http://localhost','true',false],
  ['https://basaya.onrender.com',true,false],['http://localhost.evil.test',true,false],
  ['http://localhost/path',true,false],[undefined,true,false],
]) {assert.equal((await run(origin,requested)).code,200);assert.equal(options.includeRecognizedText,expected,`${origin} / ${requested}`)}
signedIn=false;const before=calls;assert.equal((await run('http://localhost',true)).code,401);assert.equal(calls,before);
console.log('PASS: temporary diagnostic requires authentication, explicit opt-in and localhost origin');
