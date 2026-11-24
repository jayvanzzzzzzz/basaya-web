import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { setImmediate as tick } from "node:timers/promises";
const source = await readFile(new URL("../student/gameSaves.js", import.meta.url), "utf8");
const settle = async () => { await tick(); await tick(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const storage = () => {
  const data = new Map();
  return { data, get length() { return data.size; }, key: i => [...data.keys()][i],
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
let checks = 0;
const test = async (name, run) => { await run(); checks++; console.log(`PASS: ${name}`); };
async function setup({ send = async () => ({}), store = storage() } = {}) {
  let now = 100_000, scope = { uid: "a", classId: "class", progressSession: "session" }, connected = true;
  const calls = [], timers = new Map();
  let timerId = 0, eventId = 0;
  const context = vm.createContext({ console, Date: { now: () => now } });
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(() => {}); await mod.evaluate();
  const queue = mod.namespace.createGameSaves({ getScope: () => scope, storage: store, online: () => connected,
    schedule: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; }, cancel: id => timers.delete(id),
    send: async job => { calls.push(job); return send(job); },
  });
  const job = (kind = "answer", word = "AB") => ({ ...scope, lessonId: "lesson", level: 1, attemptId: "attempt", kind, word, eventId: `event-${++eventId}` });
  return { queue, calls, store, timers, job,
    scope: next => { scope = next; }, online: value => { connected = value; },
    advance: async ms => {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
      await settle();
    },
  };
}

await test("offline words survive a service restart and keep their submission IDs", async () => {
  const initial = await setup(); initial.online(false);
  const word = initial.job(); initial.queue.enqueue(word); await settle();
  assert.equal(initial.calls.length, 0); assert.equal(initial.store.length, 1);
  initial.queue.dispose();
  const reopened = await setup({ store: initial.store });
  await reopened.queue.resume();
  assert.equal(reopened.calls[0].eventId, word.eventId); assert.equal(initial.store.length, 0);
});

await test("network failures retry automatically with backoff and the same submission ID", async () => {
  let attempts = 0;
  const ui = await setup({ send: async () => { if (!attempts++) throw new TypeError("Connection dropped"); return {}; } });
  const word = ui.job(); ui.queue.enqueue(word); await settle();
  assert.equal(ui.calls.length, 1); assert.equal(ui.store.length, 1);
  await ui.advance(999); assert.equal(ui.calls.length, 1);
  await ui.advance(1); assert.equal(ui.calls.length, 2);
  assert.equal(ui.calls[1].eventId, word.eventId); assert.equal(ui.store.length, 0);
});

await test("a failed word blocks level finalization until its retry is accepted", async () => {
  let failed = false;
  const ui = await setup({ send: async job => {
    if (job.kind === "answer" && !failed) { failed = true; throw new TypeError("Offline"); }
    return {};
  } });
  ui.queue.enqueue(ui.job()); ui.queue.enqueue(ui.job("finish")); await settle();
  assert.equal(ui.calls.filter(job => job.kind === "finish").length, 0);
  await ui.advance(1000);
  assert.deepEqual(ui.calls.map(job => job.kind), ["answer", "answer", "finish"]);
  assert.equal(ui.store.length, 0);
});

await test("another account or class session cannot replay a student's pending words", async () => {
  const ui = await setup(); ui.online(false);
  ui.queue.enqueue(ui.job()); await settle(); ui.online(true);
  ui.scope({ uid: "b", classId: "class", progressSession: "session" });
  await ui.queue.resume(); assert.equal(ui.calls.length, 0);
  ui.scope({ uid: "a", classId: "class", progressSession: "new-session" });
  await ui.queue.resume(); assert.equal(ui.calls.length, 0);
  ui.scope({ uid: "a", classId: "class", progressSession: "session" });
  await ui.queue.resume(); assert.equal(ui.calls.length, 1);
});

await test("permanent conflicts pause a level and do not hammer the server", async () => {
  const conflict = new Error("This crossword attempt changed. Reopen the game."); conflict.status = 409;
  const ui = await setup({ send: async () => { throw conflict; } });
  ui.queue.enqueue(ui.job()); ui.queue.enqueue(ui.job("answer", "BA")); ui.queue.enqueue(ui.job("finish"));
  await settle(); assert.equal(ui.calls.length, 1); assert.equal(ui.store.length, 3);
  await ui.advance(60_000); await ui.queue.resume({ immediate: true });
  assert.equal(ui.calls.length, 1); assert.equal(ui.timers.size, 0);
  ui.queue.reconcile({ lessonId: "lesson", level: 1, attemptId: "new-attempt" }); await settle();
  assert.equal(ui.store.length, 0, "An authoritative new attempt discards obsolete requests without submitting them");
});

await test("a server-accepted word is reconciled without submitting it again", async () => {
  const ui = await setup(); ui.online(false);
  ui.queue.enqueue(ui.job()); await settle();
  ui.queue.reconcile({ lessonId: "lesson", level: 1, attemptId: "attempt" }, ["AB"]);
  ui.online(true); await ui.queue.resume();
  assert.equal(ui.calls.length, 0); assert.equal(ui.store.length, 0);
});

await test("duplicate word enqueueing persists one request and one stable submission ID", async () => {
  const ui = await setup(); ui.online(false);
  const first = ui.queue.enqueue(ui.job());
  const second = ui.queue.enqueue(ui.job()); await settle();
  assert.equal(first.eventId, second.eventId); assert.equal(ui.store.length, 1);
  ui.online(true); await ui.queue.resume(); assert.equal(ui.calls.length, 1);
});

await test("storage failure is reported before a word can be lost silently", async () => {
  const store = storage(); store.setItem = () => { throw new Error("Storage full"); };
  const ui = await setup({ store });
  assert.throws(() => ui.queue.enqueue(ui.job()), /Storage full/);
  assert.equal(ui.calls.length, 0); assert.equal(ui.store.length, 0);
});

await test("the last word finalizes all remaining correct words in one request after the active save", async () => {
  const first = deferred(), finish = deferred();
  const ui = await setup({ send: job => job.kind === "answer" ? first.promise : finish.promise });
  ui.queue.enqueue(ui.job("answer", "AB")); await settle();
  ui.queue.enqueue(ui.job("answer", "BA"));
  ui.queue.enqueue({ ...ui.job("finish"), words: ["AB", "BA"] }); await settle();
  assert.equal(ui.calls.length, 1);
  first.resolve({}); await settle();
  assert.equal(ui.calls.length, 2);
  assert.equal(ui.calls[1].kind, "finish", "Do not wait for another separate word request");
  assert.deepEqual(ui.calls[1].words, ["AB", "BA"]);
  assert.equal(ui.store.length, 2, "Keep the last word and finalization durable until the server confirms both");
  finish.resolve({ finished: true }); await settle();
  assert.equal(ui.store.length, 0);
});

await test("a lost finalization response retries the batch without replaying individual words", async () => {
  let attempt = 0;
  const ui = await setup({ send: async job => {
    if (job.kind === "finish" && !attempt++) throw new TypeError("Response lost after commit");
    return { finished: true };
  } });
  ui.online(false);
  ui.queue.enqueue(ui.job("answer", "AB")); ui.queue.enqueue(ui.job("answer", "BA"));
  ui.queue.enqueue({ ...ui.job("finish"), words: ["AB", "BA"] }); await settle();
  ui.online(true); await ui.queue.resume();
  assert.deepEqual(ui.calls.map(job => job.kind), ["finish"]);
  assert.equal(ui.store.length, 3);
  await ui.advance(1000);
  assert.deepEqual(ui.calls.map(job => job.kind), ["finish", "finish"]);
  assert.equal(ui.store.length, 0);
});

await test("older pending finalization records upgrade to a batch without changing their identity", async () => {
  const ui = await setup(); ui.online(false);
  ui.queue.enqueue(ui.job("answer", "AB"));
  const old = ui.queue.enqueue(ui.job("finish"));
  ui.queue.enqueue(ui.job("answer", "BA"));
  const upgraded = ui.queue.enqueue({ ...ui.job("finish"), words: ["AB", "BA"] }); await settle();
  assert.equal(upgraded.eventId, old.eventId); assert.equal(ui.store.length, 3);
  ui.online(true); await ui.queue.resume();
  assert.deepEqual(ui.calls.map(job => job.kind), ["finish"]); assert.equal(ui.store.length, 0);
});

console.log(`Game save queue: ${checks} persistence, retry and ownership scenarios passed.`);
