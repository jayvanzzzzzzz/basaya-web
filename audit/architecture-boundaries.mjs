import assert from 'node:assert/strict';
import { startFirestoreTestServer } from '../tools/firestore-test-server.mjs';

// Local emulator only. Synthetic identities and documents; no production requests.
const emulator = await startFirestoreTestServer(...process.argv.slice(2));
function field(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  return { mapValue: { fields: fields(value) } };
}
function fields(data) { return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)])); }
async function request(path, data, uid = 'owner') {
  const mask = data ? '?' + new URLSearchParams(Object.keys(data).map(key => ['updateMask.fieldPaths', key])) : '';
  const response = await fetch(`${emulator.documents}/${path}${mask}`, {
    method: data ? 'PATCH' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${uid === 'owner' ? 'owner' : emulator.token(uid)}` },
    ...(data ? { body: JSON.stringify({ fields: fields(data) }) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.text();
  return { status: response.status, body };
}
async function expect(label, path, data, uid, status) {
  const response = await request(path, data, uid);
  assert.equal(response.status, status, `${label}: ${response.body}`);
  console.log(`${status === 200 ? 'REPRODUCED' : 'CONTROL PASSED'}: ${label}`);
}
try {
  for (const [path, data] of [
    ['users/student', { role: 'student', classId: 'a' }],
    ['classes/a', { teacherId: 'teacher' }],
    ['classes/a/students/student', { fullName: 'Synthetic student' }],
    ['classes/a/classLessons/open', { lessonId: 'open' }],
    ['lessons/unassigned/quiz/main', { answer: 'secret-answer' }],
  ]) assert.equal((await request(path, data)).status, 200);
  await expect('approved student can forge assessment score and completion', 'users/student/assignedLessons/open', { quizScore: 999, quizFinished: true }, 'student', 200);
  await expect('finalized assessment can be overwritten', 'users/student/assignedLessons/open', { quizScore: -1, quizFinished: false }, 'student', 200);
  await expect('student can forge stored skill summary', 'users/student', { skillSummary: { skills: { pagsusulit: { score: 100 } } } }, 'student', 200);
  await expect('unassigned lesson accepts progress through legacy fallback', 'users/student/assignedLessons/unassigned', { quizFinished: true }, 'student', 200);
  await expect('approved student can read unassigned quiz answer document', 'lessons/unassigned/quiz/main', null, 'student', 200);
  await expect('student still cannot create a class', 'classes/forged', { teacherId: 'student' }, 'student', 403);
  await expect('student still cannot change role', 'users/student', { role: 'admin' }, 'student', 403);
  console.log('Finished 5 defect reproductions and 2 authorization controls.');
} finally {
  await emulator.stop();
}
