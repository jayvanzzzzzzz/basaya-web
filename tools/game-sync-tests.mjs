import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { setImmediate as tick } from "node:timers/promises";
const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const synthetic = (context, exports) => new vm.SyntheticModule(Object.keys(exports), function () {
  for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
}, { context });
const job = { uid: "student", classId: "class", progressSession: "session", lessonId: "lesson",
  level: 1, attemptId: "attempt", eventId: "stable-event", kind: "finish", words: ["AB", "BA"] };
let checks = 0;
const test = async (label, run) => { await run(); checks++; console.log(`PASS: ${label}`); };
async function setup({ holdToken = false, holdResponse = false } = {}) {
  const timers = new Map(), calls = [];
  let timerId = 0, options;
  const auth = { currentUser: { uid: "student", getIdToken: () => holdToken ? new Promise(() => {}) : Promise.resolve("synthetic-token") } };
  const student = { uid: "student", profile: { classId: "class", progressSession: "session" }, lessons: [{ id: "lesson" }] };
  const context = vm.createContext({ console, AbortController,
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    window: { addEventListener() {} },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      if (holdResponse) await new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("Request aborted"))));
      return { ok: true, json: async () => ({ finished: true }) };
    },
  });
  const firebase = synthetic(context, { auth });
  const sdk = synthetic(context, { sendPasswordResetEmail() {} });
  const config = synthetic(context, { notifyApiUrl: "https://example.test" });
  const api = new vm.SourceTextModule(await source("js/api.js"), { context });
  await api.link(name => name.includes("gstatic") ? sdk : name.endsWith("firebase-config.js") ? config : firebase); await api.evaluate();
  const data = synthetic(context, { student, invalidateStudentData() {} });
  const queue = synthetic(context, { createGameSaves: input => { options = input; return { resume() {} }; } });
  const sync = new vm.SourceTextModule(await source("student/gameSync.js"), { context });
  await sync.link(name => name.endsWith("firebase.js") ? firebase : name.endsWith("api.js") ? api : name.endsWith("data.js") ? data : queue);
  await sync.evaluate();
  return { timers, calls, auth, student, send: () => options.send(job) };
}

await test("the real HTTP helper sends the completion batch and attempt ID together", async () => {
  const ui = await setup(); await ui.send();
  const body = JSON.parse(ui.calls[0].body);
  assert.deepEqual(body.words, ["AB", "BA"]); assert.equal(body.attemptId, "attempt"); assert.equal(body.operation, "finish");
  assert.equal(ui.calls[0].method, "POST"); assert.ok(ui.calls[0].signal); assert.equal(ui.timers.size, 0);
});

await test("a stuck HTTP request is aborted after the timeout instead of blocking the queue forever", async () => {
  const ui = await setup({ holdResponse: true });
  const pending = ui.send(); const rejected = assert.rejects(pending, /Mabagal|aborted/);
  await tick();
  const timeout = [...ui.timers.values()].find(timer => timer.ms === 12_000); assert.ok(timeout);
  timeout.fn(); await rejected;
  assert.equal(ui.calls[0].signal.aborted, true); assert.equal(ui.timers.size, 0);
});

await test("the timeout also bounds a stuck sign-in token refresh before fetch starts", async () => {
  const ui = await setup({ holdToken: true });
  const pending = ui.send(); const rejected = assert.rejects(pending, /Mabagal/);
  await tick(); [...ui.timers.values()][0].fn(); await rejected;
  assert.equal(ui.calls.length, 0); assert.equal(ui.timers.size, 0);
});

await test("queued requests cannot use a different signed-in account", async () => {
  const ui = await setup(); ui.auth.currentUser.uid = "other";
  await assert.rejects(ui.send(), /Nagbago ang account/); assert.equal(ui.calls.length, 0);
});
console.log(`Game sync: ${checks} HTTP, timeout and account scenarios passed.`);
