import assert from 'node:assert/strict';
const base='https://basaya-notify-api.vercel.app/api/student-accounts';
for(const origin of ['http://localhost','http://127.0.0.1','https://basaya.onrender.com']) {
  const response=await fetch(base,{method:'OPTIONS',headers:{Origin:origin},signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,204);
  assert.equal(response.headers.get('x-basaya-student-accounts'),'access-v1');
  assert.equal(response.headers.get('access-control-allow-origin'),origin);
}
for(const action of ['create','deactivate','reactivate']) {
  const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,studentIds:['deployment-probe-not-a-real-account']}),signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,401);
  assert.equal(response.headers.get('x-basaya-student-accounts'),'access-v1');
  assert.match(response.headers.get('cache-control'),/no-store/);
}
console.log('PASS: live student account access API, local/web CORS, private responses and authentication requirements. No real accounts changed.');
