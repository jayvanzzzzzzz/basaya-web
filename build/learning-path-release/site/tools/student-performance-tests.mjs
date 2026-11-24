import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { setImmediate as tick } from "node:timers/promises";
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { parseHTML } = require("linkedom");
const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { await tick(); await tick(); };
let checks = 0;
const test = async (label, run) => { await run(); checks++; console.log(`PASS: ${label}`); };
const synthetic = (context, exports) => new vm.SyntheticModule(Object.keys(exports), function () {
  for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
}, { context });
const storage = () => {
  const rows = new Map();
  return { rows, get length() { return rows.size; }, key: index => [...rows.keys()][index] ?? null,
    getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) };
};

await test("rapid lecture page saves remain ordered while a request is stalled", async () => {
  const localStorage = storage(), context = vm.createContext({ localStorage });
  const mod = new vm.SourceTextModule(await source("student/lectureSaves.js"), { context });
  await mod.link(() => {}); await mod.evaluate();
  const calls = [], blocked = deferred();
  const queue = mod.namespace.lectureSaves({ total: 3, key: "lesson", save: async done => { calls.push(done); if (done === 1) await blocked.promise; } });
  queue.advance(1); queue.advance(2); queue.advance(3);
  await settle();
  assert.deepEqual(calls, [1]);
  assert.equal(JSON.parse(localStorage.getItem("lesson")).done, 3);
  let finished = false;
  const finishing = queue.flush().then(() => { finished = true; });
  await settle(); assert.equal(finished, false);
  blocked.resolve(); await finishing;
  assert.deepEqual(calls, [1, 2, 3]); assert.equal(localStorage.getItem("lesson"), null);
});

await test("failed lecture saves survive reload and retry from the server's accepted page", async () => {
  const localStorage = storage(), context = vm.createContext({ localStorage });
  const mod = new vm.SourceTextModule(await source("student/lectureSaves.js"), { context });
  await mod.link(() => {}); await mod.evaluate();
  let warnings = 0;
  const queue = mod.namespace.lectureSaves({ total: 3, key: "lesson", save: async () => { throw new Error("Offline"); }, onError: () => warnings++ });
  queue.advance(2); await settle();
  assert.equal(warnings, 1); assert.equal(JSON.parse(localStorage.getItem("lesson")).done, 2);
  const calls = [];
  const reopened = mod.namespace.lectureSaves({ done: 1, total: 3, key: "lesson", save: async done => calls.push(done) });
  await reopened.flush(); assert.deepEqual(calls, [2]);
  assert.equal(localStorage.getItem("lesson"), null);
});

