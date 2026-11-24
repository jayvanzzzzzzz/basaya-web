import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { startFirestoreTestServer } from "./firestore-test-server.mjs";
import { requestClassJoin, reviewClassJoins } from "../notify-api/lib/classMembership.js";

const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const app = initializeApp({ projectId: emulator.project });
const db = getFirestore(app);
let checks = 0;
async function test(label, run) { await run(); checks++; console.log(`PASS: ${label}`); }
async function denied(operation, status) { await assert.rejects(operation, (error) => error.status === status); }
const seed = async (path, fields) => db.doc(path).set(fields);
const read = async (path) => (await db.doc(path).get()).data();
const value = (item) => item === null ? { nullValue: null } : typeof item === "string" ? { stringValue: item } : typeof item === "boolean" ? { booleanValue: item } : { mapValue: { fields: Object.fromEntries(Object.entries(item).map(([key, child]) => [key, value(child)])) } };
async function client(path, uid, data) {
  const mask = data ? "?" + new URLSearchParams(Object.keys(data).map((key) => ["updateMask.fieldPaths", key])) : "";
  return fetch(`${emulator.documents}/${path}${mask}`, { method: data ? "PATCH" : "GET", headers: { "Content-Type": "application/json", ...(uid ? { Authorization: `Bearer ${emulator.token(uid)}` } : {}) }, ...(data ? { body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, item]) => [key, value(item)])) }) } : {}), signal: AbortSignal.timeout(10000) });
}
async function status(path, uid, expected, data) { const result = await client(path, uid, data); assert.equal(result.status, expected, await result.text()); }
async function pending(uid, code = "ABC123") { await requestClassJoin(db, uid, code); return read(`classes/${code === "ABC123" ? "a" : "b"}/joinRequests/${uid}`); }
try {
  await seed("users/teacher-a", { role: "teacher" });
  await seed("users/teacher-b", { role: "teacher" });
  await seed("users/admin", { role: "admin" });
  for (const uid of ["new", "second", "decline", "race", "rate", "legacy", "forged", "bulk-a", "bulk-b", "concurrent"]) await seed(`users/${uid}`, { role: "student", firstName: "Juan", lastName: uid, classId: "", className: "" });
  await seed("classes/a", { teacherId: "teacher-a", className: "Grade 4 — Rizal", classCode: "ABC123" });
  await seed("classes/b", { teacherId: "teacher-b", className: "Grade 5 — Mabini", classCode: "XYZ789" });
  await seed("lessons/lesson", { title: "Pangngalan" });
  await seed("lessons/lesson/quiz/main", { answer: "a" });
  await seed("classes/a/classLessons/lesson", { lessonId: "lesson" });
  await seed("classes/a/chat/state", { open: false });
  await test("code creates pending request without profile membership, roster or join notice", async () => {
    const result = await requestClassJoin(db, "new", " abc123 ");
    assert.equal(result.status, "pending"); assert.equal((await read("users/new")).classId, "");
    assert.equal(await read("classes/a/students/new"), undefined);
    assert.equal((await db.collection("classes/a/messages").get()).size, 0);
  });
  await test("repeated request is idempotent", async () => { const before = await read("classes/a/joinRequests/new"); await requestClassJoin(db, "new", "ABC123"); assert.equal((await read("classes/a/joinRequests/new")).requestId, before.requestId); });
  await test("one pending request prevents another class request", () => denied(requestClassJoin(db, "new", "XYZ789"), 409));
  await test("incorrect code does not create a request", () => denied(requestClassJoin(db, "second", "BAD123"), 404));
  await test("non-students cannot request membership", () => denied(requestClassJoin(db, "admin", "ABC123"), 403));
  await test("malformed code rejected", () => denied(requestClassJoin(db, "second", { code: "ABC123" }), 400));
  await test("pending student cannot read class or invitation code", () => status("classes/a", "new", 403));
  await test("pending student cannot read lessons or quiz answers", async () => { await status("lessons/lesson", "new", 403); await status("lessons/lesson/quiz/main", "new", 403); });
  await test("pending student cannot read roster or chat", async () => { await status("classes/a/students/legacy", "new", 403); await status("classes/a/chat/state", "new", 403); });
  await test("direct roster enrollment is blocked", () => status("classes/a/students/new", "new", 403, { fullName: "Injected" }));
  await test("profile classId cannot be forged", () => status("users/new", "new", 403, { classId: "a", className: "Injected" }));
  await test("profile joinRequest cannot be changed by student", () => status("users/new", "new", 403, { joinRequest: { status: "approved", classId: "a" } }));
  await test("pending student cannot submit progress", () => status("users/new/assignedLessons/lesson", "new", 403, { quizFinished: true }));
  await test("request documents cannot be written by students or teachers", async () => { await status("classes/a/joinRequests/new", "new", 403, { status: "approved" }); await status("classes/a/joinRequests/new", "teacher-a", 403, { status: "approved" }); });
  await test("request readable by its student and class teacher, but not outsiders", async () => { await status("classes/a/joinRequests/new", "new", 200); await status("classes/a/joinRequests/new", "teacher-a", 200); await status("classes/a/joinRequests/new", "second", 403); await status("classes/a/joinRequests/new", "teacher-b", 403); });
  const request = await read("classes/a/joinRequests/new");
  const item = { studentId: "new", requestId: request.requestId };
  await test("wrong teacher cannot approve", () => denied(reviewClassJoins(db, "teacher-b", "a", [item], "approve"), 403));
  await test("admin cannot impersonate the reviewing teacher", () => denied(reviewClassJoins(db, "admin", "a", [item], "approve"), 403));
  await test("approval atomically enrolls and adds one notice, preserving closed chat", async () => {
    assert.equal((await reviewClassJoins(db, "teacher-a", "a", [item], "approve")).results[0].status, "approved");
    const user = await read("users/new"); assert.equal(user.classId, "a"); assert.equal(user.joinRequest, undefined);
    const roster = await read("classes/a/students/new"); assert.equal(roster.fullName, "new, Juan"); assert.ok(roster.joinedAt.toMillis());
    assert.equal((await db.collection("classes/a/messages").get()).size, 1);
    assert.equal((await read("classes/a/chat/state")).open, false);
  });
  await test("approval retries cannot duplicate roster or notice", async () => { assert.equal((await reviewClassJoins(db, "teacher-a", "a", [item], "approve")).results[0].status, "already-reviewed"); assert.equal((await db.collection("classes/a/messages").get()).size, 1); });
  await test("approved student can read own class, lessons and chat; answer keys stay protected", async () => { for (const path of ["classes/a", "lessons/lesson", "classes/a/chat/state"]) await status(path, "new", 200); await status("lessons/lesson/quiz/main", "new", 403); });
  await test("approved student cannot read another class", () => status("classes/b", "new", 403));
  await test("approved student cannot request second membership", () => denied(requestClassJoin(db, "new", "XYZ789"), 409));
  await test("declining grants no membership and allows a fresh request", async () => {
    const first = await pending("decline"); await reviewClassJoins(db, "teacher-a", "a", [{ studentId: "decline", requestId: first.requestId }], "decline");
    assert.equal((await read("users/decline")).joinRequest.status, "declined"); assert.equal(await read("classes/a/students/decline"), undefined);
    const second = await pending("decline"); assert.notEqual(first.requestId, second.requestId);
    assert.equal((await reviewClassJoins(db, "teacher-a", "a", [{ studentId: "decline", requestId: first.requestId }], "approve")).results[0].status, "already-reviewed");
    assert.equal(await read("classes/a/students/decline"), undefined);
  });
  await test("simultaneous requests from two devices select only one class", async () => { const attempts = await Promise.allSettled([requestClassJoin(db, "race", "ABC123"), requestClassJoin(db, "race", "XYZ789")]); assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1); assert.equal(attempts.find((item) => item.status === "rejected").reason.status, 409); });
  await test("bulk approval supports multiple selected requests", async () => { const requests = []; for (const uid of ["bulk-a", "bulk-b"]) requests.push({ studentId: uid, requestId: (await pending(uid)).requestId }); const results = (await reviewClassJoins(db, "teacher-a", "a", requests, "approve")).results; assert.equal(results.filter((item) => item.status === "approved").length, 2); });
  await test("concurrent approval creates a single enrollment notice", async () => { const request = { studentId: "concurrent", requestId: (await pending("concurrent")).requestId }; const results = await Promise.all([reviewClassJoins(db, "teacher-a", "a", [request], "approve"), reviewClassJoins(db, "teacher-a", "a", [request], "approve")]); assert.equal(results.flatMap((item) => item.results).filter((item) => item.status === "approved").length, 1); });
  await test("existing approved members retain access", async () => { await seed("users/legacy", { role: "student", classId: "a" }); await seed("classes/a/students/legacy", { fullName: "Existing", joinedAt: new Date() }); await status("classes/a/chat/state", "legacy", 200); await status("lessons/lesson", "legacy", 200); });
  await test("a stray roster does not grant chat or lesson access", async () => { await seed("classes/a/students/forged", { fullName: "Stray" }); await status("classes/a/chat/state", "forged", 403); await status("lessons/lesson", "forged", 403); });
  await test("students cannot change approval date", () => status("classes/a/students/new", "new", 403, { joinedAt: "forged" }));
  await test("normal profile and roster name edits still work", async () => { await status("users/new", "new", 200, { firstName: "Updated" }); await status("classes/a/students/new", "new", 200, { fullName: "Updated" }); });
  await test("teacher cannot reassign their class directly", () => status("classes/a", "teacher-a", 403, { teacherId: "teacher-b" }));
  await test("teacher cannot bypass the server's enrollment freeze", () => status("classes/a", "teacher-a", 403, { membershipClosed: false }));
  await test("changed membership skips approval and retires the stale request", async () => {
    const old = await pending("second");
    await db.doc("users/second").update({ classId: "b" });
    assert.equal((await reviewClassJoins(db, "teacher-a", "a", [{ studentId: "second", requestId: old.requestId }], "approve")).results[0].status, "changed");
    assert.equal((await read("users/second")).classId, "b");
    assert.equal((await read("classes/a/joinRequests/second")).status, "superseded");
    assert.equal(await read("classes/a/students/second"), undefined);
    await db.doc("users/second").update({ classId: "" });
  });
  await test("students cannot set membership while creating their profile", () => status("users/injected", "injected", 403, { role: "student", classId: "a" }));
  await test("regular student registration still works", () => status("users/registered", "registered", 200, { role: "student", firstName: "Ana" }));
  await test("teacher class-list query still works", async () => {
    const response = await fetch(`${emulator.documents}:runQuery`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${emulator.token("teacher-a")}` }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "classes" }], where: { fieldFilter: { field: { fieldPath: "teacherId" }, op: "EQUAL", value: { stringValue: "teacher-a" } } } } }) }); assert.equal(response.status, 200, await response.text());
  });
  await test("students cannot search all class codes", async () => { const response = await fetch(`${emulator.documents}:runQuery`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${emulator.token("second")}` }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "classes" }] } }) }); assert.equal(response.status, 403, await response.text()); });
  await test("code guesses are limited per student", async () => { await seed("joinRequestLimits/rate", { attempts: Array(20).fill(Date.now()) }); await denied(requestClassJoin(db, "rate", "ABC123"), 429); });
  await test("deleting class blocks new requests and approvals", async () => { const pendingRequest = await read("classes/a/joinRequests/decline"); await db.doc("classes/a").update({ membershipClosed: true }); await denied(requestClassJoin(db, "second", "ABC123"), 404); await denied(reviewClassJoins(db, "teacher-a", "a", [{ studentId: "decline", requestId: pendingRequest.requestId }], "approve"), 403); });
  await test("class deletion cleans pending requests without stranding students", async () => {
    await seed("classes/delete", { teacherId: "teacher-a", classCode: "DEL123", className: "Deleted class" });
    await seed("users/delete-pending", { role: "student", firstName: "Pending" });
    await seed("users/delete-enrolled", { role: "student", classId: "delete", className: "Deleted class" });
    await seed("classes/delete/students/delete-enrolled", { fullName: "Existing" });
    await seed("classes/delete/classLessons/lesson", { lessonId: "lesson" });
    await seed("users/delete-enrolled/assignedLessons/lesson", { quizFinished: true });
    await requestClassJoin(db, "delete-pending", "DEL123");
    const context = vm.createContext({ console });
    const module = (exports) => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
    const sdk = module({ FieldValue: require("firebase-admin/firestore").FieldValue });
    // Normalize VM callback promises to the SDK's realm (it uses instanceof Promise).
    const handlerDb = { doc: (...args) => db.doc(...args), collection: (...args) => db.collection(...args), batch: () => db.batch(), runTransaction: (callback) => db.runTransaction((tx) => Promise.resolve(callback(tx))) };
    const firebase = module({ db: () => handlerDb });
    const http = module({ ID_PATTERN: /^[A-Za-z0-9_-]{1,128}$/, allowCors: () => {}, requireUser: async () => "admin", requireAdmin: async () => (await db.doc("users/admin").get()).get("role") === "admin" });
    const handler = new vm.SourceTextModule(await readFile(new URL("../notify-api/api/delete-class.js", import.meta.url), "utf8"), { context });
    await handler.link((name) => name.includes("firebase-admin") ? sdk : name.endsWith("/firebase.js") ? firebase : http); await handler.evaluate();
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler.namespace.default({ method: "POST", body: { classId: "delete" } }, response);
    assert.equal(response.code, 200);
    assert.equal(await read("classes/delete"), undefined);
    assert.equal(await read("classes/delete/joinRequests/delete-pending"), undefined);
    assert.equal((await read("users/delete-pending")).joinRequest.status, "declined");
    assert.equal((await read("users/delete-pending")).joinRequest.reason, "class-deleted");
    assert.equal((await read("users/delete-enrolled")).classId, undefined);
    assert.equal(await read("users/delete-enrolled/assignedLessons/lesson"), undefined);
  });
  await test("chat topic push contains no private message text", async () => {
    await seed("classes/notify", { teacherId: "teacher-a", className: "Private class" });
    await seed("classes/notify/messages/message", { senderId: "teacher-a", role: "teacher", text: "Private learner details must stay in Firestore", senderName: "Private name", sentAt: new Date() });
    const context = vm.createContext({ console, Date });
    const module = (exports) => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
    let push;
    const firebase = module({ db: () => db, messaging: () => ({ send: async (payload) => { push = payload; } }) });
    const http = module({ ID_PATTERN: /^[A-Za-z0-9_-]{1,128}$/, allowCors: () => {}, requireUser: async () => "teacher-a" });
    const handler = new vm.SourceTextModule(await readFile(new URL("../notify-api/api/notify-chat.js", import.meta.url), "utf8"), { context });
    await handler.link((name) => name.endsWith("/firebase.js") ? firebase : http); await handler.evaluate();
    const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler.namespace.default({ method: "POST", body: { classId: "notify", messageId: "message" } }, response);
    assert.equal(response.code, 200);
    assert.doesNotMatch(JSON.stringify(push), /Private learner|Private name|Private class/);
    assert.equal(push.data.messageId, "message");
  });
  console.log(`Membership approval: ${checks} integration and security scenarios passed.`);
} finally { await db.terminate(); await deleteApp(app); await emulator.stop(); }
