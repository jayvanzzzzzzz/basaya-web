import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import * as crypto from "node:crypto";
import { startFirestoreTestServer } from "./firestore-test-server.mjs";

const rows = new Map([["users/admin", { role: "admin" }], ["users/student", { role: "student" }]]);
const users = new Map();
let mailFails = false, profileFails = false, sent = 0, sequence = 0;
const snapshot = path => ({ exists: rows.has(path), get: key => rows.get(path)?.[key], data: () => rows.get(path), ref: ref(path) });
const ref = path => ({ path, get: async () => snapshot(path), update: async data => rows.set(path, { ...rows.get(path), ...data }) });
const database = {
  doc: ref,
  batch: () => {
    const tasks = [];
    return { set: (r, data) => tasks.push(() => rows.set(r.path, data)), update: (r, data) => tasks.push(() => rows.set(r.path, { ...rows.get(r.path), ...data })), delete: r => tasks.push(() => rows.delete(r.path)), commit: async () => { if (profileFails) throw Error("write failed"); tasks.forEach(task => task()); } };
  },
  runTransaction: async run => run({ get: async r => snapshot(r.path), update: (r, data) => rows.set(r.path, { ...rows.get(r.path), ...data }) }),
};
const authentication = {
  verifyIdToken: async uid => ({ uid, auth_time: Date.now() / 1000 }),
  createUser: async data => {
    if ([...users.values()].some(u => u.email === data.email)) throw Object.assign(Error(), { code: "auth/email-already-exists" });
    const user = { ...data, uid: `teacher${++sequence}` }; users.set(user.uid, user); return user;
  },
  getUser: async uid => users.get(uid),
  getUsers: async ids => ({ users: ids.map(({ uid }) => users.get(uid)).filter(Boolean) }),
  updateUser: async (uid, data) => { users.set(uid, { ...users.get(uid), ...data }); return users.get(uid); },
  deleteUser: async uid => users.delete(uid),
  generateEmailVerificationLink: async () => "https://firebase.example/action?oobCode=secure-test-code",
};
const context = vm.createContext({ console, process, URL, Date, Buffer });
const modules = new Map();
function synthetic(name, exports) {
  return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context, identifier: name });
}
async function load(url) {
  const key = url.href;
  if (modules.has(key)) return modules.get(key);
  let module;
  if (key.endsWith('/lib/firebase.js')) module = synthetic(key, { db: () => database, adminAuth: () => authentication });
  else if (key.endsWith('/lib/mailer.js')) module = synthetic(key, { sendMail: async data => {
    if (mailFails) throw Error("mail unavailable");
    assert.match(data.text, /verify-teacher.html\?oobCode=secure-test-code/);
    assert.match(data.html, /Verify my email/);
    assert.match(data.html, /href="https:\/\/[^\"]+\/verify-teacher.html\?oobCode=secure-test-code"/);
    assert.ok(!data.html.includes('Temporary1'), 'Never include the temporary password in the verification email');
    sent++;
  } });
  else if (url.protocol === 'node:') module = synthetic(key, crypto);
  else module = new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: key });
  modules.set(key, module);
  await module.link((specifier, parent) => load(new URL(specifier, parent.identifier)));
  return module;
}
const module = await load(new URL('../notify-api/handlers/teacher-onboarding.js', import.meta.url));
await module.evaluate();
const handler = module.namespace.default;
async function request(body, uid = 'admin') {
  const result = { code: 200, body: null };
  const res = { setHeader() {}, status(code) { result.code = code; return this; }, json(data) { result.body = data; return this; }, end() {} };
  await handler({ method: 'POST', headers: { authorization: `Bearer ${uid}` }, body }, res);
  return result;
}
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
const create = (email, gender = 'female') => request({ action: 'create', firstName: 'Maria', lastName: 'Reyes', gender, email, password: 'Temporary1' });
await test('only admin can create; gender required', async () => {
  assert.equal((await request({ action: 'create' }, 'student')).code, 403);
  assert.equal((await create('invalid@school.edu', '')).code, 400);
  assert.equal((await create('invalid@school.edu', '__proto__')).code, 400);
});
let uid;
await test('creation stores gender and automatic title, pending flags; sends verification', async () => {
  const result = await create('maria@school.edu'); uid = result.body.userId;
  assert.equal(result.body.emailSent, true); assert.equal(sent, 1);
  assert.equal(rows.get(`users/${uid}`).title, 'maam');
  assert.equal(rows.get(`users/${uid}`).mustChangePassword, true);
  assert.equal(rows.get(`users/${uid}`).emailVerificationRequired, true);
  assert.equal(users.get(uid).emailVerified, false);
  assert.equal(rows.get(`users/${uid}`).firstName, 'Maria');
  assert.equal(rows.get(`users/${uid}`).lastName, 'Reyes');
  assert.equal(rows.get(`users/${uid}`).middleName, '');
  assert.equal(rows.get(`users/${uid}`).displayName, 'Maria Reyes');
  assert.ok(rows.has(`teacherInvitations/${uid}`));
  const male = await create('juan@school.edu', 'male');
  assert.equal(rows.get(`users/${male.body.userId}`).title, 'sir');
});
await test('name parts are required, trimmed and composed in first-middle-last order', async () => {
  const input = { action: 'create', firstName: '  Juan Miguel ', lastName: ' Dela Cruz ', middleName: ' Santos ', gender: 'male', email: 'names@school.edu', password: 'Temporary1' };
  assert.equal((await request({ ...input, firstName: ' ' })).code, 400);
  assert.equal((await request({ ...input, lastName: '' })).code, 400);
  const result = await request(input);
  assert.equal(result.code, 200);
  const profile = rows.get(`users/${result.body.userId}`);
  assert.equal(profile.displayName, 'Juan Miguel Santos Dela Cruz');
  assert.equal(profile.firstName, 'Juan Miguel');
  assert.equal(profile.lastName, 'Dela Cruz');
  assert.equal(profile.middleName, 'Santos');
});
await test('duplicate email does not create another account', async () => {
  const count = users.size; assert.equal((await create('maria@school.edu')).code, 400); assert.equal(users.size, count);
});
await test('email delivery failure preserves account and permits retry', async () => {
  mailFails = true;
  const result = await create('retry@school.edu');
  assert.equal(result.code, 200); assert.equal(result.body.emailSent, false);
  assert.ok(rows.has(`users/${result.body.userId}`));
  mailFails = false;
  assert.equal((await request({ action: 'resend', userId: result.body.userId })).code, 200);
});
await test('profile write failure removes orphan auth account', async () => {
  const count = users.size; profileFails = true;
  assert.equal((await create('rollback@school.edu')).code, 500);
  profileFails = false; assert.equal(users.size, count);
});
await test('resend cooldown; teacher cannot resend for someone else', async () => {
  assert.equal((await request({ action: 'resend' }, uid)).code, 429);
  assert.equal((await request({ action: 'resend', userId: uid }, 'student')).code, 403);
});
await test('pending email correction updates auth and profile, sends link', async () => {
  const result = await request({ action: 'correct-email', userId: uid, email: 'corrected@school.edu' });
  assert.equal(result.code, 200); assert.equal(result.body.emailSent, true);
  assert.equal(users.get(uid).email, 'corrected@school.edu'); assert.equal(rows.get(`users/${uid}`).email, 'corrected@school.edu');
});
await test('unverified users cannot complete setup; only admin reads statuses', async () => {
  assert.equal((await request({ action: 'complete', password: 'MyPassword2' }, uid)).code, 403);
  assert.equal((await request({ action: 'statuses', userIds: [uid] }, uid)).code, 403);
  const statuses = await request({ action: 'statuses', userIds: [uid] });
  assert.equal(statuses.body.users[0].emailVerified, false);
});
await test('verified teachers must choose strong, different password', async () => {
  users.get(uid).emailVerified = true;
  assert.equal((await request({ action: 'complete', password: 'weak' }, uid)).code, 400);
  assert.equal((await request({ action: 'complete', password: 'Temporary1' }, uid)).code, 400);
  assert.equal((await request({ action: 'complete', password: 'MyPassword2' }, uid)).code, 200);
  assert.equal(rows.get(`users/${uid}`).mustChangePassword, false);
  assert.equal(rows.has(`teacherInvitations/${uid}`), false);
  assert.equal((await request({ action: 'correct-email', userId: uid, email: 'other@school.edu' })).code, 400);
});
await test('API guard blocks pending accounts and permits legacy/ready accounts', async () => {
  const http = modules.get(new URL('../notify-api/lib/http.js', import.meta.url).href).namespace;
  const pending = [...users.values()].find(u => !u.emailVerified).uid;
  const res = { status(code) { this.code = code; return this; }, json() {} };
  assert.equal(await http.requireUser({ headers: { authorization: `Bearer ${pending}` } }, res), null);
  assert.equal(res.code, 403);
  assert.equal(await http.requireUser({ headers: { authorization: `Bearer ${uid}` } }, res), uid);
  rows.set('users/legacy', { role: 'teacher' });
  assert.equal(await http.requireUser({ headers: { authorization: 'Bearer legacy' } }, res), 'legacy');
});