async function screen(part, { progress = {}, levels = [{ level: 1, words: ["AB", "BA"] }], gameState = null, savedStorage = storage(), finishWait = null } = {}) {
  const { document, window } = parseHTML('<html><body><main id="page-content"></main></body></html>');
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const calls = [], finishes = [], requests = [], cleanup = [], notices = [], localStorage = savedStorage;
  const navigator = { onLine: true };
  const context = vm.createContext({ document, window, navigator, localStorage, console, AbortController,
    crypto: { randomUUID }, requestAnimationFrame: fn => fn(),
    setTimeout: (fn, ms) => { if (ms < 300) queueMicrotask(fn); return 1; }, clearTimeout() {} });
  const $ = (selector, root = document) => root.querySelector(selector);
  const lesson = { id: "lesson", contentVersion: 1, title: "Lesson" };
  const helpers = synthetic(context, { $, $$: (s, r = document) => [...r.querySelectorAll(s)], escapeHtml: String,
    navigate: path => { calls.push({ path }); }, toast: text => notices.push(text) });
  const data = synthetic(context, {
    student: { uid: "student", profile: { classId: "class", progressSession: "session" }, lessons: [lesson] },
    findLesson: async () => lesson, availability: () => "open", resumeOf: () => null, clearResume: () => ({}),
    loadLecture: async () => ({ title: "Lesson", pages: [1, 2, 3].map(() => ({ sentences: ["Read"], audioUrls: [], wordStarts: [] })) }),
    loadLessonProgress: async () => progress, loadGameLevels: async () => levels,
    assessmentRequest: async (_id, operation, fields) => {
      requests.push({ operation, ...fields });
      const current = gameState || { level: levels[0].level, completedLevels: 0, resume: { foundWords: [] } };
      return { attemptId: "attempt", ...current, resume: { level: current.level, ...current.resume } };
    },
    saveResume: (_id, _part, fields) => { const wait = deferred(); calls.push({ ...fields, wait }); return wait.promise; },
    submitAnswer: (_id, _part, fields) => { const wait = deferred(); calls.push({ ...fields, wait }); return wait.promise; },
    saveProgress: async (_id, fields) => { finishes.push(fields); if (finishWait) await finishWait.promise; return { finished: fields.gameFinished ?? true }; },
  });
  const router = synthetic(context, { onLeave: fn => cleanup.push(fn) });
  const ui = synthetic(context, { content: () => $("main"), icon: () => "", buddy: () => "", talkingBuddy: () => "",
    confetti() {}, setTalking() {}, showDialog: async () => "primary" });
  const audio = synthetic(context, { downloadPageAudio: async () => {}, audioSource: x => x,
    lecturePlayer: () => ({ addEventListener() {}, pause() {}, removeAttribute() {}, play: async () => {} }) });
  const readAlong = synthetic(context, { followAlong: () => () => {}, fillSentence: (el, text) => { el.textContent = text; } });
  const grid = synthetic(context, { buildCrossword: () => ({ rows: 2, columns: 2,
    placements: [{ wordIndex: 0, row: 0, column: 0, direction: "across" }, { wordIndex: 1, row: 1, column: 0, direction: "across" }] }) });
  const queue = new vm.SourceTextModule(await source("student/lectureSaves.js"), { context });
  await queue.link(() => {}); await queue.evaluate();
  const gameQueue = new vm.SourceTextModule(await source("student/gameSaves.js"), { context });
  await gameQueue.link(() => {}); await gameQueue.evaluate();
  const gameSaveScope = () => ({ uid: "student", classId: "class", progressSession: "session" });
  const gameSaves = gameQueue.namespace.createGameSaves({
    getScope: gameSaveScope, storage: localStorage, online: () => navigator.onLine,
    schedule: () => 1, cancel() {}, send: job => job.kind === "answer"
      ? data.namespace.submitAnswer(job.lessonId, "game", { level: job.level, word: job.word, eventId: job.eventId, attemptId: job.attemptId })
      : data.namespace.saveProgress(job.lessonId, { gameScore: levels.findIndex(item => item.level === job.level) + 1,
        gameLevel: job.level, words: job.words, gameFinished: job.level === levels.at(-1).level }),
  });
  const gameSync = synthetic(context, { gameSaves, gameSaveScope });
  const mod = new vm.SourceTextModule(await source(`student/views/${part}.js`), { context });
  await mod.link(name => name.endsWith("helpers.js") ? helpers : name.endsWith("data.js") ? data : name.endsWith("router.js") ? router :
    name.endsWith("lectureSaves.js") ? queue : name.endsWith("gameSync.js") ? gameSync : name.endsWith("lectureAudio.js") ? audio : name.endsWith("readAlong.js") ? readAlong :
    name.endsWith("gameLevels.js") ? grid : ui);
  await mod.evaluate(); await mod.namespace[part === "lecture" ? "renderLecture" : "renderGame"]("lesson");
  const click = selector => $(selector).dispatchEvent(new window.Event("click", { bubbles: true }));
  const spell = word => {
    const letters = [...document.querySelectorAll(".st-wheel-letter")];
    letters.forEach((el, i) => {
      Object.defineProperties(el, { offsetLeft: { configurable: true, value: i * 100 }, offsetTop: { configurable: true, value: 0 },
        offsetWidth: { configurable: true, value: 60 }, offsetHeight: { configurable: true, value: 60 } });
    });
    $("#game-wheel").getBoundingClientRect = () => ({ left: 0, top: 0 });
    for (let i = 0; i < word.length; i++) {
      const el = letters.find(el => el.textContent === word[i]);
      const event = new window.Event(i ? "pointermove" : "pointerdown", { bubbles: true });
      Object.assign(event, { clientX: el.offsetLeft + 30, clientY: 30, pointerId: 1 });
      $("#game-wheel").dispatchEvent(event);
    }
    $("#game-wheel").dispatchEvent(new window.Event("pointerup"));
  };
  return { $, document, calls, finishes, requests, cleanup, click, spell, notices, navigator, gameSaves, localStorage };
}

