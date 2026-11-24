import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const sent = [], generated = [], fallback = [];
let limited = false, apiFails = false;
const users = new Map(['admin', 'teacher'].map(role => [`${role}@example.test`, { uid: role, email: `${role}@example.test` }]));
const context = vm.createContext({ URL, console, process: { env: {} }, fetch: async () => ({ ok: !apiFails, status: apiFails ? 500 : 200, json: async () => apiFails ? { error: 'Mail unavailable' } : { ok: true } }) });
const modules = new Map();
async function load(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let exports;
  if (url.href.includes('firebase-auth.js')) exports = { sendPasswordResetEmail: async (_auth, email) => fallback.push(email) };
  else if (url.pathname.endsWith('/notify-api/lib/firebase.js')) exports = {
    adminAuth: () => ({ getUserByEmail: async email => { if (users.has(email)) return users.get(email); throw Object.assign(Error(), { code: 'auth/user-not-found' }); }, generatePasswordResetLink: async email => { generated.push(email); return 'https://basaya.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=fixture-code'; } }),
    db: () => ({ doc: path => ({ get: async () => ({ get: key => key === 'role' ? path.split('/')[1] : key === 'displayName' ? 'Test User' : undefined }) }) }),
  };
  else if (url.pathname.endsWith('/lib/mailer.js')) exports = { sendMail: async message => sent.push(message) };
  else if (url.pathname.endsWith('/lib/http.js')) exports = { allowCors: () => {} };
  else if (url.pathname.endsWith('/lib/rateLimit.js')) exports = { withinRateLimit: async () => !limited };
  else if (url.pathname.endsWith('/js/firebase.js')) exports = { auth: { currentUser: null } };
  else if (url.pathname.endsWith('/firebase-config.js')) exports = { notifyApiUrl: 'https://fixture.invalid' };
  const module = exports ? new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context, identifier: url.href }) : new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href });
  modules.set(url.href, module);
  if (!exports) await module.link((specifier, parent) => load(new URL(specifier, parent.identifier)));
  return module;
}
const handler = await load(new URL('../notify-api/api/forgot-password.js', import.meta.url));
await handler.evaluate();
async function request(email) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler.namespace.default({ method: 'POST', body: { email } }, res);
  return res;
}
for (const role of ['admin', 'teacher']) {
  const email = `${role}@example.test`;
  assert.equal((await request(` ${email.toUpperCase()} `)).code, 200);
  assert.equal(generated.at(-1), email);
  assert.equal(sent.at(-1).to, email);
  assert.ok(sent.at(-1).text.includes(`${role} account`));
  assert.ok(sent.at(-1).text.includes('https://basaya.onrender.com/reset-password.html?oobCode=fixture-code'));
}
assert.equal((await request('unknown@example.test')).code, 200);
assert.equal(sent.length, 2, 'Unknown accounts send no email');
assert.equal((await request('invalid')).code, 400);
limited = true;
assert.equal((await request('teacher@example.test')).code, 429);
const api = await load(new URL('../js/api.js', import.meta.url));
await api.evaluate();
await api.namespace.sendResetLink('admin@example.test');
assert.equal(fallback.length, 0);
apiFails = true;
for (const role of ['admin', 'teacher']) await api.namespace.sendResetLink(`${role}@example.test`);
assert.deepEqual(fallback, ['admin@example.test', 'teacher@example.test']);
console.log('PASS: real reset handler and email template support admin/teacher emails; normalized lookup, correct reset links, unknown-account privacy, validation, rate limits, and Firebase fallback. No real emails sent.');

if (process.argv.includes('--live')) {
  const base = 'https://basaya-notify-api.vercel.app/api/forgot-password';
  for (const origin of ['http://localhost', 'https://basaya.onrender.com']) {
    const response = await fetch(base, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  const invalid = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'invalid' }), signal: AbortSignal.timeout(30000) });
  assert.equal(invalid.status, 400);
  for (const [path, expected] of [['index.html', 'data-forgot-open'], ['js/forgot-password.js', 'sendResetLink(email)'], ['js/api.js', 'sendPasswordResetEmail(auth, email)'], ['reset-password.html', 'reset-form'], ['js/reset-password.js', 'confirmPasswordReset(auth, code, password.value)']]) {
    const response = await fetch(`https://basaya.onrender.com/${path}`, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(expected), path);
  }
  console.log('PASS: live login/reset pages and scripts, reset API validation, and local/hosted CORS. No reset email requested.');
}
