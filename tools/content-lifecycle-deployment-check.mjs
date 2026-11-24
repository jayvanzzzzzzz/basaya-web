import assert from 'node:assert/strict';
const base = 'https://basaya-notify-api.vercel.app/api/content-lifecycle';
for (const origin of ['http://localhost', 'http://127.0.0.1', 'https://basaya.onrender.com']) {
  const preflight = await fetch(base, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' }, signal: AbortSignal.timeout(30000) });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
}
const denied = await fetch(base, { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(30000) });
assert.equal(denied.status, 401);
assert.equal(denied.headers.get('access-control-allow-origin'), 'http://localhost');
assert.equal((await fetch(base, { signal: AbortSignal.timeout(30000) })).status, 405);
console.log('PASS: live archive route, localhost/hosted preflight, authentication and method checks. No lessons changed.');
