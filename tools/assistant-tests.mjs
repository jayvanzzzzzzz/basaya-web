import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { startFirestoreTestServer } from "./firestore-test-server.mjs";
import { createAssistant, validateQuestion, LIMITS } from "../notify-api/lib/assistant.js";
import handler from "../notify-api/handlers/assistant.js";
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const app = initializeApp({ projectId: emulator.project }), db = getFirestore(app);
let time = Date.parse("2026-11-02T10:00:00Z"), calls = 0, mode = "ok", release, lastBody, tests = 0;
const fakeFetch = async (_url, options) => {
  calls++; lastBody = JSON.parse(options.body);
  assert.equal(options.headers.Authorization, "Bearer test-key");
  if (mode === "wait") await new Promise(resolve => { release = resolve; });
  if (mode === "timeout") throw new DOMException("Timed out", "TimeoutError");
  if (mode === "rate") return new Response("private provider detail", { status: 429, headers: { "retry-after": "120" } });
  if (mode === "error") return new Response("private provider detail", { status: 500 });
  return Response.json({ choices: [{ message: { content: "Ilagay ang class code at hintayin ang pag-apruba ng guro." } }], usage: { total_tokens: 1200 } });
};
const ask = createAssistant({ firestore: db, apiKey: "test-key", now: () => time, fetchImpl: fakeFetch });
const test = async (name, run) => { await run(); tests++; console.log(`PASS: ${name}`); };
const errorCode = (promise, code) => assert.rejects(promise, error => error.code === code);
const advance = () => { time += 61_000; };
const globalRef = () => db.doc(`assistantUsage/${new Date(time).toISOString().slice(0, 10)}`);
try {
  for (const uid of ["student", "other", "fresh", "fail", "timeout", "rate", "day", "token"]) await db.doc(`users/${uid}`).set({ role: "student" });
  await db.doc("users/teacher").set({ role: "teacher" });
  await test("HTTP endpoint handles preflight and requires sign-in without cache", async () => {
    const call = async method => {
      const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.code = s; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
      await handler({ method, headers: { origin: "http://localhost" }, body: { question: "help" } }, res);
      return res;
    };
    assert.equal((await call("OPTIONS")).code, 204);
    assert.equal((await call("GET")).code, 405);
    const res = await call("POST"); assert.equal(res.code, 401);
    assert.equal(res.headers["Cache-Control"], "no-store");
    assert.equal(res.headers["Access-Control-Allow-Origin"], "http://localhost");
  });
  await test("bundled backend help exactly matches the public source", async () => {
    const source = await readFile(new URL("../js/assistantHelp.js", import.meta.url), "utf8");
    const bundled = await readFile(new URL("../notify-api/lib/assistantHelp.js", import.meta.url), "utf8");
    assert.equal(bundled.slice(bundled.indexOf("\n") + 1), source);
  });
  await test("blank, oversized and non-text questions rejected; NFC normalized", async () => {
    for (const q of [" ", "x".repeat(501), {}, null]) assert.throws(() => validateQuestion(q));
    assert.equal(validateQuestion("  How to join?  "), "How to join?");
    assert.equal(validateQuestion("e\u0301"), "é");
  });
  await test("student authentication role and key configuration checked before AI", async () => {
    await errorCode(ask("teacher", { question: "hello" }), "student_only");
    await errorCode(ask("missing", { question: "hello" }), "student_only");
    const disabled = createAssistant({ firestore: db, now: () => time });
    assert.equal((await disabled("student", { action: "status" })).available, false);
    await errorCode(disabled("student", { question: "hello" }), "not_configured");
    assert.equal(calls, 0);
  });
  await test("success uses grounded help and bounded output; private records never sent", async () => {
    const result = await ask("student", { question: "How to join?" });
    assert.equal(result.remaining, 4); assert.equal(calls, 1);
    assert.equal(lastBody.model, "openai/gpt-oss-20b");
    assert.ok(lastBody.messages[0].content.includes("pag-apruba"));
    assert.equal(lastBody.messages.length, 2); assert.equal(lastBody.messages[1].content, "How to join?");
    assert.equal(lastBody.max_completion_tokens, 1024);
    assert.equal((await globalRef().get()).get("tokens"), 1200);
    assert.ok(!(await db.doc("assistantUsers/student").get()).get("question"));
  });
  await test("cooldown and cached duplicate avoid additional AI requests", async () => {
    await errorCode(ask("student", { question: "How to join?" }), "cooldown");
    advance();
    const result = await ask("student", { question: "HOW TO JOIN?" });
    assert.equal(result.cached, true); assert.equal(result.remaining, 4); assert.equal(calls, 1);
  });
  await test("multiple tabs share one pending reservation", async () => {
    mode = "wait";
    const pending = ask("other", { question: "Where is progress?" });
    while (!release) await new Promise(resolve => setTimeout(resolve, 20));
    await errorCode(ask("other", { question: "Join?" }), "pending");
    assert.equal(calls, 2); release(); await pending; mode = "ok";
  });
  await test("five-attempt cap persists across assistant instances", async () => {
    for (let i = 0; i < 4; i++) { advance(); await ask("student", { question: `Bigkas help ${i}?` }); }
    advance();
    const second = createAssistant({ firestore: db, apiKey: "test-key", now: () => time, fetchImpl: fakeFetch });
    const before = calls;
    await errorCode(second("student", { question: "sixth" }), "student_limit");
    assert.equal(calls, before);
    assert.equal((await second("student", { action: "status" })).remaining, 0);
  });
  await test("unknown provider failure retains token budget and releases pending lock", async () => {
    advance(); mode = "error";
    const before = (await globalRef().get()).get("tokens");
    await errorCode(ask("fail", { question: "help" }), "provider_unavailable");
    const user = (await db.doc("assistantUsers/fail").get()).data();
    assert.equal(user.pendingUntil, 0); assert.equal(user.count, 1);
    assert.ok((await globalRef().get()).get("tokens") > before);
    assert.ok(!user.cacheAnswer); mode = "ok";
  });
  await test("debug UID bypasses an exhausted daily cap; profile email cannot grant it", async () => {
    await db.doc("users/debug").set({ role: "student" });
    await db.doc("assistantUsers/debug").set({ day: new Date(time).toISOString().slice(0, 10), count: 99 });
    const debugAsk = createAssistant({ firestore: db, apiKey: "test-key", now: () => time, fetchImpl: fakeFetch, debugUid: "debug" });
    const status = await debugAsk("debug", { action: "status" });
    assert.equal(status.unlimited, true); assert.equal(status.remaining, null);
    advance(); const result = await debugAsk("debug", { question: "help debug" });
    assert.equal(result.unlimited, true); assert.equal(result.limit, null);
    await errorCode(debugAsk("debug", { question: "again" }), "cooldown");
    await db.doc("users/student").update({ email: "jayvanz1@gmail.com" });
    advance(); await errorCode(debugAsk("student", { question: "bypass?" }), "student_limit");
    assert.equal((await debugAsk("student", { action: "status" })).unlimited, false);
  });
  await test("timeout also releases the lock without refunding uncertain usage", async () => {
    advance(); mode = "timeout";
    await assert.rejects(ask("timeout", { question: "help" }), { name: "TimeoutError" });
    assert.equal((await db.doc("assistantUsers/timeout").get()).get("pendingUntil"), 0); mode = "ok";
  });
  await test("provider 429 pauses calls across students", async () => {
    advance(); mode = "rate";
    await errorCode(ask("rate", { question: "help" }), "provider_limit");
    const before = calls;
    await errorCode(ask("fresh", { question: "help" }), "provider_limit");
    assert.equal(calls, before); mode = "ok"; time += 121_000;
  });
  await test("daily app and token caps stop requests before upstream calls", async () => {
    await globalRef().set({ count: LIMITS.perDay }, { merge: true });
    const before = calls;
    await errorCode(ask("fresh", { question: "help" }), "app_limit");
    await globalRef().set({ count: 0, tokens: LIMITS.tokensPerDay }, { merge: true });
    await errorCode(ask("token", { question: "help" }), "app_limit");
    assert.equal(calls, before);
  });
  await test("global minute request and token caps protect concurrent students", async () => {
    await globalRef().set({ count: 0, tokens: 0, minute: Math.floor(time / 60_000), minuteTokens: LIMITS.tokensPerMinute, minuteCount: 0 }, { merge: true });
    const before = calls;
    await errorCode(ask("fresh", { question: "help" }), "busy");
    await globalRef().set({ minuteTokens: 0, minuteCount: LIMITS.perMinute }, { merge: true });
    await errorCode(ask("fresh", { question: "help" }), "busy");
    assert.equal(calls, before);
  });
  await test("new UTC day restores student allowance", async () => {
    time += 86_400_000;
    assert.equal((await ask("student", { action: "status" })).remaining, 5);
    assert.equal((await ask("student", { question: "Where is Chat?" })).remaining, 4);
  });
  await test("students cannot read or overwrite private usage and answer cache", async () => {
    for (const path of ["assistantUsers/student", `assistantUsage/${new Date(time).toISOString().slice(0, 10)}`]) {
      const headers = { Authorization: `Bearer ${emulator.token("student")}`, "Content-Type": "application/json" };
      assert.equal((await fetch(`${emulator.documents}/${path}`, { headers })).status, 403);
      assert.equal((await fetch(`${emulator.documents}/${path}`, { method: "PATCH", headers, body: JSON.stringify({ fields: { count: { integerValue: "0" } } }) })).status, 403);
    }
  });
  console.log(`Assistant backend: ${tests} scenarios passed.`);
} finally { await db.terminate(); await deleteApp(app); await emulator.stop(); }
