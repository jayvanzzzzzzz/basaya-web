import assert from 'node:assert/strict';
const base='https://basaya-notify-api.vercel.app/api/assessment';
const request=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'fluency-begin',classId:'synthetic',lessonId:'synthetic',progressSession:'synthetic'}),signal:AbortSignal.timeout(20000)});
assert.equal(request.status,401,'Student reading API requires sign-in');
for(const operation of ['dictionary-audio-sync','dictionary-audio-resolve']) {
  const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,lessonId:'synthetic',key:'synthetic'}),signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,401,'Dictionary audio APIs require sign-in');
}
const object='student-readings/synthetic/'+ 'a'.repeat(64) + '/0/00000000-0000-4000-8000-000000000000.wav';
const url='https://basaya-readings.jayvanzsingca5.workers.dev/'+object;
assert.equal((await fetch(url,{signal:AbortSignal.timeout(20000)})).status,403,'Unsigned recordings are private');
assert.equal((await fetch(url,{method:'PUT',body:'synthetic',signal:AbortSignal.timeout(20000)})).status,403,'Only the API can upload recordings');
assert.equal((await fetch(url.replace('/0/','/7/'),{signal:AbortSignal.timeout(20000)})).status,403,'Page eight is supported and protected');
console.log('PASS: deployed reading API authentication, private recording playback, protected recording uploads');
