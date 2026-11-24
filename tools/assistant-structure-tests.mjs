import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assistantHelp, HELP_VERSION } from '../js/assistantHelp.js';
import { handbookHelp, selectHandbookEntries, selectHelpEntries, handbookReference } from '../js/handbookHelp.js';

const cases = [
  ['teacher', 'How do I assign lesson paths?', 'lessons', /Set dates and assign paths/],
  ['teacher', 'How do I extend a path deadline?', 'extend-deadline', /entire class/],
  ['teacher', 'How do I set the opening date and deadline?', 'schedule', /every module and lesson/],
  ['admin', 'How do I create student accounts?', 'students', /12-digit LRN/],
];
for (const role of ['teacher', 'admin']) {
  cases.push([role, 'What is the new learning structure?', 'structure', /Learning Path > Module > Lesson/]);
  cases.push([role, 'How do I create a learning path?', 'build-path', /Move to/]);
  cases.push([role, 'How do School Year filters work?', 'school-year', /cannot be changed/]);
}
for (const [role, question, id, fact] of cases) {
  const selected = selectHandbookEntries(role, question);
  const guide = selected.find(g => g.id === id);
  assert.ok(guide, `${role}: ${question}: ${selected.map(g => g.id)}`);
  assert.match(guide.text, fact);
  assert.ok(Buffer.byteLength(handbookReference(selected)) <= 2400);
  assert.ok(selected.every(g => handbookHelp[role].includes(g)));
}
for (const [question, id] of [
  ['Bakit naka-lock ang susunod na module o lesson path?', 'unlock'],
  ['How to download a module offline?', 'downloads'],
  ['Assessment or Practice retries?', 'practice'],
  ['LRN username password', 'account'],
  ['Saan ko makikita ang mga aralin?', 'lessons'],
  ['Who created BASAya?', 'creators'],
]) {
  const selected = selectHelpEntries(assistantHelp, question, 3000);
  assert.ok(selected.some(g => g.id === id), `${question}: ${selected.map(g => g.id)}`);
  assert.ok(Buffer.byteLength(handbookReference(selected)) <= 3000);
}
assert.match(HELP_VERSION, /2026-11-24/);
const json = JSON.parse(await readFile(new URL('../build/assistant-help.json', import.meta.url), 'utf8'));
assert.deepEqual(json, assistantHelp);
if (process.argv[2]) {
  const { join } = await import('node:path');
  assert.deepEqual(JSON.parse(await readFile(join(process.argv[2], 'app/src/main/assets/assistant-help.json'), 'utf8')), assistantHelp);
}
console.log('PASS: structure retrieval, role boundaries, reference budgets, cache version, and generated Android guide parity.');