await test("Susunod displays page 2 and page 3 before the first save responds; Tapusin waits", async () => {
  const ui = await screen("lecture");
  ui.click("#lecture-next");
  assert.match(ui.$("#lecture-page").textContent, /PAHINA 2/);
  ui.click("#lecture-next");
  assert.match(ui.$("#lecture-page").textContent, /PAHINA 3/);
  await settle();
  assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].done, 1);
  ui.click("#lecture-next"); await settle(); assert.equal(ui.finishes.length, 0);
  ui.calls[0].wait.resolve(); await settle(); assert.equal(ui.calls[1].done, 2);
  ui.calls[1].wait.resolve(); await settle(); assert.equal(ui.calls[2].done, 3);
  ui.calls[2].wait.resolve(); await settle(); assert.equal(ui.finishes.length, 1);
});

await test("crossword paints words before server responses, serializes saves and blocks early completion", async () => {
  const finishWait = deferred();
  const ui = await screen("game", { finishWait });
  ui.spell("AB");
  assert.equal(ui.document.querySelectorAll(".st-cell.is-found").length, 2, "Painting must not wait for a timer or server response");
  await settle();
  assert.equal(ui.document.querySelectorAll(".st-cell.is-found").length, 2);
  assert.equal(ui.$("#game-save-status"), null);
  assert.ok(!/Sine-save/i.test(ui.document.body.textContent));
  ui.spell("AB"); await settle(); assert.equal(ui.calls.length, 1, "Repeated word must not submit twice");
  ui.spell("BA"); await settle();
  assert.equal(ui.document.querySelectorAll(".st-cell.is-found").length, 4);
  assert.equal(ui.calls.length, 1); assert.equal(ui.finishes.length, 0);
  ui.calls[0].wait.resolve(); await settle();
  assert.equal(ui.calls.length, 1, "Pending words must finalize in one batch");
  assert.equal(ui.finishes.length, 1);
  assert.deepEqual(Array.from(ui.finishes[0].words), ["AB", "BA"]);
  assert.equal(ui.$("#level-next"), null, "Completion still needs server acceptance");
  finishWait.resolve(); await settle();
  assert.ok(ui.$("#level-next"), "Show the next screen immediately after acceptance without a 500ms timer");
});

await test("failed crossword saves retain their submission ID and can be retried", async () => {
  const ui = await screen("game");
  ui.spell("AB"); await settle();
  ui.navigator.onLine = false;
  ui.calls[0].wait.reject(new TypeError("Network failed")); await settle();
  assert.equal(ui.$("#game-retry").hidden, false); assert.equal(ui.finishes.length, 0);
  ui.navigator.onLine = true; ui.click("#game-retry"); await settle();
  assert.equal(ui.calls[1].eventId, ui.calls[0].eventId);
  ui.calls[1].wait.resolve(); await settle(); assert.equal(ui.$("#game-retry").hidden, true);
  assert.equal(ui.finishes.length, 0);
});

