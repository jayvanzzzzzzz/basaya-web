import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { orderedLessonIds, moveLesson, nextCopyNumber } from '../js/moduleModel.js';
import { startFirestoreTestServer } from './firestore-test-server.mjs';

assert.throws(() => orderedLessonIds([]));
assert.throws(() => orderedLessonIds(['same', 'same']));
assert.throws(() => orderedLessonIds(['bad/path']));
assert.deepEqual(moveLesson(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
assert.equal(nextCopyNumber('Pandiwa', [{ title: 'Pandiwa 1.9' }, { title: 'Pandiwa 1.10' }, { title: 'Pandiwa 1.x' }]), 11);

const emulator = await startFirestoreTestServer(...process.argv.slice(2));
const encode = value => Array.isArray(value) ? { arrayValue: { values: value.map(encode) } } : typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value };
const fields = data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
const headers = uid => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${uid ? emulator.token(uid) : 'owner'}` });
const patch = (path, data, uid) => fetch(`${emulator.documents}/${path}?${Object.keys(data).map(key => 'updateMask.fieldPaths=' + key).join('&')}`, { method: 'PATCH', headers: headers(uid), body: JSON.stringify({ fields: fields(data) }) });
const get = (path, uid) => fetch(`${emulator.documents}/${path}`, { headers: headers(uid) });
try {
  for (const [path, data] of [
    ['users/admin', { role: 'admin' }], ['users/teacher', { role: 'teacher' }], ['users/other', { role: 'teacher' }],
    ['users/student', { role: 'student' }], ['users/disabled', { role: 'teacher', disabled: true }],
    ['lessons/original', { title: 'Pandiwa', description: 'Original overview', difficulty: 'madali' }],
    ['lessons/original/lectures/content', { title: 'Original lecture' }],
  ]) assert.equal((await patch(path, data)).status, 200);
  assert.equal((await patch('lessons/original', { title: 'Overwritten' }, 'teacher')).status, 403);
  assert.equal((await patch('lessons/original/lectures/content', { title: 'Overwritten' }, 'teacher')).status, 403);
  assert.equal((await patch('lessons/own', { title: 'Own lesson', teacherId: 'teacher' }, 'teacher')).status, 200);
  assert.equal((await patch('lessons/own/quiz/content', { title: 'Own quiz' }, 'teacher')).status, 200);
  assert.equal((await patch('lessons/own/quiz/content', { title: 'Intrusion' }, 'other')).status, 403);
  assert.equal((await patch('lessons/own', { teacherId: 'other' }, 'teacher')).status, 403);
  assert.equal((await patch('lessons/forged', { title: 'Forged', teacherId: 'other' }, 'teacher')).status, 403);
  for (const uid of ['student', 'disabled']) assert.equal((await patch('lessons/blocked', { title: 'Blocked', teacherId: uid }, uid)).status, 403);
  assert.equal((await patch('lessonCopyCounters/original', { sequence: 1 }, 'teacher')).status, 200);
  assert.equal((await patch('lessonCopyCounters/original', { sequence: 1 }, 'other')).status, 403);
  assert.equal((await patch('lessonCopyCounters/original', { sequence: 2 }, 'other')).status, 200);
  assert.equal((await patch('lessonCopyCounters/original', { sequence: 4 }, 'teacher')).status, 403);

  // Execute the actual repository functions against real Firestore transactions.
  process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
  const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: emulator.project });
  const db = getFirestore(app);
  try {
    const state = { user: { uid: 'teacher' }, profile: { role: 'teacher' }, allLessons: [] };
    const wrap = snap => ({ id: snap.id, exists: () => snap.exists, data: () => snap.data() });
    const plain = value => Array.isArray(value) ? Array.from(value, plain) : value?.constructor?.name === 'Object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)])) : value;
    const context = vm.createContext({ db, state, nextCopyNumber, orderedLessonIds,
      collection: (database, name) => database.collection(name),
      doc: (database, ...parts) => parts.length ? database.doc(parts.join('/')) : database.doc(),
      serverTimestamp: () => FieldValue.serverTimestamp(),
      runTransaction: (_, work) => db.runTransaction(async tx => await work({ get: async ref => wrap(await tx.get(ref)), set: (ref, data) => tx.set(ref, plain(data)) })),
    });
    const source = (await readFile(new URL('../js/modules.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
    vm.runInContext(source, context);
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => context.reserveLessonCopy(db.collection('lessons').doc(), { id: 'original' }, { description: 'Edited copy', updatedAt: FieldValue.serverTimestamp() })));
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    const copies = results.map(result => result.value);
    assert.deepEqual([...copies].sort(), ['Pandiwa 1.3', 'Pandiwa 1.4', 'Pandiwa 1.5']);
    assert.equal((await db.doc('lessons/original').get()).get('title'), 'Pandiwa');
    const moduleId = await context.saveModule(null, { title: 'Module 1', description: 'Ordered lessons', lessonIds: ['own', 'original'] });
    const module = { id: moduleId, ...(await db.doc(`modules/${moduleId}`).get()).data() };
    assert.deepEqual(module.lessonIds, ['own', 'original']);
    assert.equal(module.lockingEnabled, false);
    await context.saveModule(module, { ...module, lessonIds: ['original', 'own'] });
    await assert.rejects(() => context.saveModule(module, module), /another session/);
    await assert.rejects(() => context.saveModule(null, { title: 'Missing', description: '', lessonIds: ['deleted'] }), /removed/);
    await assert.rejects(() => context.saveModule(null, { title: 'Empty', description: '', lessonIds: [] }), /at least one/);

    // Real client rule checks for module writes, server timestamps and ownership.
    const modulePath = `modules/${moduleId}`;
    const stored = JSON.parse(await (await get(modulePath)).text()).fields;
    const commit = (dataFields, uid, id = moduleId, transforms = ['updatedAt']) => fetch(emulator.documents + ':commit', {
      method: 'POST', headers: headers(uid), body: JSON.stringify({ writes: [{ update: { name: `projects/${emulator.project}/databases/(default)/documents/modules/${id}`, fields: dataFields }, updateTransforms: transforms.map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) }] }),
    });
    const next = { ...stored, revision: encode(3), title: encode('Updated module') }; delete next.updatedAt;
    assert.equal((await commit(next, 'teacher')).status, 200);
    assert.equal((await get(modulePath, 'teacher')).status, 200);
    assert.equal((await get(modulePath, 'admin')).status, 200);
    assert.equal((await get(modulePath, 'other')).status, 403);
    assert.equal((await get(modulePath, 'student')).status, 403);
    const forbidden = { ...next, revision: encode(4) };
    assert.equal((await commit(forbidden, 'other')).status, 403);
    assert.equal((await commit({ ...forbidden, ownerId: encode('other') }, 'teacher')).status, 403);
    assert.equal((await commit({ ...forbidden, lessonIds: encode(['own', 'own']) }, 'teacher')).status, 403);
    assert.equal((await commit({ ...forbidden, lockingEnabled: encode(true) }, 'teacher')).status, 403);
    const fresh = { ...fields({ title: 'Teacher module', description: '', lessonIds: ['own'], ownerId: 'teacher', visibility: 'private', revision: 1, progression: 'sequential', lockingEnabled: false }) };
    assert.equal((await commit(fresh, 'teacher', 'client-module', ['updatedAt', 'createdAt'])).status, 200);
    assert.equal((await commit(fresh, 'student', 'student-module', ['updatedAt', 'createdAt'])).status, 403);
    assert.equal((await commit({...fresh, visibility:encode('shared')}, 'teacher', 'forged-shared', ['updatedAt','createdAt'])).status,403);
    assert.equal((await commit({...fresh, ownerId:encode('admin'), visibility:encode('shared')}, 'admin', 'shared-module', ['updatedAt','createdAt'])).status,200);
    assert.equal((await get('modules/shared-module','teacher')).status,200);
    assert.equal((await get('modules/shared-module','student')).status,403);
  } catch(error) { console.error('Repository/rules test failure:', error); throw error; }
  finally { await db.terminate(); await deleteApp(app); }
  console.log('PASS: module order and validation, concurrent copy numbering, unchanged originals, stale edit protection, teacher/admin ownership rules, denied student/disabled access and future locking kept inactive. Real Firestore emulator; no production writes.');
} finally { await emulator.stop(); }
