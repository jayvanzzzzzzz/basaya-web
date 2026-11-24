import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { setImmediate as flush } from "node:timers/promises";
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { parseHTML } = require("linkedom");
let checks = 0;
const test = async (label, run) => { await run(); checks++; console.log(`PASS: ${label}`); };

async function setup(part, { offline = false, practice = false, progress = {} } = {}) {
  const { document, window } = parseHTML("<html><body><main></main></body></html>");
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const state = { calls: [], finishes: [], notices: [], score: 0, requests: [], dialogs: 0, leaveDecision: false };
  const context = vm.createContext({ window, document, console, navigator: { onLine: !offline }, crypto: { randomUUID }, setTimeout, clearTimeout });
  const module = exports => new vm.SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); }, { context });
  const $ = (selector, root = document) => root.querySelector(selector);
  const helpers = module({ $, $$: (s, root = document) => [...root.querySelectorAll(s)], escapeHtml: s => String(s), navigate: path => { state.path = path; }, toast: s => state.notices.push(s) });
  const quiz = { title: "Quiz", questions: [
    { question: "First?", choices: ["First wrong", "First right"], correct: new Set(), multiple: false },
    { question: "Second?", choices: ["Second right", "Second wrong"], correct: new Set(), multiple: false },
  ] };
  const activity = { title: "Activity", pages: [{ words: ["wrong", "right"], correctIndices: [], pickCount: 1 }] };
  const data = module({
    student: { uid: "student", profile: { classId: "class", progressSession: "session" } },
    assessmentRequest: async (lessonId, operation, fields) => {
      state.requests.push({ lessonId, operation, ...fields });
      if (operation === "begin") return { attemptId: "attempt", resume: progress.resume?.quiz || { done: 0, total: 2, answered: [], missed: [], score: 0 } };
      if (state.resetError) throw new Error("Offline");
      return { abandoned: true };
    },
    availability: () => "open", findLesson: async () => ({ id: "lesson", practice }),
    loadLessonProgress: async () => ({ lectureFinished: true, ...progress }), loadQuiz: async () => quiz, loadActivity: async () => activity,
    refreshSummary: () => {}, clearResume: () => ({}), saveResume: () => { throw new Error("A client must not save scored resume state"); },
    resumeOf: (p, name) => p.resume?.[name] || null,
    submitAnswer: async (lessonId, name, fields) => {
      state.calls.push({ lessonId, part: name, ...fields });
      if (state.fail) { state.fail = false; throw new Error("Connection dropped"); }
      if (name === "quiz") {
        const right = fields.selected.length === 1 && fields.selected[0] === (fields.index === 0 ? 1 : 0);
        state.score += Number(right);
        return { score: state.score, total: 2, right };
      }
      const right = fields.selected.length === 1 && fields.selected[0] === 1;
      return { right, over: right, correctIndices: right ? [1] : [], explanation: right ? "Good" : "" };
    },
    saveProgress: async (lessonId, fields) => { state.finishes.push({ lessonId, fields }); return { finished: true, score: state.score, total: part === "quiz" ? 2 : 1 }; },
  });
  const firestore = module({ serverTimestamp: () => ({ server: true }) });
  const router = module({ onLeave: fn => { state.cleanup = fn; }, beforeLeave: fn => { state.guard = fn; return () => { state.guard = null; }; } });
  const exitDialog = module({ confirmQuizExit: async () => { state.dialogs++; return state.leaveDecision; } });
  const ui = module({ content: () => $("main"), icon: () => "", buddy: () => '<span class="st-buddy"></span>', setBuddyMood: () => {}, confettiFrom: () => {}, shake: () => {} });
  const results = module({ renderResults: result => { state.result = result; } });
  const controller = new vm.SourceTextModule(await readFile(new URL(`../student/views/${part}.js`, import.meta.url), "utf8"), { context });
  await controller.link(specifier => specifier.includes("gstatic.com") ? firestore : specifier.endsWith("helpers.js") ? helpers : specifier.endsWith("data.js") ? data : specifier.endsWith("router.js") ? router : specifier.endsWith("results.js") ? results : specifier.endsWith("quizExitDialog.js") ? exitDialog : ui);
  await controller.evaluate();
  await controller.namespace[part === "quiz" ? "renderQuiz" : "renderActivity"]("lesson");
  const click = selector => $(selector).dispatchEvent(new window.Event("click", { bubbles: true }));
  const settle = async () => { await flush(); await flush(); };
  return { state, document, $, click, settle };
}

