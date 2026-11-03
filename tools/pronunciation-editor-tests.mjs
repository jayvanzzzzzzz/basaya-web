import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setImmediate as flush } from 'node:timers/promises';
const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
const { parseHTML } = require('linkedom');
const source = await readFile(new URL('../admin/views/pronunciationPages.js', import.meta.url), 'utf8');
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function setup(saved) {
  const { document, window } = parseHTML(`<html><body><section data-panel="pronunciation"><div data-pronunciation-legacy><button data-enable-pronunciation-pages></button></div><div data-pronunciation-sentence-section><button data-add-pronunciation-page></button><div data-pronunciation-pages></div><div data-pronunciation-word-picker></div></div><button data-add-pronunciation-word></button><div data-pronunciation-words></div></section></body></html>`);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const helpers = { $, $$, escapeHtml, safeHttpUrl: url => url?.startsWith('https://') ? url : '', toast() {} };
  const { readyWords, mountPronunciationPages } = new Function('helpers', 'document', source.replace(/^import .*?;\s*/, () => 'const { $, $$, escapeHtml, safeHttpUrl, toast } = helpers;\n').replaceAll('export ', '') + '\nreturn { readyWords, mountPronunciationPages };')(helpers, document);
  const previews = new WeakMap(), uploads = [];
  const wordHtml = (word, audioRef = '', cloudAudio = null) => `<div data-pronunciation-word data-cloud-audio="${escapeHtml(JSON.stringify(cloudAudio))}"><input data-pronunciation-text value="${escapeHtml(word)}"><button data-remove-pronunciation-word></button><button data-generate-pronunciation-audio></button></div>`;
  $('[data-pronunciation-words]').innerHTML = (saved?.words || []).map((word, i) => wordHtml(word, '', saved.cloudAudio?.[i])).join('');
  const audioProblem = (row, text) => {
    const preview = previews.get(row);
    const audio = preview || JSON.parse(row.dataset.cloudAudio || 'null');
    return audio?.text === text ? '' : 'generate audio again';
  };
  const controller = mountPronunciationPages(document, saved, {
    wordHtml, refreshWord() {}, previews, audioProblem,
    generate: async (_button, row, text) => { previews.set(row, { blob: new Blob(['audio']), text, wordStarts: [0] }); },
    saveAudio: async options => { uploads.push(options); return { audioUrl: `https://test/${options.pageNumber}`, storageKey: `page-${options.pageNumber}` }; },
  });
  const click = async selector => { $(selector).dispatchEvent(new window.Event('click', { bubbles: true })); await flush(); };
  const input = (selector, value) => { $(selector).value = value; $(selector).dispatchEvent(new window.Event('input', { bubbles: true })); };
  return { $, $$, document, window, controller, previews, uploads, readyWords, click, input, audioProblem };
}
const t = setup();
assert.equal(t.$('[data-pronunciation-character-count]').textContent, '0/200');
assert.equal(t.$('[data-pronunciation-sentence]').getAttribute('maxlength'), '200');
assert.equal(t.$('[data-remove-pronunciation-page]').getAttribute('aria-label'), 'Remove page');
assert.equal(t.$('[data-remove-pronunciation-page]').textContent, '');
assert.ok(t.$('[data-remove-pronunciation-page] svg'));
assert.deepEqual(t.readyWords(['May bahay. MAY bahay! “Maganda,” ang bahay.', 'Araw-araw, bata’s bata\'s.']), ['May', 'bahay', 'Maganda', 'ang', 'Araw-araw', 'bata’s']);
assert.equal(t.$('[data-panel]').dataset.pronunciationMode, 'sentences');
t.input('[data-pronunciation-sentence]', 'May magandang bahay.');
assert.equal(t.$('[data-pronunciation-character-count]').textContent, `${'May magandang bahay.'.length}/200`);
assert.equal(t.$$('[data-pronunciation-word]').length, 0, 'New words start unselected');
assert.ok(t.$$('[data-ready-word]').every(button => button.getAttribute('aria-pressed') === 'false'));
const firstWordButton = t.$('[data-ready-word="may"]');
firstWordButton.scrollIntoView = () => { throw Error('Word selection must not scroll'); };
firstWordButton.focus = () => { throw Error('Word selection must not move focus'); };
await t.click('[data-ready-word="may"]');
assert.equal(firstWordButton, t.$('[data-ready-word="may"]'), 'Keep the clicked element for double-click handling');
assert.equal(firstWordButton.getAttribute('aria-pressed'), 'true');
assert.ok(firstWordButton.classList.contains('is-selected'));
assert.equal(firstWordButton.querySelector('[data-ready-check]').hidden, false);
await t.click('[data-ready-word="may"]');
firstWordButton.dispatchEvent(new t.window.Event('dblclick', { bubbles: true }));
assert.equal(firstWordButton.getAttribute('aria-pressed'), 'false');
assert.equal(firstWordButton.querySelector('[data-ready-check]').hidden, true);
assert.equal(t.$$('[data-pronunciation-word]').length, 0);
await t.click('[data-ready-word="may"]');
await t.click('[data-ready-word="magandang"]');
await t.click('[data-ready-word="bahay"]');
assert.equal(t.$$('[data-pronunciation-word]').length, 3);
assert.ok(t.$$('[data-pronunciation-text]').every(field => field.readOnly));
await assert.rejects(t.controller.read('lesson'), /Generate current audio/);
await t.click('[data-generate-pronunciation-sentence]');
const saved = await t.controller.read('lesson');
assert.equal(saved.formatVersion, 2);
assert.equal(saved.pages[0].sentence, 'May magandang bahay.');
assert.equal(t.uploads[0].section, 'pronunciation');
assert.equal(t.uploads[0].pageNumber, 1);
assert.equal(t.uploads[0].sentenceIndex, 1);
t.input('[data-pronunciation-sentence]', 'May malaking bahay.');
assert.match(t.$('[data-pronunciation-audio-status]').textContent, /generate audio/);
await assert.rejects(t.controller.read('lesson'), /Generate current audio/);
assert.deepEqual(t.$$('[data-pronunciation-text]').map(field => field.value), ['May', 'bahay']);
assert.equal(t.$('[data-ready-word="malaking"]').getAttribute('aria-pressed'), 'false');
await t.click('[data-ready-word="malaking"]');
assert.deepEqual(t.$$('[data-pronunciation-text]').map(field => field.value), ['May', 'malaking', 'bahay']);
for (let i = 0; i < 6; i++) await t.click('[data-add-pronunciation-page]');
assert.equal(t.$$('[data-pronunciation-page]').length, 5);
assert.ok(t.$('[data-add-pronunciation-page]').disabled);
await t.click('[data-remove-pronunciation-page]');
assert.equal(t.$$('[data-pronunciation-page]').length, 4);
assert.equal(t.$('[data-card-number]').textContent, 'Page 1 of 4');
const wordAudio = { audioUrl: 'https://test/word', text: 'May' };
const reopened = setup({ ...saved, words: ['May', 'magandang', 'bahay'], cloudAudio: [wordAudio, null, null] });
assert.deepEqual(await reopened.controller.read('lesson'), saved);
assert.equal(JSON.parse(reopened.$('[data-pronunciation-word]').dataset.cloudAudio).audioUrl, wordAudio.audioUrl);
assert.equal(reopened.uploads.length, 0, 'Saved clips are reused');
const old = setup({ words: ['Bahay'], cloudAudio: [wordAudio] });
assert.equal(old.$('[data-panel]').dataset.pronunciationMode, 'legacy');
assert.deepEqual(await old.controller.read('lesson'), {});
assert.equal(old.$('[data-pronunciation-text]').value, 'Bahay');
await old.click('[data-enable-pronunciation-pages]');
assert.equal(old.$('[data-panel]').dataset.pronunciationMode, 'sentences');
assert.equal(old.$$('[data-pronunciation-word]').length, 0);
const studio = await readFile(new URL('../admin/views/lessons.js', import.meta.url), 'utf8');
const extract = (start, end) => studio.slice(studio.indexOf(start), studio.indexOf(end, studio.indexOf(start)));
const build = (body, deps) => new Function('deps', `const { ${Object.keys(deps).join(', ')} } = deps;\n${body}`)(deps);
const studioHtml = build(extract('function studioHtml(', 'function activityPageHtml(') + '\nreturn studioHtml;', {
  escapeHtml, difficultyOptions: () => '<option value="madali">Beginner</option>',
  PRONUNCIATION_INSTRUCTION: 'Pindutin ang mikropono habang bumabasa',
});
const { document: editorDocument } = parseHTML(studioHtml({ id: 'saved', title: 'Pangngalan' }, {
  lectures: { title: 'My prefilled lecture' }, quiz: { title: 'My prefilled quiz' },
  activity: { title: 'My prefilled activity', instruction: 'Keep this instruction' },
  pronunciation: { title: 'My prefilled pronunciation', instruction: 'Old instruction' },
}));
const editor$ = (selector, root = editorDocument) => root.querySelector(selector);
const wireDefaults = build(extract('const TITLE_DEFAULTS =', 'function studioHtml(') + '\nreturn wireTitleDefaults;', { $: editor$ });
wireDefaults(editorDocument);
assert.equal(editor$('[data-lecture-title]').value, 'My prefilled lecture');
assert.equal(editor$('[data-quiz-title]').value, 'My prefilled quiz');
assert.equal(editor$('[data-activity-title]').value, 'My prefilled activity');
assert.equal(editor$('[data-activity-instruction]').value, 'Keep this instruction');
assert.equal(editor$('[data-pronunciation-title]').value, 'My prefilled pronunciation');
assert.equal(editor$('[data-pronunciation-instruction]'), null);
assert.doesNotMatch(editor$('[data-panel="pronunciation"]').textContent, /Pindutin ang mikropono habang bumabasa|Instruction:/);
assert.equal(editor$('[data-add-pronunciation-page]').textContent, '');
assert.equal(editor$('[data-add-pronunciation-page]').getAttribute('aria-label'), 'Add pronunciation page');
assert.ok(editor$('[data-add-pronunciation-page] svg'));
assert.doesNotMatch(editor$('[data-panel="pronunciation"]').textContent, /One sentence per page, up to 5 pages/);
const limitSentence = 'a'.repeat(200);
const limit = setup({ pages: [{ sentence: limitSentence, cloudAudio: { audioUrl: 'https://test/limit', text: limitSentence } }], words: [] });
assert.equal(limit.$('[data-pronunciation-character-count]').textContent, '200/200');
assert.equal((await limit.controller.read('lesson')).pages[0].sentence.length, 200);
limit.input('[data-pronunciation-sentence]', limitSentence + 'b');
await assert.rejects(limit.controller.read('lesson'), /exceeds 200 characters/);
const validation = build(extract('function missingFields(', 'async function openLessonModal(') + '\nreturn missingFields;', {
  $: reopened.$, $$: reopened.$$, MISSING_GROUPS: {}, lectureAudioProblem: reopened.audioProblem,
  duplicateLessonWords: () => [],
});
assert.equal(validation(reopened.document, { skipActivity: { checked: true }, skipGame: { checked: true } }).filter(item => item.group === 'Pronunciation').length, 0);
reopened.input('[data-pronunciation-sentence]', 'Changed sentence.');
assert.ok(validation(reopened.document, { skipActivity: { checked: true }, skipGame: { checked: true } }).some(item => item.group === 'Pronunciation' && item.label.includes('generate audio')));
const persist = setup({ ...saved, words: ['May', 'magandang', 'bahay'], cloudAudio: [wordAudio, null, null] });
persist.document.body.insertAdjacentHTML('beforeend', '<input data-lecture-title value="Lecture"><input data-pronunciation-title value="Bigkas"><input data-quiz-title value="Quiz">');
const writes = [];
const saveLesson = build(
  extract('async function saveLesson(', 'function readActivity(') +
  extract('function existingCloudAudio(', 'async function readLectures(') +
  extract('async function readPronunciation(', 'function readQuiz(') + '\nreturn saveLesson;', {
    $: persist.$, $$: persist.$$, document: persist.document, previews: persist.previews,
    PRONUNCIATION_INSTRUCTION: 'Pindutin ang mikropono habang bumabasa',
    db: {}, serverTimestamp: () => 123, doc: (_db, ...parts) => ({ id: parts.at(-1), path: parts.join('/') }),
    collection: () => ({}), addDoc: async () => ({ id: 'new-lesson' }), updateDoc: async () => {},
    setDoc: async (ref, value) => writes.push({ path: ref.path, value }),
    readLectures: async () => [], readQuiz: () => [], replaceActivity: async () => {}, replaceGameLevels: async () => {},
    URL: { revokeObjectURL() {} },
  });
for (const existing of [null, { id: 'existing-lesson' }]) {
  const lessonId = await saveLesson(existing, { title: 'Test', description: 'Test', difficulty: 'madali' }, {
    pronunciationPages: persist.controller, pronunciationWords: persist.$('[data-pronunciation-words]'),
    skipActivity: { checked: true }, skipGame: { checked: true },
  });
  const record = writes.findLast(write => write.path === `lessons/${lessonId}/pronunciation/content`).value;
  assert.equal(record.formatVersion, 2);
  assert.equal(record.instruction, 'Pindutin ang mikropono habang bumabasa');
  assert.equal(record.pages[0].sentence, 'May magandang bahay.');
  assert.deepEqual(record.words, ['May', 'magandang', 'bahay']);
  assert.equal(record.cloudAudio[0].audioUrl, wordAudio.audioUrl);
  assert.deepEqual(await setup(record).controller.read(lessonId), saved);
}
console.log('PASS: click selection, double-click removal, stable word buttons, saved selection, fixed instruction, preserved titles, page limits, audio invalidation, Add/Edit save and reopen');
