import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import * as crypto from "node:crypto";
import { createRequire } from "node:module";
import { startFirestoreTestServer } from "./firestore-test-server.mjs";

const rows = new Map([["users/admin", { role: "admin" }], ["users/student", { role: "student" }]]);
const users = new Map();
let mailFails = false, profileFails = false, sent = 0, sequence = 0, accessWriteFails = false;
const revoked = [];
let generatedLink = "https://firebase.example/action?oobCode=secure-test-code";
const snapshot = path => ({ exists: rows.has(path), get: key => rows.get(path)?.[key], data: () => rows.get(path), ref: ref(path) });
const ref = path => ({ path, get: async () => snapshot(path), update: async data => {
  if (accessWriteFails && 'disabled' in data) throw Error('profile unavailable');
  rows.set(path, { ...rows.get(path), ...data });
} });
let database = {
  doc: ref,
  collection: name => ({ where: (field, operator, value) => ({ collection: name, field, value }) }),
  batch: () => {
    const tasks = [];
    return { set: (r, data) => tasks.push(() => rows.set(r.path, data)), update: (r, data) => tasks.push(() => rows.set(r.path, { ...rows.get(r.path), ...data })), delete: r => tasks.push(() => rows.delete(r.path)), commit: async () => { if (profileFails) throw Error("write failed"); tasks.forEach(task => task()); } };
  },
  runTransaction: async run => {
    const writes=[];
    const result=await run({
      get: async r => r.collection ? { docs:[...rows.keys()].filter(path=>path.startsWith(r.collection+'/') && path.split('/').length===2 && rows.get(path)[r.field]===r.value).map(snapshot) } : snapshot(r.path),
      update: (r,data) => writes.push({r,data}),
    });
    if (accessWriteFails && writes.some(({data})=>'disabled' in data)) throw Error('profile unavailable');
    writes.forEach(({r,data})=>rows.set(r.path,{...rows.get(r.path),...data}));
    return result;
  },
};
const authentication = {
  verifyIdToken: async (uid, checkRevoked) => {
    assert.equal(checkRevoked, true, 'API must check disabled/revoked sessions');
    if (users.get(uid)?.disabled) throw Error('account disabled');
    return { uid, auth_time: Date.now() / 1000 };
  },
  revokeRefreshTokens: async uid => { revoked.push(uid); },
  createUser: async data => {
    if ([...users.values()].some(u => u.email === data.email)) throw Object.assign(Error(), { code: "auth/email-already-exists" });
    const user = { ...data, uid: `teacher${++sequence}` }; users.set(user.uid, user); return user;
  },
  getUser: async uid => users.get(uid),
  getUsers: async ids => ({ users: ids.map(({ uid }) => users.get(uid)).filter(Boolean) }),
  updateUser: async (uid, data) => { users.set(uid, { ...users.get(uid), ...data }); return users.get(uid); },
  deleteUser: async uid => users.delete(uid),
  generateEmailVerificationLink: async () => generatedLink,
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
await test('do not email a broken verification URL when Firebase returns no action code', async () => {
  generatedLink = 'https://firebase.example/action?mode=verifyEmail';
  const count = sent;
  const result = await create('missing-code@school.edu');
  assert.equal(result.code, 200);
  assert.equal(result.body.emailSent, false);
  assert.equal(sent, count);
  generatedLink = 'https://firebase.example/action?oobCode=secure-test-code';
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
await test('admin cannot correct an existing teacher email through the API', async () => {
  const previousEmail = users.get(uid).email;
  const result = await request({ action: 'correct-email', userId: uid, email: 'corrected@school.edu' });
  assert.equal(result.code, 400);
  assert.equal(users.get(uid).email, previousEmail); assert.equal(rows.get(`users/${uid}`).email, previousEmail);
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

await test('only admins can change access, and only for a teacher', async () => {
  for (const action of ['deactivate', 'reactivate', 'cleanup-classes']) {
    assert.equal((await request({ action, userId: uid }, 'student')).code, 403);
    assert.equal((await request({ action, userId: uid }, uid)).code, 403);
    assert.equal((await request({ action, userId: 'student' })).code, 404);
    assert.equal((await request({ action })).code, 400);
  }
});
await test('deactivation disables auth, revokes sessions and unassigns all classes while preserving student records', async () => {
  rows.set('classes/preserved', { teacherId: uid, title: 'Rizal', students: ['student'] });
  rows.set('classes/second', { teacherId: uid, title: 'Mabini' });
  rows.set('classes/other', { teacherId: 'another_teacher' });
  rows.set('classes/preserved/students/student', { fullName: 'Student', score: 85 });
  const before = { ...rows.get(`users/${uid}`) };
  const result = await request({ action: 'deactivate', userId: uid });
  assert.equal(result.code, 200);
  assert.equal(result.body.disabled, true);
  assert.equal(users.get(uid).disabled, true);
  assert.deepEqual(rows.get(`users/${uid}`), { ...before, disabled: true });
  assert.equal(result.body.unassignedClasses, 2);
  assert.equal(rows.get('classes/preserved').teacherId, '');
  assert.equal(rows.get('classes/second').teacherId, '');
  assert.equal(rows.get('classes/other').teacherId, 'another_teacher');
  assert.equal(rows.get('classes/preserved/students/student').score, 85);
  assert.deepEqual(rows.get('classes/preserved').students, ['student']);
  assert.ok(revoked.includes(uid));
  const status = await request({ action: 'statuses', userIds: [uid] });
  assert.equal(status.body.users[0].disabled, true);
  assert.equal((await request({ action: 'resend' }, uid)).code, 401);
  assert.equal((await request({ action: 'deactivate', userId: uid })).body.unassignedClasses, 0);
});
await test('reactivation restores sign-in and retains setup flags and records; retries are safe', async () => {
  assert.equal((await request({ action: 'reactivate', userId: uid })).code, 200);
  assert.equal((await request({ action: 'reactivate', userId: uid })).code, 200);
  assert.equal(users.get(uid).disabled, false);
  assert.equal(rows.get(`users/${uid}`).disabled, false);
  assert.equal(rows.get(`users/${uid}`).mustChangePassword, false);
  assert.equal(rows.get('classes/preserved').teacherId, '');
  const http = modules.get(new URL('../notify-api/lib/http.js', import.meta.url).href).namespace;
  assert.equal(await http.requireUser({ headers: { authorization: `Bearer ${uid}` } }, { status() { return this; }, json() {} }), uid);
});
await test('failed profile status write rolls authentication back without deleting data', async () => {
  rows.get('classes/preserved').teacherId = uid;
  accessWriteFails = true;
  assert.equal((await request({ action: 'deactivate', userId: uid })).code, 500);
  accessWriteFails = false;
  assert.equal(users.get(uid).disabled, false);
  assert.equal(rows.get(`users/${uid}`).disabled, false);
  assert.equal(rows.get('classes/preserved').teacherId, uid);
});
await test('profile-disabled teachers cannot call even the pending-account API', async () => {
  rows.get(`users/${uid}`).disabled = true;
  assert.equal((await request({ action: 'resend' }, uid)).code, 403);
  rows.get(`users/${uid}`).disabled = false;
});
await test('cleanup repairs older assignments only while the teacher remains deactivated', async () => {
  rows.set('users/cleanup-teacher', { role: 'teacher', disabled: true });
  rows.set('classes/cleanup-class', { teacherId: 'cleanup-teacher', className: 'Preserved' });
  const repaired = await request({ action: 'cleanup-classes', userId: 'cleanup-teacher' });
  assert.equal(repaired.code, 200);
  assert.equal(repaired.body.unassignedClasses, 1);
  assert.equal(rows.get('classes/cleanup-class').teacherId, '');
  assert.equal(rows.get('classes/cleanup-class').className, 'Preserved');
  rows.set('classes/cleanup-class', { teacherId: 'cleanup-teacher' });
  rows.get('users/cleanup-teacher').disabled = false;
  const skipped = await request({ action: 'cleanup-classes', userId: 'cleanup-teacher' });
  assert.equal(skipped.body.unassignedClasses, 0);
  assert.equal(rows.get('classes/cleanup-class').teacherId, 'cleanup-teacher');
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
    await test('rules block deactivated teachers and prevent self-reactivation', async () => {
      await patch('users/inactive', { role: 'teacher', disabled: true });
      assert.equal((await get('lessons/sample', 'inactive')).status, 403);
      assert.equal((await patch('users/inactive', { disabled: false }, 'inactive')).status, 403);
      assert.equal((await patch('users/legacy', { disabled: true }, 'legacy')).status, 403);
    });
    await test('admin cannot edit teacher identity but teacher can maintain their own profile', async () => {
      await patch('users/directory-admin', { role: 'admin' });
      for (const key of ['firstName', 'lastName', 'middleName', 'displayName', 'email', 'photoURL']) {
        assert.equal((await patch('users/legacy', { [key]: 'Changed' }, 'directory-admin')).status, 403);
      }
      assert.equal((await patch('users/legacy', { displayName: 'My updated name' }, 'legacy')).status, 200);
    });
    await test('class assignments reject deactivated teachers and allow active teachers or unassigned', async () => {
      await patch('classes/assignment', { teacherId: 'legacy', className: 'Preserved class' });
      assert.equal((await patch('classes/assignment', { teacherId: 'inactive' }, 'directory-admin')).status, 403);
      assert.equal((await patch('classes/assignment', { teacherId: '' }, 'directory-admin')).status, 200);
      assert.equal((await patch('classes/assignment', { teacherId: 'legacy' }, 'directory-admin')).status, 200);
    });
    await test('deactivation unassigns classes through a real Firestore transaction and preserves progress', async () => {
      const previousHost = process.env.FIRESTORE_EMULATOR_HOST;
      process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
      const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
      const { initializeApp, deleteApp } = require('firebase-admin/app');
      const { getFirestore } = require('firebase-admin/firestore');
      const app = initializeApp({ projectId: emulator.project }, 'deactivation-transaction');
      const firestore = getFirestore(app);
      firestore.settings({ host: emulator.host, ssl: false });
      const previousDatabase = database;
      try {
        await firestore.doc('users/admin').set({ role: 'admin' });
        await firestore.doc('users/transaction-teacher').set({ role: 'teacher', disabled: false });
        users.set('transaction-teacher', { uid: 'transaction-teacher', disabled: false });
        for (const name of ['one', 'two']) await firestore.doc(`classes/transaction-${name}`).set({ teacherId: 'transaction-teacher', className: name });
        await firestore.doc('classes/transaction-one/students/learner').set({ score: 92 });
        // The handler runs in a VM; normalize its object literals at the SDK
        // boundary because Firestore rejects objects with a foreign prototype.
        const plain = value => JSON.parse(JSON.stringify(value));
        database = {
          doc: path => {
            const raw = firestore.doc(path);
            return { raw, get: () => raw.get(), update: data => raw.update(plain(data)) };
          },
          collection: name => firestore.collection(name),
          runTransaction: run => firestore.runTransaction(async tx => await run({
            get: ref => tx.get(ref.raw || ref),
            update: (ref, data) => tx.update(ref.raw || ref, plain(data)),
          })),
        };
        const result = await request({ action: 'deactivate', userId: 'transaction-teacher' });
        assert.equal(result.code, 200);
        assert.equal(result.body.unassignedClasses, 2);
        assert.equal((await firestore.doc('users/transaction-teacher').get()).get('disabled'), true);
        for (const name of ['one', 'two']) assert.equal((await firestore.doc(`classes/transaction-${name}`).get()).get('teacherId'), '');
        assert.equal((await firestore.doc('classes/transaction-one/students/learner').get()).get('score'), 92);
        assert.equal((await request({ action: 'reactivate', userId: 'transaction-teacher' })).code, 200);
        assert.equal((await firestore.doc('classes/transaction-one').get()).get('teacherId'), '');
      } finally {
        database = previousDatabase;
        if (previousHost === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
        else process.env.FIRESTORE_EMULATOR_HOST = previousHost;
        await firestore.terminate();
        await deleteApp(app);
      }
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