await test("legacy gameScore cannot open a different level from the server's current level", async () => {
  const ui = await screen("game", { progress: { gameScore: 1 },
    levels: [{ level: 1, words: ["AB", "BA"] }, { level: 2, words: ["BA", "AB"] }],
    gameState: { level: 1, completedLevels: 0, resume: { foundWords: [] } } });
  assert.match(ui.$(".st-game__level").textContent, /Antas 1/);
  ui.spell("AB"); await settle();
  assert.equal(ui.calls[0].level, 1);
  assert.deepEqual(ui.requests, [{ operation: "begin", part: "game" }]);
});

await test("gapped level numbers use the server's ID while completion counts levels in order", async () => {
  const ui = await screen("game", {
    levels: [{ level: 3, words: ["AB", "BA"] }, { level: 7, words: ["BA", "AB"] }],
    gameState: { level: 3, completedLevels: 0, resume: { foundWords: [] } } });
  ui.spell("AB"); await settle(); ui.calls[0].wait.resolve(); await settle();
  ui.spell("BA"); await settle();
  assert.equal(ui.calls[0].level, 3);
  assert.equal(ui.finishes[0].gameLevel, 3);
  assert.equal(ui.finishes[0].gameScore, 1);
  assert.equal(ui.finishes[0].gameFinished, false);
});

await test("a crossword level conflict stops queued words instead of repeatedly submitting the wrong level", async () => {
  const ui = await screen("game");
  ui.spell("AB"); await settle(); ui.spell("BA"); await settle();
  const conflict = new Error("Refresh the current crossword level."); conflict.status = 409;
  ui.calls[0].wait.reject(conflict); await settle();
  assert.equal(ui.calls.filter(call => call.word).length, 1);
  assert.equal(ui.calls.filter(call => call.path === "/lesson/lesson").length, 1);
  assert.equal(ui.finishes.length, 0);
});

await test("Back keeps both queued words saving and finalizes only after both acknowledgements", async () => {
  const ui = await screen("game");
  ui.spell("AB"); await settle(); ui.spell("BA"); await settle();
  assert.equal(ui.gameSaves.entries().length, 3, "Two words and finalization are stored durably");
  ui.cleanup.forEach(fn => fn());
  ui.document.querySelector("main").textContent = "Lesson path";
  ui.calls[0].wait.resolve(); await settle();
  assert.equal(ui.calls.length, 1); assert.deepEqual(Array.from(ui.finishes[0].words), ["AB", "BA"]);
  assert.equal(ui.finishes.length, 1); assert.equal(ui.gameSaves.entries().length, 0);
  assert.equal(ui.document.querySelector("main").textContent, "Lesson path", "Background saves must not replace the screen");
});

await test("reopening restores pending word tiles and retries with the original submission ID", async () => {
  const first = await screen("game");
  first.spell("AB"); await settle();
  const eventId = first.calls[0].eventId;
  first.cleanup.forEach(fn => fn()); first.gameSaves.dispose();
  const reopened = await screen("game", { savedStorage: first.localStorage });
  assert.equal(reopened.document.querySelectorAll(".st-cell.is-found").length, 2);
  await settle(); assert.equal(reopened.calls[0].eventId, eventId);
  reopened.calls[0].wait.resolve(); await settle();
  assert.equal(reopened.gameSaves.entries().length, 0); assert.equal(reopened.finishes.length, 0);
});

await test("wrong guesses show immediate feedback without recording a word or score", async () => {
  const ui = await screen("game", { levels: [{ level: 1, words: ["AB", "AC"] }] });
  ui.spell("BC");
  assert.ok(ui.$("#game-preview").classList.contains("is-error"));
  await settle();
  assert.equal(ui.calls.length, 0); assert.equal(ui.finishes.length, 0); assert.equal(ui.gameSaves.entries().length, 0);
});

console.log(`Student performance: ${checks} delayed-network and recovery scenarios passed.`);
