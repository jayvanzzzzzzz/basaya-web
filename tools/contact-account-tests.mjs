import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {startFirestoreTestServer} from './firestore-test-server.mjs';
import * as cooldown from '../notify-api/lib/contactCooldown.js';
const emulator=await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST=emulator.host;
const require=createRequire(new URL('../notify-api/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const app=initializeApp({projectId:emulator.project},'contact-account-tests'),db=getFirestore(app);
let sends=0,failMail=false;
const context=vm.createContext({Date,Buffer,console:{error(){}}});
const dependencies={
 '../lib/firebase.js':{db:()=>db},
 '../lib/http.js':{allowCors(){},requireUser:async(req,res)=>{if(req.uid)return req.uid;res.status(401).json({error:'Not signed in'});return null;}},
 '../lib/contactCooldown.js':cooldown,
 '../lib/emails.js':{contactEmail:()=>({subject:'Mock mail',text:'Mock body'})},
 '../lib/mailer.js':{contactInbox:()=> 'fixture@example.test',sendMail:async()=>{if(failMail)throw Error('Synthetic mail failure');sends++;}},
};
const module=new vm.SourceTextModule(await readFile(new URL('../notify-api/api/contact.js',import.meta.url),'utf8'),{context});
await module.link(name=>{const exports=dependencies[name];assert.ok(exports,name);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value)},{context})});await module.evaluate();
async function request(uid,body) {
 const result={code:200,headers:{},setHeader(key,value){this.headers[key]=value},status(code){this.code=code;return this},json(body){this.body=body;return this},end(){}};
 await module.namespace.default({method:'POST',headers:{},uid,body},result);return result;
}
const message={name:'Test Account',email:'reply@example.test',topic:'Feedback',message:'Synthetic message that is never emailed.'};
try{
 for(const uid of ['one','two','failed'])await db.doc('users/'+uid).set({role:'student'});
 assert.equal((await request(null,message)).code,401);
 assert.equal((await request(null,{action:'status'})).code,401);
 assert.equal((await request('one',{...message,message:'x'})).code,400);
 assert.equal(await cooldown.contactRetryAt(db,'one'),0,'Validation never consumes a slot');
 const results=await Promise.all([request('one',message),request('one',{...message,email:'another@example.test'})]);
 assert.deepEqual(results.map(r=>r.code).sort(),[200,429]);assert.equal(sends,1,'Concurrent requests from an account send only once');
 const accepted=results.find(r=>r.code===200),blocked=results.find(r=>r.code===429);
 assert.ok(accepted.body.retryAt>Date.now()+3590000);assert.equal(blocked.body.retryAt,accepted.body.retryAt);assert.ok(Number(blocked.headers['Retry-After'])>3500);
 assert.equal((await request('one',{action:'status'})).body.retryAt,accepted.body.retryAt,'Status survives browser reload and never consumes another hour');
 assert.equal((await request('two',message)).code,200,'Another account on the same IP has its own cooldown');
 failMail=true;assert.equal((await request('failed',message)).code,500);assert.equal(await cooldown.contactRetryAt(db,'failed'),0,'Delivery failure releases its reservation');
 failMail=false;assert.equal((await request('failed',message)).code,200);
 const first=await cooldown.reserveContact(db,'boundary',1000);
 assert.equal((await cooldown.reserveContact(db,'boundary',1000+cooldown.CONTACT_COOLDOWN_MS-1)).allowed,false);
 const next=await cooldown.reserveContact(db,'boundary',1000+cooldown.CONTACT_COOLDOWN_MS);
 assert.equal(next.allowed,true,'Exactly one hour unlocks another submission');
 await cooldown.releaseContact(db,'boundary',first.claimId);
 assert.equal(await cooldown.contactRetryAt(db,'boundary'),next.retryAt,'An old failure cannot erase a newer cooldown');
 const response=await fetch(`${emulator.documents}/contactAccountLimits/one`,{headers:{Authorization:'Bearer '+emulator.token('one')}});
 assert.equal(response.status,403,'Clients cannot inspect or reset server-owned cooldown documents');
 console.log('PASS: authenticated contact, per-account isolation, concurrent submissions, reply-email changes, exact one-hour boundary, persistent status, failure/retry and protected cooldown records. Mail mocked; no real messages sent.');
}finally{await db.terminate();await deleteApp(app);await emulator.stop()}
