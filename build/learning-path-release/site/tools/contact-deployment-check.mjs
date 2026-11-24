import assert from 'node:assert/strict';
const url='https://basaya-notify-api.vercel.app/api/contact';
for(const origin of ['http://localhost','http://127.0.0.1','https://basaya.onrender.com']) {
 const response=await fetch(url,{method:'OPTIONS',headers:{Origin:origin},signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),origin);
}
for(const body of [{action:'status'},{website:'honeypot'},{name:'Probe',email:'probe@example.test',topic:'Feedback',message:'Unauthenticated probe; must never send.'}]) {
 const response=await fetch(url,{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,401);assert.equal(response.headers.get('x-basaya-contact'),'account-hour-v1');
}
console.log('PASS: deployed account-hour contact API, localhost/hosted CORS, anonymous status and submission rejection. No messages sent.');
