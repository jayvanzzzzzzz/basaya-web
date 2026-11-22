import assert from 'node:assert/strict';
const base='https://basaya-notify-api.vercel.app/api';
for(const operation of ['save','login']) {
  for(const origin of ['http://localhost','https://basaya.onrender.com']) {
    const response=await fetch(`${base}/username-${operation}`,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'},signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,204,`${operation} preflight`);
    assert.equal(response.headers.get('access-control-allow-origin'),origin);
  }
}
const save=await fetch(`${base}/username-save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'deployment_probe',password:'not-a-real-password'}),signal:AbortSignal.timeout(30000)});
assert.equal(save.status,401,'Saving requires authentication');
assert.match(save.headers.get('cache-control'),/no-store/);
const username=`probe_${crypto.randomUUID().replaceAll('-','').slice(0,20)}`;
const login=await fetch(`${base}/username-login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'not-a-real-password'}),signal:AbortSignal.timeout(30000)});
assert.equal(login.status,401,'Unknown usernames do not authenticate');
assert.deepEqual(await login.json(),{error:'Incorrect LRN, username, or password.'});
assert.match(login.headers.get('cache-control'),/no-store/);
const alias=await fetch(`https://firestore.googleapis.com/v1/projects/basaya/databases/(default)/documents/usernames/${username}`,{signal:AbortSignal.timeout(30000)});
assert.equal(alias.status,403,'Username aliases cannot be read publicly');
console.log('PASS: production API routes, web/local CORS, authentication requirements, generic login failure, no-store responses, and private Firestore aliases.');
if(process.argv.includes('--web')) {
  for(const [path,expected] of [
    ['index.html','LRN, username, or staff email'],
    ['js/login.js','signInWithCustomToken'],
    ['js/username-auth.js','usernameRequest'],
    ['teacher/views/accountSettings.js','account-username-form'],
    ['offline-shell.js','js/username-auth.js'],
  ]) {
    const response=await fetch(`https://basaya.onrender.com/${path}?username-deployment=${Date.now()}`,{signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,200,`Published ${path}`);
    assert.ok((await response.text()).includes(expected),`Current username implementation in ${path}`);
    console.log(`PASS published ${path}`);
  }
}
