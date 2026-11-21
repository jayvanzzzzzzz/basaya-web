// Run via Firebase Auth emulators:exec with a demo project. Never touches production.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Requires the local Firebase Auth emulator');
const app = initializeApp({ projectId: 'demo-basaya-verification' });
const auth = getAuth(app);
try {
  const user = await auth.createUser({ email: 'synthetic-teacher@example.test', password: 'SyntheticPassword1', emailVerified: false });
  const link = await auth.generateEmailVerificationLink(user.email);
  const code = new URL(link).searchParams.get('oobCode');
  assert.ok(code, 'Generated Firebase verification links must contain the action code');
  const request = async (operation, body) => {
    const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:${operation}?key=synthetic`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  for (let count = 0; count < 2; count++) {
    const checked = await request('resetPassword', { oobCode: code });
    assert.equal(checked.status, 200);
    assert.equal(checked.body.requestType, 'VERIFY_EMAIL');
    assert.equal(checked.body.email, user.email);
    assert.equal((await auth.getUser(user.uid)).emailVerified, false, 'Inspecting the link must not redeem it');
  }
  assert.equal((await request('update', { oobCode: code })).status, 200);
  assert.equal((await auth.getUser(user.uid)).emailVerified, true, 'Intentional confirmation verifies the account');
  const used = await request('resetPassword', { oobCode: code });
  assert.equal(used.status, 400);
  assert.match(used.body.error.message, /INVALID_OOB_CODE|EXPIRED_OOB_CODE/);
  await auth.deleteUser(user.uid);
  console.log('PASS Auth emulator: genuine generated action code, repeated non-consuming inspection, successful verification, and rejection after use. No production users or email touched.');
} finally { await deleteApp(app); }
