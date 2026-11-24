import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startFirestoreTestServer } from "./firestore-test-server.mjs";
import { requestClassJoin, reviewClassJoins } from "../notify-api/lib/classMembership.js";
import { archiveClassMember } from "../notify-api/lib/classProgress.js";

// Real local Firestore transactions/rules, synthetic accounts, no production data.
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const app = initializeApp({ projectId: emulator.project });
const db = getFirestore(app);
const read = async path => (await db.doc(path).get()).data();
let checks = 0;
async function test(label, run) { await run(); checks++; console.log(`PASS: ${label}`); }
async function seed(path, data) { await db.doc(path).set(data); }
async function pending(uid, code = "AAA123") {
  await requestClassJoin(db, uid, code);
  return read(`classes/${code === "AAA123" ? "a" : "b"}/joinRequests/${uid}`);
}
async function approve(uid, code = "AAA123", progressMode) {
  const request = await pending(uid, code);
  return reviewClassJoins(db, code === "AAA123" ? "ta" : "tb", code === "AAA123" ? "a" : "b", [{ studentId: uid, requestId: request.requestId, ...(progressMode ? { progressMode } : {}) }], "approve");
}
function value(item) {
  if (typeof item === "string") return { stringValue: item };
  if (typeof item === "boolean") return { booleanValue: item };
  if (typeof item === "number") return { integerValue: String(item) };
  return { mapValue: { fields: Object.fromEntries(Object.entries(item).map(([key, child]) => [key, value(child)])) } };
}
async function client(path, uid, data) {
  const mask = data ? "?" + new URLSearchParams(Object.keys(data).map(key => ["updateMask.fieldPaths", key])) : "";
  const response = await fetch(`${emulator.documents}/${path}${mask}`, {
    method: data ? "PATCH" : "GET", headers: { "Content-Type": "application/json", Authorization: `Bearer ${emulator.token(uid)}` },
    ...(data ? { body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, item]) => [key, value(item)])) }) } : {}), signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.text() };
}
async function status(path, uid, code, data) { const response = await client(path, uid, data); assert.equal(response.status, code, response.body); }
try {
  for (const uid of ["ta", "tb"]) await seed(`users/${uid}`, { role: "teacher" });
  for (const uid of ["s", "new", "empty", "legacy"]) await seed(`users/${uid}`, { role: "student", classId: "", firstName: uid });
  await seed("classes/a", { teacherId: "ta", classCode: "AAA123", className: "Class A" });
  await seed("classes/b", { teacherId: "tb", classCode: "BBB123", className: "Class B" });
  for (const id of ["a", "b"]) await seed(`classes/${id}/classLessons/shared`, { lessonId: "shared" });
  let sessionA, archiveA, originalJoinedAt;
  await test("new student request has no restoration eligibility", async () => {
    const request = await pending("s"); assert.equal(request.hasPreviousProgress, false);
  });
  await test("restore cannot be forced for a new student", async () => {
    const request = await read("classes/a/joinRequests/s");
    await assert.rejects(reviewClassJoins(db, "ta", "a", [{ studentId: "s", requestId: request.requestId, progressMode: "restore" }], "approve"), error => error.status === 409);
    assert.equal(await read("classes/a/students/s"), undefined);
  });
  await test("first approval starts an empty server-owned progress record", async () => {
    await approve("s"); sessionA = (await read("users/s")).progressSession; assert.ok(sessionA);
    assert.equal((await db.collection("users/s/assignedLessons").get()).size, 0);
    originalJoinedAt = Timestamp.fromMillis(1700000000000);
    await db.doc("classes/a/students/s").update({ joinedAt: originalJoinedAt });
  });
  await test("client result writes are denied; server results remain archivable", async () => {
    await status("users/s/assignedLessons/shared", "s", 403, { classId: "a", progressSession: sessionA, quizFinished: true, quizScore: 4 });
    await seed("users/s/assignedLessons/shared", { classId: "a", progressSession: sessionA, quizFinished: true, quizScore: 4, quizTotal: 5,
      resume: { lecture: { done: 2, total: 4 } }, skills: { pagsusulit: { correct: 4, attempts: 5, items: 5 } } });
    await seed("users/s/assignedLessons/other", { classId: "a", progressSession: sessionA, pronunciationFinished: true });
    await db.doc("users/s").update({ skillSummary: { lessonsAssigned: 2 } });
  });
  await test("wrong teacher cannot archive or remove a student", async () => {
    await assert.rejects(archiveClassMember(db, "tb", "a", "s"), error => error.status === 403);
    assert.equal((await read("users/s/assignedLessons/shared")).quizScore, 4);
  });
  await test("leave archives all accepted results and removes active membership atomically", async () => {
    const result = await archiveClassMember(db, "ta", "a", "s"); assert.equal(result.lessonsArchived, 2);
    const history = await read("users/s/classProgress/a"); archiveA = history.latestArchiveId;
    const archived = await read(`users/s/classProgress/a/archives/${archiveA}/lessons/shared`);
    assert.equal(archived.quizFinished, true); assert.equal(archived.quizScore, 4); assert.equal(archived.resume.lecture.done, 2);
    assert.equal((await read(`users/s/classProgress/a/archives/${archiveA}`)).skillSummary.lessonsAssigned, 2);
    assert.equal((await db.collection("users/s/assignedLessons").get()).size, 0);
    assert.equal(await read("classes/a/students/s"), undefined); assert.equal((await read("users/s")).classId, undefined);
  });
  await test("second removal cannot create a duplicate archive", async () => {
    await assert.rejects(archiveClassMember(db, "ta", "a", "s"), error => error.status === 404);
    assert.equal((await db.collection("users/s/classProgress/a/archives").get()).size, 1);
  });
  await test("departed student cannot submit active progress", () => status("users/s/assignedLessons/shared", "s", 403, { classId: "a", progressSession: sessionA, quizScore: 0 }));
  await test("archive readable only by student and the owning class teacher", async () => {
    const path = `users/s/classProgress/a/archives/${archiveA}/lessons/shared`;
    await status(path, "s", 200); await status(path, "ta", 200); await status(path, "tb", 403); await status(path, "new", 403);
    await status(path, "s", 403, { quizScore: 100 }); await status(path, "ta", 403, { quizScore: 100 });
  });
  await test("different class starts separately even when the lesson ID is shared", async () => {
    const request = await pending("s", "BBB123"); assert.equal(request.hasPreviousProgress, false);
    await approve("s", "BBB123"); const user = await read("users/s"); assert.notEqual(user.progressSession, sessionA);
    assert.equal((await db.collection("users/s/assignedLessons").get()).size, 0);
    await status("users/s/assignedLessons/shared", "s", 403, { classId: "a", progressSession: sessionA, quizScore: 0 });
    await status("users/s/assignedLessons/shared", "s", 403, { classId: "b", progressSession: user.progressSession, quizScore: 2 });
    await seed("users/s/assignedLessons/shared", { classId: "b", progressSession: user.progressSession, quizScore: 2 });
    await archiveClassMember(db, "tb", "b", "s");
  });
  await test("returning request exposes restore only for saved work in that class", async () => {
    const request = await pending("s"); assert.equal(request.hasPreviousProgress, true);
    assert.equal((await read("users/s")).classId, undefined); assert.equal(await read("users/s/assignedLessons/shared"), undefined);
  });
  await test("approval defaults to restoring results, resume, completion and original join date", async () => {
    await approve("s"); const user = await read("users/s"); assert.equal(user.progressSession, sessionA); assert.equal(user.skillSummary.lessonsAssigned, 2);
    const progress = await read("users/s/assignedLessons/shared"); assert.equal(progress.quizFinished, true); assert.equal(progress.quizScore, 4); assert.equal(progress.resume.lecture.done, 2);
    const roster = await read("classes/a/students/s"); assert.equal(roster.progressMode, "restore"); assert.equal(roster.joinedAt.toMillis(), originalJoinedAt.toMillis());
  });
  await test("another departure creates a new immutable snapshot", async () => {
    await db.doc("users/s/assignedLessons/shared").update({ quizScore: 5 });
    await archiveClassMember(db, "ta", "a", "s");
    assert.equal((await db.collection("users/s/classProgress/a/archives").get()).size, 2);
    assert.equal((await read(`users/s/classProgress/a/archives/${archiveA}/lessons/shared`)).quizScore, 4);
  });
  let freshSession;
  await test("explicit start fresh keeps history and creates a new empty record", async () => {
    await approve("s", "AAA123", "fresh"); freshSession = (await read("users/s")).progressSession;
    assert.notEqual(freshSession, sessionA); assert.equal((await read("users/s")).skillSummary, undefined);
    assert.equal((await db.collection("users/s/assignedLessons").get()).size, 0);
    assert.equal((await db.collection("users/s/classProgress/a/archives").get()).size, 2);
    assert.equal((await read("classes/a/students/s")).progressMode, "fresh");
  });
  await test("delayed saves cannot overwrite a fresh record, even after it has new progress", async () => {
    await status("users/s/assignedLessons/shared", "s", 403, { classId: "a", progressSession: sessionA, quizFinished: true });
    await status("users/s/assignedLessons/shared", "s", 403, { classId: "a", progressSession: freshSession, quizFinished: false });
    await seed("users/s/assignedLessons/shared", { classId: "a", progressSession: freshSession, quizFinished: false });
    await status("users/s/assignedLessons/shared", "s", 403, { classId: "a", progressSession: sessionA, quizFinished: true });
    assert.equal((await read("users/s/assignedLessons/shared")).quizFinished, false);
  });
  await test("student cannot replace the server-owned progress session", () => status("users/s", "s", 403, { progressSession: sessionA }));
  await test("returning student with no saved work gets normal approval only", async () => {
    await approve("empty"); await archiveClassMember(db, "ta", "a", "empty");
    assert.equal((await pending("empty")).hasPreviousProgress, false);
  });
  await test("legacy active members archive and restore without a manual migration", async () => {
    await db.doc("users/legacy").update({ classId: "a" }); await seed("classes/a/students/legacy", { fullName: "Legacy", joinedAt: originalJoinedAt });
    await seed("users/legacy/assignedLessons/shared", { quizFinished: true });
    await archiveClassMember(db, "ta", "a", "legacy"); await approve("legacy");
    assert.ok((await read("users/legacy")).progressSession); assert.equal((await read("users/legacy/assignedLessons/shared")).quizFinished, true);
  });
  await test("concurrent restore approvals create only one membership and result set", async () => {
    await archiveClassMember(db, "ta", "a", "legacy"); const request = await pending("legacy");
    const decide = () => reviewClassJoins(db, "ta", "a", [{ studentId: "legacy", requestId: request.requestId }], "approve");
    const results = await Promise.all([decide(), decide()]);
    assert.deepEqual(results.map(result => result.results[0].status).sort(), ["already-reviewed", "approved"]);
    assert.equal((await read("users/legacy/assignedLessons/shared")).quizFinished, true);
  });
  await test("failure while archiving leaves membership and accepted progress untouched", async () => {
    const failing = {
      doc: path => db.doc(path),
      runTransaction: callback => db.runTransaction(tx => {
        const intercepted = new Proxy(tx, { get(target, key) {
          if (key === "create") return (ref, data) => { if (ref.path.includes("/lessons/")) throw new Error("Injected archive failure"); return target.create(ref, data); };
          return typeof target[key] === "function" ? target[key].bind(target) : target[key];
        } });
        return callback(intercepted);
      }),
    };
    const before = (await db.collection("users/legacy/classProgress/a/archives").get()).size;
    await assert.rejects(archiveClassMember(failing, "ta", "a", "legacy"), /Injected archive failure/);
    assert.equal((await read("users/legacy")).classId, "a");
    assert.ok(await read("classes/a/students/legacy"));
    assert.equal((await read("users/legacy/assignedLessons/shared")).quizFinished, true);
    assert.equal((await db.collection("users/legacy/classProgress/a/archives").get()).size, before);
  });
  await test("a missing archive aborts restoration without granting membership", async () => {
    await seed("users/new/classProgress/a", { latestArchiveId: "missing", progressCount: 1 });
    const request = await pending("new");
    await assert.rejects(reviewClassJoins(db, "ta", "a", [{ studentId: "new", requestId: request.requestId }], "approve"), error => error.status === 409);
    assert.equal((await read("users/new")).classId, ""); assert.equal(await read("classes/a/students/new"), undefined);
    assert.equal((await read("classes/a/joinRequests/new")).status, "pending");
  });
  await test("an incomplete snapshot cannot silently restore an empty record", async () => {
    await seed("users/new/classProgress/a/archives/missing", { progressSession: "existing", progressCount: 1 });
    const request = await read("classes/a/joinRequests/new");
    await assert.rejects(reviewClassJoins(db, "ta", "a", [{ studentId: "new", requestId: request.requestId }], "approve"), error => error.status === 409);
    assert.equal(await read("classes/a/students/new"), undefined);
  });
  console.log(`Class progress: ${checks} archive, restore, isolation and security scenarios passed.`);
} finally { await db.terminate(); await deleteApp(app); await emulator.stop(); }