await test("shuffled quiz choices submit original indices and display the server result", async () => {
  const ui = await setup("quiz");
  for (let i = 0; i < 2; i++) {
    assert.equal(ui.$("#quiz-next").disabled, true);
    const right = [...ui.document.querySelectorAll("[data-choice]")].find(el => el.textContent.includes("right"));
    right.dispatchEvent(new ui.document.defaultView.Event("click", { bubbles: true }));
    ui.click("#quiz-next"); ui.click("#quiz-next");
    await ui.settle();
  }
  assert.equal(ui.state.calls.length, 2);
  for (const call of ui.state.calls) assert.deepEqual(Array.from(call.selected), [call.index === 0 ? 1 : 0]);
  assert.equal(ui.state.finishes.length, 1);
  assert.equal(ui.state.result.score, 2);
});
await test("failed answer submission stays on the question and retries the same submission ID", async () => {
  const ui = await setup("quiz"); ui.state.fail = true;
  ui.click("[data-choice]");
  const question = ui.$("#quiz-question").textContent;
  ui.click("#quiz-next"); await ui.settle();
  assert.equal(ui.$("#quiz-question").textContent, question);
  assert.equal(ui.state.finishes.length, 0);
  ui.click("#quiz-next"); await ui.settle();
  assert.equal(ui.state.calls[0].eventId, ui.state.calls[1].eventId);
  assert.equal(ui.state.notices[0], "Connection dropped");
});
await test("activity needs no answer keys and waits for server feedback", async () => {
  const ui = await setup("activity");
  assert.equal(ui.$("#activity-pick").textContent, "Pumili ng 1 salita");
  ui.click('[data-index="1"]'); ui.click("#activity-action"); ui.click("#activity-action");
  await ui.settle();
  assert.equal(ui.state.calls.length, 1);
  assert.equal(ui.$("#activity-action").textContent, "Tapusin");
  assert.ok(ui.$('[data-index="1"]').classList.contains("is-right"));
  ui.click("#activity-action"); await ui.settle();
  assert.equal(ui.state.finishes.length, 1);
  assert.equal(ui.state.result.score, 0, "The official result comes from the server, even if the local display expected 1");
});
await test("reloading a quiz resumes only unanswered questions", async () => {
  const ui = await setup("quiz", { progress: { resume: { quiz: { done: 1, total: 2, answered: [0], score: 0, missed: ["First?"] } } } });
  assert.equal(ui.$("#quiz-question").textContent, "Second?");
});
await test("Back requests navigation and cancelling preserves the question and selected answer", async () => {
  const ui = await setup("quiz");
  ui.click("[data-choice]");
  const question = ui.$("#quiz-question").textContent;
  ui.click("#quiz-back");
  assert.equal(ui.state.path, "/lesson/lesson");
  assert.equal(await ui.state.guard(), false);
  assert.equal(ui.state.dialogs, 1);
  assert.equal(ui.$("#quiz-question").textContent, question);
  assert.ok(ui.$(".st-choice.is-picked"));
  assert.equal(ui.state.requests.filter(r => r.operation === "abandon").length, 0);
});
await test("confirmed exit abandons the exact quiz attempt", async () => {
  const ui = await setup("quiz"); ui.state.leaveDecision = true;
  assert.equal(await ui.state.guard(), true);
  const request = ui.state.requests.find(r => r.operation === "abandon");
  assert.equal(request.attemptId, "attempt"); assert.equal(request.part, "quiz");
});
await test("reset failure keeps the quiz open with its selected answer", async () => {
  const ui = await setup("quiz"); ui.state.leaveDecision = true; ui.state.resetError = true;
  ui.click("[data-choice]");
  assert.equal(await ui.state.guard(), false);
  assert.ok(ui.$(".st-choice.is-picked"));
  assert.equal(ui.$("#quiz-back").disabled, false);
  assert.match(ui.state.notices[0], /Mananatili muna ang iyong mga sagot/);
});
await test("practice exit confirms without writing assessment state", async () => {
  const ui = await setup("quiz", { practice: true }); ui.state.leaveDecision = true;
  assert.equal(await ui.state.guard(), true);
  assert.equal(ui.state.dialogs, 1); assert.equal(ui.state.requests.length, 0);
});
await test("offline quiz/activity entry gives a connection notice without submitting", async () => {
  for (const part of ["quiz", "activity"]) {
    const ui = await setup(part, { offline: true });
    assert.equal(ui.state.path, "/lesson/lesson"); assert.equal(ui.state.calls.length, 0); assert.equal(ui.state.notices.length, 1);
  }
});
await test("assessment HTTP handler requires authentication and handles preflight", async () => {
  const context = vm.createContext({ console });
  const module = exports => new vm.SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); }, { context });
  let called = false;
  const auth = module({ allowCors: () => {}, requireUser: async (_req, res) => { res.status(401).json({ error: "Not signed in" }); return null; } });
  const firebase = module({ db: () => { called = true; throw new Error("Must not access database before authentication"); } });
  const service = module({ AssessmentError: class AssessmentError extends Error {}, assessmentOperation: () => { called = true; } });
  const speech = module({ submitSpeech: () => { called = true; }, fluencyOperation: () => { called = true; }, dictionaryAudioOperation: () => { called = true; } });
  const handler = new vm.SourceTextModule(await readFile(new URL("../notify-api/handlers/assessment.js", import.meta.url), "utf8"), { context });
  await handler.link(s => s.endsWith("firebase.js") ? firebase : s.endsWith("http.js") ? auth : s.endsWith("assessments.js") ? service : speech);
  await handler.evaluate();
  for (const [method, code] of [["POST", 401], ["GET", 405], ["OPTIONS", 204]]) {
    const response = { setHeader() {}, status(status) { this.code = status; return this; }, json(body) { this.body = body; return this; }, end() {} };
    await handler.namespace.default({ method, body: { operation: "finish", uid: "victim" } }, response);
    assert.equal(response.code, code);
  }
  assert.equal(called, false);
});
console.log(`Assessment screens: ${checks} scenarios passed.`);
