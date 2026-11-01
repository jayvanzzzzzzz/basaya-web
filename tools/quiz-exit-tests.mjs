import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import { setImmediate as flush } from "node:timers/promises";
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { parseHTML } = require("linkedom");
let checks = 0;
async function test(name, run) { await run(); checks++; console.log(`PASS: ${name}`); }
const exportsModule = (context, values) => new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });

async function dialog() {
  const { document, window } = parseHTML("<html><body><button id='trigger'>Back</button></body></html>");
  let focused;
  Object.defineProperty(document, "activeElement", { get: () => focused });
  window.HTMLElement.prototype.focus = function () { focused = this; };
  document.querySelector("#trigger").focus();
  const context = vm.createContext({ document, console });
  const helpers = exportsModule(context, { escapeHtml: x => x, openModal: (html, mount) => {
    const backdrop = document.createElement("div"); backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<section class="modal"><button class="modal-close">×</button>${html}</section>`;
    document.body.append(backdrop); mount(backdrop, () => backdrop.remove());
  } });
  const icons = exportsModule(context, { icon: () => '<svg viewBox="0 0 24 24"></svg>' });
  const mod = new vm.SourceTextModule(await readFile(new URL("../student/quizExitDialog.js", import.meta.url), "utf8"), { context });
  await mod.link(s => s.endsWith("helpers.js") ? helpers : icons); await mod.evaluate();
  const result = mod.namespace.confirmQuizExit();
  const click = selector => document.querySelector(selector).dispatchEvent(new window.Event("click", { bubbles: true }));
  const key = (value, shiftKey = false) => { const event = new window.Event("keydown", { bubbles: true, cancelable: true }); Object.assign(event, { key: value, shiftKey }); document.dispatchEvent(event); };
  return { document, result, click, key };
}

await test("professional exit dialog describes the loss and defaults to continuing", async () => {
  const ui = await dialog();
  assert.equal(ui.document.querySelector('[role="alertdialog"]').getAttribute("aria-labelledby"), "quiz-exit-title");
  assert.match(ui.document.querySelector("#quiz-exit-description").textContent, /magsisimula muli/);
  assert.equal(ui.document.activeElement.hasAttribute("data-quiz-stay"), true);
  ui.click("[data-quiz-stay]"); assert.equal(await ui.result, false);
  assert.equal(ui.document.activeElement.id, "trigger");
});
await test("Leave is explicit; Escape and close keep the quiz", async () => {
  for (const action of ["leave", "escape", "close"]) {
    const ui = await dialog();
    if (action === "leave") ui.click("[data-quiz-leave]");
    else if (action === "escape") ui.key("Escape");
    else ui.click(".modal-close");
    assert.equal(await ui.result, action === "leave");
    assert.equal(ui.document.querySelector(".modal-backdrop"), null);
  }
});
await test("keyboard focus stays inside the confirmation", async () => {
  const ui = await dialog();
  ui.document.querySelector("[data-quiz-leave]").focus(); ui.key("Tab");
  assert.equal(ui.document.activeElement.className, "modal-close");
  ui.key("Tab", true); assert.equal(ui.document.activeElement.hasAttribute("data-quiz-leave"), true);
  ui.key("Escape"); await ui.result;
});

async function router({ initial = "/lesson/lesson/quiz", homeWait = null, progressWait = null } = {}) {
  const { document, window } = parseHTML('<html><body><div id="app-view"><main id="page-content"></main></div></body></html>');
  const state = { prompts: 0, quizRenders: 0, pathRenders: 0, cleaned: 0 };
  const routes = ["/lesson/lesson", initial];
  let at = 1, mod;
  const location = { hash: "#" + routes[at] };
  const history = {
    state: null,
    pushState(_state, _unused, hash) { routes.splice(at + 1); routes.push(hash.slice(1)); at++; location.hash = hash; },
    back() { if (!at) return; at--; location.hash = "#" + routes[at]; queueMicrotask(() => mod.namespace.renderRoute()); },
  };
  window.scrollTo = () => {};
  const context = vm.createContext({ document, window, location, history, console });
  const renderQuiz = async () => {
    state.quizRenders++; document.querySelector("#page-content").textContent = "Quiz with a selected answer";
    state.release = mod.namespace.beforeLeave(() => { state.prompts++; return new Promise(resolve => { state.decide = resolve; }); });
    mod.namespace.onLeave(() => { state.cleaned++; state.release(); });
  };
  const renderPath = async () => { state.pathRenders++; document.querySelector("#page-content").textContent = "Lesson path"; };
  const renderTab = (name, wait) => async () => {
    let active = true;
    mod.namespace.onLeave(() => { active = false; });
    document.querySelector("main").textContent = name;
    if (wait) await wait.promise;
    if (active) document.querySelector("main").textContent = name + " loaded";
  };
  const helpers = exportsModule(context, { $: s => document.querySelector(s), $$: s => [...document.querySelectorAll(s)], escapeHtml: s => s, navigate: () => {} });
  const data = exportsModule(context, { student: { uid: "student" } });
  const names = { home: "renderHome", join: "renderJoin", lessonPath: "renderLessonPath", lecture: "renderLecture", game: "renderGame", activity: "renderActivity", pronunciation: "renderPronunciation", quiz: "renderQuiz", progress: "renderProgress", chat: "renderChat", notifications: "renderNotifications", account: "renderAccount", dictionary: "renderDictionary" };
  const modules = new Map();
  mod = new vm.SourceTextModule(await readFile(new URL("../student/router.js", import.meta.url), "utf8"), { context });
  await mod.link(specifier => {
    if (specifier.endsWith("helpers.js")) return helpers;
    if (specifier.endsWith("data.js")) return data;
    const name = specifier.split("/").at(-1).replace(".js", "");
    if (!modules.has(name)) modules.set(name, exportsModule(context, { [names[name]]: name === "quiz" ? renderQuiz : name === "lessonPath" ? renderPath : name === "home" ? renderTab("Home", homeWait) : name === "progress" ? renderTab("Progress", progressWait) : () => {}, ...(name === "chat" ? { watchChatBadge: async () => {} } : {}), ...(name === "notifications" ? { refreshBell: async () => {} } : {}) }));
    return modules.get(name);
  });
  await mod.evaluate();
  const initialDraw = mod.namespace.renderRoute();
  if (!homeWait && !progressWait) await initialDraw;
  return { state, document, location, history, initialDraw, draw: () => mod.namespace.renderRoute(), settle: async () => { await flush(); await flush(); } };
}

await test("browser Back cancellation retains the mounted quiz and selected answer", async () => {
  const ui = await router(); ui.history.back(); await ui.settle();
  assert.equal(ui.state.prompts, 1); assert.equal(ui.location.hash, "#/lesson/lesson/quiz");
  assert.equal(ui.state.cleaned, 0); assert.equal(ui.state.pathRenders, 0);
  ui.state.decide(false); await ui.settle();
  assert.equal(ui.state.quizRenders, 1); assert.match(ui.document.querySelector("main").textContent, /selected answer/);
});
await test("confirmed browser Back leaves only after reset and cleans up once", async () => {
  const ui = await router(); ui.history.back(); await ui.settle();
  ui.state.decide(true); await ui.settle();
  assert.equal(ui.location.hash, "#/lesson/lesson"); assert.equal(ui.state.pathRenders, 1); assert.equal(ui.state.cleaned, 1);
});
await test("repeated Back presses cannot bypass a pending decision", async () => {
  const ui = await router(); ui.history.back(); await ui.settle(); ui.history.back(); await ui.settle();
  assert.equal(ui.state.prompts, 1); assert.equal(ui.state.pathRenders, 0); assert.equal(ui.location.hash, "#/lesson/lesson/quiz");
  ui.state.decide(false); await ui.settle(); assert.equal(ui.state.quizRenders, 1);
});
await test("Home loading does not delay Progress navigation or overwrite it after resolving", async () => {
  let resolve;
  const homeWait = { promise: new Promise(r => { resolve = r; }) };
  const ui = await router({ initial: "/home", homeWait });
  ui.location.hash = "#/progress"; await ui.draw();
  assert.equal(ui.document.querySelector("main").textContent, "Progress loaded");
  resolve(); await ui.initialDraw;
  assert.equal(ui.document.querySelector("main").textContent, "Progress loaded");
});
await test("late Progress failure cannot replace Home with an error screen", async () => {
  let reject;
  const progressWait = { promise: new Promise((_resolve, r) => { reject = r; }) };
  const ui = await router({ initial: "/progress", progressWait });
  ui.location.hash = "#/home"; await ui.draw();
  reject(new Error("Late failure")); await ui.initialDraw;
  assert.equal(ui.document.querySelector("main").textContent, "Home loaded");
});
console.log(`Navigation: ${checks} dialog, browser-navigation and delayed-loading scenarios passed.`);
