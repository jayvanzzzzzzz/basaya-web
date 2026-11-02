import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { setImmediate as flush } from 'node:timers/promises';
const require = createRequire(new URL('../notify-api/package.json', import.meta.url));
const { parseHTML } = require('linkedom');
const resume = (fields = {}) => ({ done: 0, total: 2, correct: 0, firstTryCorrect: 0, lives: 3, misses: 0, hardWords: [], ...fields });

async function setup({ conflict = false, retry = false, depleted = false } = {}) {
  const { document, window } = parseHTML('<html><body><main></main></body></html>');
  const state = { requests: [], recordings: 0, timers: [], notices: [], begins: 0 };
  class Microphone {
    static supported() { return true; }
    async open() { return 'ok'; }
    close() {}
    record(level, signal, released) {
      state.recordings++;
      return new Promise(resolve => released.addEventListener('abort', () => resolve({ wav: new Blob(['recorded']) }), { once: true }));
    }
  }
  const context = vm.createContext({ window, document, console, Blob, AbortController,
    Audio: class { pause() {} }, navigator: { onLine: true }, crypto: { randomUUID }, btoa: value => Buffer.from(value, 'binary').toString('base64'),
    setTimeout: (fn, delay) => { const timer = { fn, delay }; state.timers.push(timer); return timer; }, clearTimeout: () => {} });
  const module = exports => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  const $ = selector => document.querySelector(selector);
  const helpers = module({ $, escapeHtml: String, navigate: path => { state.path = path; }, openModal() {}, toast: text => state.notices.push(text) });
  const data = module({ availability: () => 'open', clearResume: () => ({}), findLesson: async () => ({ practice: false }),
    loadLessonProgress: async () => ({ resume: { pronunciation: resume({ done: 1 }) } }),
    loadPronunciation: async () => ({ words: [{ word: 'bahay' }, { word: 'puno' }] }),
    resumeOf: progress => progress.resume.pronunciation, saveProgress: async () => ({}), saveResume() {},
    assessmentRequest: async (lesson, operation, fields) => {
      state.requests.push({ operation, ...fields });
      if (operation === 'begin') return resume({ done: ++state.begins > 1 ? 1 : 0 });
      const count = state.requests.filter(r => r.operation === 'speech').length;
      if (count === 1 && (conflict || retry)) {
        const error = new Error(conflict ? 'Refresh the current pronunciation word.' : 'Network failed');
        error.status = conflict ? 409 : 503;
        throw error;
      }
      return { ...resume({ done: depleted ? 1 : fields.index, lives: depleted ? 3 : 2, misses: depleted ? 0 : 1 }), band: 'try_again', over: depleted };
    },
  });
  const router = module({ onLeave: cleanup => { state.cleanup = cleanup; } });
  const speech = module({ Microphone, browserRecognitionAvailable: () => false, listenWithBrowser() {}, score() {}, transcribe() {} });
  const ui = module({ content: () => $('main'), icon: () => '', talkingBuddy: () => '<span></span>',
    confetti() {}, confettiFrom() {}, setBuddyMood() {}, setTalking() {}, shake() {} });
  const controller = new vm.SourceTextModule(await readFile(new URL('../student/views/pronunciation.js', import.meta.url), 'utf8'), { context });
  await controller.link(specifier => specifier.includes('gstatic') ? module({ serverTimestamp() {} })
    : specifier.endsWith('helpers.js') ? helpers : specifier.endsWith('data.js') ? data
    : specifier.endsWith('router.js') ? router : specifier.endsWith('speech.js') ? speech
    : specifier.endsWith('dictionary.js') ? module({ lookupWord: async () => null })
    : specifier.endsWith('syllables.js') ? module({ syllabify: word => word })
    : specifier.endsWith('results.js') ? module({ renderResults() {} }) : ui);
  await controller.evaluate();
  await controller.namespace.renderPronunciation('lesson');
  async function hold() {
    for (const type of ['keydown', 'keyup']) {
      const event = new window.Event(type); event.key = ' '; event.repeat = false;
      $('#pron-mic').dispatchEvent(event);
      await flush(); await flush();
    }
  }
  return { state, $, hold };
}

const initial = await setup();
assert.equal(initial.$('#pron-word').textContent, 'bahay', 'server position overrides stale public resume');
await initial.hold();
assert.equal(initial.state.requests.find(r => r.operation === 'speech').index, 0);

const conflicted = await setup({ conflict: true });
await conflicted.hold();
assert.equal(conflicted.$('#pron-word').textContent, 'puno');
assert.match(conflicted.$('#pron-note-title').textContent, /Na-update/);
await conflicted.hold();
const attempts = conflicted.state.requests.filter(r => r.operation === 'speech');
assert.deepEqual(attempts.map(r => r.index), [0, 1]);
assert.notEqual(attempts[0].eventId, attempts[1].eventId, 'conflict requires new audio and event for the current word');
assert.equal(conflicted.state.recordings, 2);

const retried = await setup({ retry: true });
await retried.hold(); await retried.hold();
const retries = retried.state.requests.filter(r => r.operation === 'speech');
assert.equal(retries[0].eventId, retries[1].eventId, 'transient retry preserves event identity');
assert.equal(retried.state.recordings, 1, 'transient retry preserves original audio');

const depleted = await setup({ depleted: true });
await depleted.hold();
assert.equal(depleted.$('#pron-lives-count').textContent, '0', 'server exhaustion wins over stale local lives');
depleted.state.timers.find(timer => timer.delay === 2400).fn();
assert.equal(depleted.$('#pron-word').textContent, 'puno');
console.log('PASS: authoritative pronunciation resume, conflict recovery, safe audio retries, server lives');
