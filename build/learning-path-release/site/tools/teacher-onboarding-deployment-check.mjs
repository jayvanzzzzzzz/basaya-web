import assert from 'node:assert/strict';
const base = 'https://basaya-notify-api.vercel.app/api/teacher-onboarding';
for (const origin of ['http://localhost', 'http://127.0.0.1', 'https://basaya.onrender.com']) {
  const response = await fetch(base, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' }, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 204, `Preflight status for ${origin}`);
  assert.equal(response.headers.get('x-basaya-teacher-accounts'), 'deactivation-v3', 'Production supports teacher access actions');
  assert.equal(response.headers.get('access-control-allow-origin'), origin, `CORS for ${origin}`);
  console.log(`PASS preflight ${origin}`);
}
const unauthenticated = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' }, body: JSON.stringify({ action: 'create' }), signal: AbortSignal.timeout(20000) });
assert.equal(unauthenticated.status, 401);
assert.equal(unauthenticated.headers.get('access-control-allow-origin'), 'http://localhost');
console.log('PASS teacher onboarding requires sign-in and returns CORS headers');
for (const action of ['deactivate', 'reactivate', 'cleanup-classes']) {
  const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, userId: 'deployment-check-no-real-account' }), signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('x-basaya-teacher-accounts'), 'deactivation-v3');
  console.log(`PASS deployed ${action} endpoint requires authentication; no accounts changed`);
}
for (const path of ['verify-teacher.html', 'js/verify-teacher.js', 'js/teacher-name.js']) {
  const response = await fetch(`https://basaya.onrender.com/${path}`, { signal: AbortSignal.timeout(20000) });
  console.log(`WEB ${path}: ${response.status}`);
}
