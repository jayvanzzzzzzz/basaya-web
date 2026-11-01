import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Read-only audit. Does not contact Firebase, the Worker, or any real accounts.
const root = fileURLToPath(new URL('../', import.meta.url));
const android = 'C:/Projects/BaSaya';
async function scripts(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'build'].includes(entry.name)) continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await scripts(target));
    else if (entry.name.endsWith('.js')) result.push(target);
  }
  return result;
}
const files = (await Promise.all(['js', 'student', 'teacher', 'admin', 'notify-api'].map(dir => scripts(path.join(root, dir))))).flat();
files.push(...['service-worker.js', 'offline-shell.js', 'firebase-config.js'].map(file => path.join(root, file)));
for (const file of files) new vm.SourceTextModule(await readFile(file, 'utf8'), { identifier: file });
console.log(`PASS: ${files.length} website JavaScript files parsed successfully.`);

const data = await readFile(path.join(root, 'student/data.js'), 'utf8');
const body = data.match(/export const isComplete = \(lesson\) =>([\s\S]*?);/)[1];
const isComplete = vm.runInNewContext(`(lesson) => ${body}`);
const unfinishedSpeech = { lectureFinished: true, gameFinished: true, activityFinished: true, quizFinished: true, pronunciationFinished: false };
assert.equal(isComplete(unfinishedSpeech), true);
const scoring = await readFile(path.join(root, 'js/scoring.js'), 'utf8');
const scoringModule = await import(`data:text/javascript;base64,${Buffer.from(scoring).toString('base64')}`);
assert.equal(scoringModule.lessonParts(unfinishedSpeech).finished, false);
console.log('REPRODUCED: student home completion is true while shared scoring completion is false for unfinished Bigkas.');

const workerSource = await readFile(path.join(android, 'cloudflare/basaya-stt/src/index.js'), 'utf8');
const worker = (await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`)).default;
let aiCalls = 0;
const fakeAI = { run: async () => { aiCalls++; return { text: 'audit' }; } };
const anonymous = () => new Request('https://audit.invalid/transcribe', { method: 'POST', body: new Uint8Array([1, 2]) });
assert.equal((await worker.fetch(anonymous(), { AI: fakeAI })).status, 200);
assert.equal(aiCalls, 1);
assert.equal((await worker.fetch(anonymous(), { AI: fakeAI, APP_KEY: 'fake-audit-key' })).status, 401);
console.log('REPRODUCED: missing APP_KEY allows anonymous transcription; configured key rejects anonymous requests. AI was stubbed locally.');
