import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { parseHTML } = require("linkedom");
const pronunciationSource = await readFile(new URL("../student/views/pronunciation.js", import.meta.url), "utf8");
const dataSource = await readFile(new URL("../student/data.js", import.meta.url), "utf8");
const resumeSource = dataSource.match(/export function resumeOf\([^]*?\n\}/)[0].replace("export ", "");
let checks = 0;
async function test(label, run) { await run(); checks++; console.log(`PASS: ${label}`); }

async function render(progress) {
  const { document, window } = parseHTML("<html><body><main></main></body></html>");
  const state = { finishes: [], results: [] };
  const context = vm.createContext({ document, window, console, navigator: { onLine: true }, setTimeout, clearTimeout, Audio: class { pause() {} } });
  const module = exports => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  const $ = (selector, root = document) => root.querySelector(selector);
  const helpers = module({ $, escapeHtml: value => String(value), navigate: path => { state.path = path; }, openModal() {}, toast() {} });
  const sdk = module({ serverTimestamp: () => ({ timestamp: true }) });
  const dictionary = module({ lookupWord: async () => null });
  const syllables = module({ syllabify: word => word });
  const data = module({
    availability: () => "open", clearResume: () => ({}), findLesson: async () => ({ id: "only", title: "Only lesson" }),
    loadLessonProgress: async () => structuredClone(progress),
    loadPronunciation: async () => ({ title: "Bigkas", words: ["bahay", "puno", "bata", "aso", "pusa"].map(word => ({ word })) }),
    resumeOf: vm.runInContext(`(${resumeSource})`, context),
    refreshSummary() {}, saveResume() {}, assessmentRequest: async () => structuredClone(progress.resume?.pronunciation || {}),
    saveProgress: async (lessonId, fields, skill) => { state.finishes.push({ lessonId, fields, skill }); return { score: progress.resume?.pronunciation?.correct || 0 }; },
  });
  const router = module({ onLeave: fn => { state.cleanup = fn; } });
  const speech = module({ Microphone: class { static supported() { return true; } async open() { return "ok"; } close() {} }, browserRecognitionAvailable: () => false, listenWithBrowser() {}, score() {}, transcribe() {} });
  const ui = module({ content: () => $("main"), icon: () => "", talkingBuddy: () => '<span class="st-pron__buddy"></span>', confetti() {}, confettiFrom() {}, setBuddyMood() {}, setTalking() {}, shake() {} });
  const results = module({ renderResults: result => state.results.push(result) });
  const controller = new vm.SourceTextModule(pronunciationSource, { context });
  await controller.link(name => name.includes("gstatic.com") ? sdk : name.endsWith("helpers.js") ? helpers : name.endsWith("dictionary.js") ? dictionary : name.endsWith("syllables.js") ? syllables : name.endsWith("data.js") ? data : name.endsWith("router.js") ? router : name.endsWith("speech.js") ? speech : name.endsWith("results.js") ? results : ui);
  await controller.evaluate(); await controller.namespace.renderPronunciation("only");
  return { $, state };
}
const partial = { resume: { pronunciation: { done: 3, total: 5, correct: 3, firstTryCorrect: 3, lives: 3, misses: 0, hardWords: [] } } };
await test("3/5 restored words show word 4 and 60% progress with no completed lesson", async () => {
  const screen = await render(partial);
  assert.equal(screen.$("#pron-count").textContent, "Salita 4 / 5");
  assert.equal(screen.$("#pron-word").textContent, "aso");
  assert.equal(screen.$("#pron-bar").style.width, "60%");
  assert.equal(screen.$("#pron-lives-count").textContent, "3");
  assert.equal(screen.state.path, undefined); assert.equal(screen.state.finishes.length, 0);
});
await test("resuming an unfinished fourth word keeps its remaining lives", async () => {
  const progress = structuredClone(partial); Object.assign(progress.resume.pronunciation, { lives: 2, misses: 1, hardWords: ["aso"] });
  const screen = await render(progress);
  assert.equal(screen.$("#pron-word").textContent, "aso"); assert.equal(screen.$("#pron-lives-count").textContent, "2");
  assert.equal(screen.state.finishes.length, 0);
});
await test("a finished pronunciation part stays closed to another attempt", async () => {
  const screen = await render({ pronunciationFinished: true });
  assert.equal(screen.state.path, "/lesson/only"); assert.equal(screen.$("#pron-mic"), null); assert.equal(screen.state.finishes.length, 0);
});
await test("all accepted words awaiting finalization save the preserved result once", async () => {
  const progress = structuredClone(partial); Object.assign(progress.resume.pronunciation, { done: 5, correct: 5, firstTryCorrect: 4, hardWords: ["pusa"] });
  const screen = await render(progress);
  assert.equal(screen.state.finishes.length, 1); assert.equal(screen.state.finishes[0].fields.pronunciationScore, 5);
  assert.equal(screen.state.finishes[0].skill.correct, 4); assert.equal(screen.state.finishes[0].skill.items, 5);
});
console.log(`Partial progress UI: ${checks} pronunciation resume scenarios passed.`);
