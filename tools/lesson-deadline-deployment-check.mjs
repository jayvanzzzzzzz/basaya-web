import assert from 'node:assert/strict';
const base='https://basaya-notify-api.vercel.app/api/lesson-deadlines';
for(const origin of ['http://localhost','http://127.0.0.1','https://basaya.onrender.com']) {
 const response=await fetch(base,{method:'OPTIONS',headers:{Origin:origin},signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,204);assert.equal(response.headers.get('x-basaya-deadlines'),'individual-v1');assert.equal(response.headers.get('access-control-allow-origin'),origin);
}
for(const action of ['schedule','extend-students']) {
 const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,classId:'probe',entryId:'probe',studentIds:['probe'],dueAt:Date.now()+86400000}),signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,401);assert.equal(response.headers.get('x-basaya-deadlines'),'individual-v1');
}
console.log('PASS: deployed personal deadline API, localhost/web CORS and authenticated access. No real lessons or accounts changed.');
