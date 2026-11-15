import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../admin/views/lessonViewer.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('const SINGLE_SECTIONS'), source.indexOf('export const SECTIONS'));
const sections = ['activity', 'lectures', 'pronunciation', 'quiz'];
const database = new Map();
const load = new Function('collection', 'getDocs', 'db',
  body.replace('export async function', 'async function') + '\nreturn loadLessonSections;')(
  (_db, ...parts) => parts.join('/'),
  async path => ({ docs: [...(database.get(path) || [])]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, data]) => ({ id, data: () => structuredClone(data) })) }),
  {},
);
const documents = part => database.get(`lessons/example/${part}`);
for (const part of [...sections, 'game']) database.set(`lessons/example/${part}`, new Map());

assert.deepEqual(await load('example'), {
  activity: null, activityStatus: null, lectures: null, pronunciation: null,
  quiz: null, game: [], gameStatus: null,
});

for (const part of sections) documents(part).set('0-legacy', {
  title: `Old ${part}`, words: ['luma'], pages: [{ sentence: 'Lumang pangungusap.' }],
  cloudAudio: [{ text: 'luma', audioUrl: 'https://audio.test/old.mp3' }],
});
const legacy = await load('example');
for (const part of sections) assert.equal(legacy[part].title, `Old ${part}`, 'Legacy lessons remain readable');

// Simulate the editor's save destination, keeping legacy documents in place.
for (const part of sections) documents(part).set('content', {
  title: `Updated ${part}`, words: ['bago'],
  pages: [{ sentence: 'Bagong pangungusap.', cloudAudio: { audioUrl: 'https://audio.test/new-sentence.mp3' } }],
  cloudAudio: [{ text: 'bago', audioUrl: 'https://audio.test/new-word.mp3' }],
  questions: [{ question: 'Bagong tanong?', choices: ['Oo', 'Hindi', 'Siguro'], answer: 0 }],
});
for (let reopen = 0; reopen < 2; reopen++) {
  const saved = await load('example');
  for (const part of sections) {
    assert.equal(saved[part].id, 'content');
    assert.equal(saved[part].title, `Updated ${part}`);
    assert.equal(documents(part).has('0-legacy'), true, 'Loading does not delete older documents');
  }
  assert.deepEqual(saved.pronunciation.words, ['bago']);
  assert.equal(saved.pronunciation.cloudAudio[0].audioUrl, 'https://audio.test/new-word.mp3');
  assert.equal(saved.pronunciation.pages[0].cloudAudio.audioUrl, 'https://audio.test/new-sentence.mp3');
  assert.equal(saved.lectures.pages[0].sentence, 'Bagong pangungusap.');
  assert.equal(saved.quiz.questions[0].question, 'Bagong tanong?');
}

// Status records must not be mistaken for lesson content.
for (const part of sections) {
  documents(part).clear();
  documents(part).set('status', { completion: 'skipped' });
}
documents('game').set('status', { completion: 'skipped' });
documents('game').set('level-1', { level: 1, words: ['BAGO'] });
const statusOnly = await load('example');
for (const part of sections) assert.equal(statusOnly[part], null);
assert.equal(statusOnly.activityStatus.completion, 'skipped');
assert.equal(statusOnly.gameStatus.completion, 'skipped');
assert.deepEqual(statusOnly.game.map(level => level.level), [1]);
console.log('PASS: updated content and audio on reopen, legacy fallback, empty sections, status filtering, preserved game levels');
