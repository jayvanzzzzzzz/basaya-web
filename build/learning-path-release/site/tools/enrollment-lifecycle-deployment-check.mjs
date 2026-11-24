import assert from 'node:assert/strict';
const url='https://basaya-notify-api.vercel.app/api/class-lifecycle';
for(const origin of ['http://localhost','http://127.0.0.1','https://basaya.onrender.com']) {
 const response=await fetch(url,{method:'OPTIONS',headers:{Origin:origin},signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,204);assert.equal(response.headers.get('x-basaya-class-lifecycle'),'roster-v1');assert.equal(response.headers.get('access-control-allow-origin'),origin);
}
for(const action of ['drop','reenroll','archive','restore']) {
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,classId:'probe',studentId:'probe'}),signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,401);assert.equal(response.headers.get('x-basaya-class-lifecycle'),'roster-v1');
}
console.log('PASS: deployed roster lifecycle API, localhost/hosted CORS and authentication for drop, re-enroll, archive and restore. No real records changed.');