if (process.argv[2]) {
  const emulator = await startFirestoreTestServer(...process.argv.slice(2));
  const fields = data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value }]));
  const base = emulator.documents;
  const patch = async (path, data, uid, verified = false) => {
    let token = emulator.token(uid || 'unused');
    if (uid && verified) {
      const parts = token.split('.'); const payload = JSON.parse(Buffer.from(parts[1], 'base64url')); payload.email_verified = true;
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url'); token = parts.join('.');
    }
    return fetch(`${base}/${path}?${Object.keys(data).map(key => 'updateMask.fieldPaths=' + key).join('&')}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid ? token : 'owner'}` }, body: JSON.stringify({ fields: fields(data) }) });
  };
  const get = (path, uid) => fetch(`${base}/${path}`, { headers: { Authorization: `Bearer ${emulator.token(uid)}` } });
  try {
    await patch('users/pending', { role: 'teacher', emailVerificationRequired: true, mustChangePassword: true });
    await patch('users/legacy', { role: 'teacher' });
    await patch('lessons/sample', { title: 'Sample lesson' });
    await test('rules deny pending teacher lesson access; preserve legacy access', async () => {
      assert.equal((await get('lessons/sample', 'pending')).status, 403);
      assert.equal((await get('lessons/sample', 'legacy')).status, 200);
    });
    await test('rules prevent clearing required setup flags and reading private password hash', async () => {
      assert.equal((await patch('users/pending', { mustChangePassword: false }, 'pending')).status, 403);
      assert.equal((await patch('users/pending', { emailVerificationRequired: false }, 'pending')).status, 403);
      assert.equal((await get('teacherInvitations/pending', 'pending')).status, 403);
      assert.equal((await get('users/pending', 'pending')).status, 200);
    });
    await test('rules require verified token even after password flag is cleared', async () => {
      await patch('users/pending', { mustChangePassword: false });
      assert.equal((await get('lessons/sample', 'pending')).status, 403);
      assert.equal((await patch('classes/own', { teacherId: 'pending', className: 'Test' }, 'pending', true)).status, 200);
    });
    await test('rules enforce automatic titles when gender is saved', async () => {
      assert.equal((await patch('users/legacy', { gender: 'female', title: 'sir' }, 'legacy')).status, 403);
      assert.equal((await patch('users/legacy', { gender: 'female', title: 'maam' }, 'legacy')).status, 200);
      assert.equal((await patch('users/legacy', { title: 'sir' }, 'legacy')).status, 403);
    });
  } finally { await emulator.stop(); }
}
console.log(`${passed} checks passed.`);
