import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { startFirestoreTestServer } from "./firestore-test-server.mjs";
import { assessmentOperation } from "../notify-api/lib/assessments.js";
import { submitSpeech } from "../notify-api/lib/assessmentSpeech.js";

const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const app = initializeApp({ projectId: emulator.project });
const db = getFirestore(app);
let count = 0, event = 0;
const test = async (name, run) => { await run(); console.log(`PASS: ${name}`); count++; };
const seed = (path, data) => db.doc(path).set(data);
const read = async path => (await db.doc(path).get()).data();
const base = { classId: "a", progressSession: "session-a", lessonId: "lesson" };
const op = async (operation, fields = {}, uid = "student") => {
  const body = { ...base, operation, ...fields };
  if (body.part === "quiz" && !body.practice && ["answer", "finish"].includes(operation) && !("attemptId" in body))
    body.attemptId = (await read(`users/${uid}/assignedLessons/${body.lessonId}`))?.assessmentState?.quiz?.attemptId;
  return assessmentOperation(db, uid, body);
};
const answer = (part, fields) => op("answer", { part, eventId: `event-${++event}`, ...fields });
const rejects = (promise, code) => assert.rejects(promise, error => error.status === code);
function field(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, field(v)])) } };
}
async function client(path, data, uid = "student") {
  const query = data ? "?" + new URLSearchParams(Object.keys(data).map(k => ["updateMask.fieldPaths", k])) : "";
  const res = await fetch(`${emulator.documents}/${path}${query}`, {
    method: data ? "PATCH" : "GET", headers: { "Content-Type": "application/json", ...(uid ? { Authorization: `Bearer ${emulator.token(uid)}` } : {}) },
    ...(data ? { body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, field(v)])) }) } : {}),
  });
  return res.status;
}
try {
  await seed("users/student", { role: "student", classId: "a", progressSession: "session-a" });
  await seed("users/other", { role: "student", classId: "b" });
  await seed("users/teacher", { role: "teacher" });
  await seed("classes/a", { teacherId: "teacher" });
  await seed("classes/a/students/student", { fullName: "Synthetic student", joinedAt: Timestamp.fromMillis(1000) });
  await seed("classes/a/classLessons/lesson", { lessonId: "lesson" });
  await seed("lessons/lesson", { title: "Synthetic" });
  await seed("lessons/lesson/lectures/content", { pages: [{ sentences: ["One"] }, { sentences: ["Two"] }] });
  await seed("lessons/lesson/quiz/content", { title: "Quiz", questions: [
    { question: "One?", choices: ["a", "b"], answer: 1 },
    { question: "Two?", choices: ["a", "b", "c"], answers: [0, 2] },
  ] });
  await seed("lessons/lesson/activity/content", { pages: [{ words: ["a", "b"], correctIndices: [1], explanation: "Secret explanation" }, { words: ["x", "y"], correctIndices: [0] }] });
  await seed("lessons/lesson/pronunciation/content", { words: ["bahay", "puno"] });
  for (const level of [1, 2]) await seed(`lessons/lesson/game/level${level}`, { level, words: level === 1 ? ["BAHAY", "BATA"] : ["PUNO"] });
  await test("page saves and answers read only their own lesson section", async () => {
    for (const [part, fields] of [["lecture", { operation: "resume", done: 0 }],
      ["game", { operation: "answer", level: 1, word: "FAKE", eventId: "read-game" }],
      ["activity", { operation: "answer", index: 99, selected: [0], eventId: "read-activity" }]]) {
      const paths = [];
      const traced = {
        doc: path => db.doc(path), collection: path => db.collection(path),
        runTransaction: fn => db.runTransaction(tx => fn({
          get: ref => { paths.push(ref.path); return tx.get(ref); },
          set: (...args) => tx.set(...args), update: (...args) => tx.update(...args),
        })),
      };
      const result = assessmentOperation(traced, "student", { ...base, part, ...fields });
      if (part === "lecture") await result;
      else await assert.rejects(result, error => error.status === (part === "activity" ? 409 : 400));
      assert.deepEqual(paths.filter(path => path.startsWith("lessons/")), [`lessons/lesson/${part === "lecture" ? "lectures" : part}`]);
    }
  });
  await test("web/server scoring formulas stay identical", async () => assert.equal(await readFile(new URL("../js/scoring.js", import.meta.url), "utf8"), await readFile(new URL("../notify-api/lib/assessmentScoring.js", import.meta.url), "utf8")));
  await test("direct forged scores, resume, skills and completion are denied", async () => {
    for (const data of [{ quizScore: 999, quizFinished: true }, { resume: { quiz: { score: 999 } } }, { skills: { pagsusulit: { correct: 100 } } }, { lectureFinished: true }]) assert.equal(await client("users/student/assignedLessons/lesson", data), 403);
  });
  await test("forged profile summary denied on update and registration", async () => {
    assert.equal(await client("users/student", { skillSummary: { score: 100 } }), 403);
    assert.equal(await client("users/new", { role: "student", skillSummary: { score: 100 } }, "new"), 403);
    assert.equal(await client("users/student", { firstName: "Ana" }), 200);
  });
  await test("answer keys are staff-only, sanitized student content has no answers", async () => {
    for (const part of ["quiz", "activity"]) {
      assert.equal(await client(`lessons/lesson/${part}/content`), 403);
      assert.equal(await client(`lessons/lesson/${part}/content`, null, "teacher"), 200);
      assert.equal(await client(`lessons/lesson/${part}/content`, null, ""), 403);
    }
    const c = await op("content");
    assert.equal(c.quiz.questions[1].multiple, true);
    assert.equal(c.activity.pages[0].pickCount, 1);
    assert.ok(!JSON.stringify(c).includes("Secret explanation"));
    for (const key of ["answers", "answer", "correctIndices"]) assert.ok(!JSON.stringify(c).includes(`\"${key}\"`));
  });
  await test("API rejects client-supplied scores and skills", async () => {
    for (const fields of [{ quizScore: 100 }, { skills: {} }, { total: 1 }, { uid: "other" }]) await rejects(op("answer", { part: "quiz", ...fields }), 400);
  });
  await test("unassigned, wrong membership and stale sessions rejected", async () => {
    await rejects(op("content", { lessonId: "unassigned" }), 403);
    await rejects(op("content", {}, "other"), 403);
    await rejects(op("content", { progressSession: "stale" }), 409);
    await rejects(op("content", { lessonId: "../lesson" }), 400);
  });
  await test("legacy auto-ID assignments resolve, unassigned fallback is removed", async () => {
    await seed("classes/a/classLessons/auto-id", { lessonId: "legacy" });
    assert.equal((await op("metadata", { lessonId: "legacy" })).counts.quiz, 0);
  });
  await test("class metadata batches assigned lessons without answers and enforces membership", async () => {
    await seed("classes/a/classLessons/practice-link", { lessonId: "practice-only", mode: "practice" });
    await seed("lessons/unassigned/quiz/content", { questions: [{ answer: 0, choices: ["secret"] }] });
    const found = await op("metadata-list");
    assert.deepEqual(Object.keys(found.lessons).sort(), ["legacy", "lesson", "practice-only"]);
    assert.equal(found.lessons.lesson.counts.quiz, 2);
    assert.deepEqual(found.lessons.lesson, await op("metadata"));
    assert.ok(!JSON.stringify(found).includes("choices"));
    assert.ok(!JSON.stringify(found).includes("answer"));
    await rejects(op("metadata-list", {}, "other"), 403);
    await rejects(op("metadata-list", { progressSession: "stale" }), 409);
    await db.doc("classes/a/classLessons/practice-link").delete();
  });
  await test("server schedules gate content and answers; metadata remains available", async () => {
    await db.doc("classes/a/classLessons/lesson").update({ openAt: Timestamp.fromMillis(Date.now() + 60000) });
    await rejects(op("content"), 403);
    await rejects(answer("activity", { index: 0, selected: [1] }), 403);
    assert.equal((await op("metadata")).counts.quiz, 2);
    await seed("classes/a/classLessons/lesson", { lessonId: "lesson" });
  });
  await test("quiz prerequisites and lecture sequence enforced", async () => {
    await rejects(answer("quiz", { index: 0, selected: [1] }), 403);
    await rejects(op("finish", { part: "lecture" }), 409);
    await rejects(op("resume", { part: "lecture", done: 2 }), 400);
    await op("resume", { part: "lecture", done: 1 });
    await op("resume", { part: "lecture", done: 2 });
    await op("finish", { part: "lecture" });
    await op("begin", { part: "quiz" });
    assert.equal((await read("users/student/assignedLessons/lesson")).lectureFinished, true);
  });
  await test("answer types, bounds, duplicates and early finishing rejected", async () => {
    for (const selected of [[-1], [999], [1, 1], ["1"], []]) await rejects(answer("quiz", { index: 0, selected }), 400);
    await rejects(op("finish", { part: "quiz" }), 409);
  });
  await test("quiz score derived, wrong answer cannot be replaced", async () => {
    const result = await answer("quiz", { index: 0, selected: [0] }); assert.equal(result.score, 0);
    await rejects(answer("quiz", { index: 0, selected: [1] }), 409);
    assert.equal((await read("users/student/assignedLessons/lesson")).resume.quiz.done, 1);
  });
  await test("simultaneous conflicting answers accept only one", async () => {
    const results = await Promise.allSettled([answer("quiz", { index: 1, selected: [0, 2] }), answer("quiz", { index: 1, selected: [1] })]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
  });
  await test("finalization is idempotent, immutable and uses server totals", async () => {
    const result = await op("finish", { part: "quiz" });
    assert.equal(result.total, 2); assert.ok(result.score >= 0 && result.score <= 1);
    const before = await read("users/student/assignedLessons/lesson");
    assert.equal((await op("finish", { part: "quiz" })).score, result.score);
    await rejects(answer("quiz", { index: 0, selected: [1] }), 409);
    assert.equal(await client("users/student/assignedLessons/lesson", { quizScore: -1, quizFinished: false }), 403);
    assert.deepEqual(await read("users/student/assignedLessons/lesson"), before);
  });
  await test("activity lives and duplicate network retries are authoritative", async () => {
    const fields = { index: 0, selected: [0], eventId: "stable-retry" };
    const first = await answer("activity", fields); assert.equal(first.lives, 2); assert.equal(first.over, false); assert.deepEqual(first.correctIndices, []);
    const repeat = await answer("activity", fields); assert.deepEqual(repeat, first);
    await rejects(answer("activity", { ...fields, selected: [1] }), 409);
    assert.equal((await answer("activity", { index: 0, selected: [0] })).lives, 1);
    const last = await answer("activity", { index: 0, selected: [0] }); assert.equal(last.done, 1); assert.equal(last.score, 0); assert.deepEqual(last.correctIndices, [1]);
    await rejects(answer("activity", { index: 0, selected: [1] }), 409);
    await answer("activity", { index: 1, selected: [0] });
    assert.deepEqual(await answer("activity", fields), first, "An older retry must not consume a new attempt after another answer");
    const result = await op("finish", { part: "activity" }); assert.equal(result.score, 1); assert.equal(result.total, 2);
  });
  await test("crossword validates level/words and never increments twice", async () => {
    await rejects(answer("game", { level: 2, word: "PUNO" }), 409);
    await rejects(answer("game", { level: 1, word: "FAKE" }), 400);
    await answer("game", { level: 1, word: "BAHAY" });
    await rejects(op("finish", { part: "game", level: 1 }), 409);
    await answer("game", { level: 1, word: "BATA" });
    await op("finish", { part: "game", level: 1 });
    await op("finish", { part: "game", level: 1 });
    assert.equal((await read("users/student/assignedLessons/lesson")).skills.talasalitaan.items, 2);
    await answer("game", { level: 2, word: "PUNO" });
    assert.equal((await op("finish", { part: "game", level: 2 })).finished, true);
    assert.equal((await read("users/student/assignedLessons/lesson")).skills.talasalitaan.items, 3);
  });
  await test("pronunciation rejects claimed scores/transcripts; server audio verdict is used", async () => {
    await rejects(answer("pronunciation", { index: 0, selected: [0] }), 400);
    const wav = Buffer.alloc(64); wav.write("RIFF"); wav.write("WAVE", 8);
    const speech = (index, text, eventId = `speech-${++event}`) => submitSpeech(db, "student", { ...base, operation: "speech", part: "pronunciation", index, eventId, audio: wav.toString("base64") }, "Bearer synthetic", async () => text);
    const first = await speech(0, "bata"); assert.equal(first.right, false); assert.equal(first.lives, 2);
    const second = await speech(0, "bahay", "speech-stable"); assert.equal(second.done, 1); assert.equal(second.firstTryCorrect, 0);
    assert.deepEqual(await speech(0, "ignored-on-retry", "speech-stable"), second);
    await speech(1, "puno");
    const result = await op("finish", { part: "pronunciation" }); assert.equal(result.score, 2);
    assert.equal((await read("users/student/assignedLessons/lesson")).skills.pagbigkas.correct, 1);
  });
  await test("pronunciation begin restores trusted position and ignores stale public resume", async () => {
    const lessonId = "pronunciation-resume";
    await seed(`classes/a/classLessons/${lessonId}`, { lessonId });
    await seed(`lessons/${lessonId}/pronunciation/content`, { words: ["bahay", "puno"] });
    const progressPath = `users/student/assignedLessons/${lessonId}`;
    await seed(progressPath, { classId: "a", progressSession: base.progressSession,
      assessmentState: { pronunciation: { attemptId: "legacy", done: 1 } },
      resume: { pronunciation: { done: 1, total: 2, correct: 1, lives: 3 } } });
    await rejects(op("begin", { lessonId, part: "pronunciation", done: 2, correct: 99 }), 400);
    const begin = () => op("begin", { lessonId, part: "pronunciation" });
    assert.equal((await begin()).done, 0);
    const wav = Buffer.alloc(64); wav.write("RIFF"); wav.write("WAVE", 8);
    const speech = (index, text) => submitSpeech(db, "student", { ...base, lessonId, operation: "speech",
      part: "pronunciation", index, eventId: `resume-${++event}`, audio: wav.toString("base64") },
    "Bearer synthetic", async () => text);
    await speech(0, "bata");
    await db.doc(progressPath).update({ "resume.pronunciation.done": 1, "resume.pronunciation.lives": 3 });
    const resumed = await begin();
    assert.equal(resumed.done, 0);
    assert.equal(resumed.lives, 2);
    assert.equal(resumed.correct, 0);
    await rejects(speech(1, "puno"), 409);
    await speech(0, "bahay");
    assert.equal((await begin()).done, 1);
    assert.equal((await begin()).firstTryCorrect, 0);
    await speech(1, "puno");
    assert.equal((await begin()).done, 2);
    await op("finish", { lessonId, part: "pronunciation" });
    assert.equal((await begin()).finished, true);
  });
  await test("native speech forwarding preserves the token and supplies an allowed worker origin", async () => {
    const lessonId = "native-speech";
    await seed(`classes/a/classLessons/${lessonId}`, { lessonId });
    await seed(`lessons/${lessonId}/pronunciation/content`, { words: ["bahay"] });
    const wav = Buffer.alloc(64); wav.write("RIFF"); wav.write("WAVE", 8);
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      if (url !== "https://basaya-stt.jayvanzsingca5.workers.dev/transcribe") return originalFetch(url, options);
      calls++;
      assert.equal(options.headers.Authorization, "Bearer native-test-token");
      assert.equal(options.headers.Origin, process.env.STT_ALLOWED_ORIGIN || "https://basaya.onrender.com");
      assert.deepEqual(options.body, wav);
      return new Response(JSON.stringify({ text: "bahay" }), { status: 200 });
    };
    try {
      const result = await submitSpeech(db, "student", { ...base, lessonId, operation: "speech",
        part: "pronunciation", index: 0, eventId: "native-recording", audio: wav.toString("base64") }, "Bearer native-test-token");
      assert.equal(result.right, true);
      assert.equal(result.done, 1);
      assert.equal(calls, 1);
    } finally { globalThis.fetch = originalFetch; }
  });
  await test("crossword start uses validated state, preserves legacy results and supports gapped level IDs", async () => {
    const lessonId = "crossword-resume";
    await seed(`classes/a/classLessons/${lessonId}`, { lessonId });
    await seed(`lessons/${lessonId}/game/first`, { level: 1, words: ["AB"] });
    await seed(`lessons/${lessonId}/game/second`, { level: 3, words: ["BA"] });
    await seed(`users/student/assignedLessons/${lessonId}`, { classId: "a", progressSession: "session-a", gameScore: 1,
      skills: { talasalitaan: { correct: 1, attempts: 1, items: 1 } } });
    const before = await read(`users/student/assignedLessons/${lessonId}`);
    const current = await op("begin", { lessonId, part: "game" });
    assert.equal(current.level, 1); assert.equal(current.completedLevels, 0);
    const opened = await read(`users/student/assignedLessons/${lessonId}`);
    assert.equal(opened.gameScore, before.gameScore, "Opening must preserve old scores");
    assert.deepEqual(opened.skills, before.skills, "Opening must preserve old skill results");
    assert.equal(opened.assessmentState.game.attemptId, current.attemptId, "Durable saves bind to the server's attempt ID");
    await rejects(op("answer", { lessonId, part: "game", level: 2, word: "BA", eventId: "wrong-level" }), 409);
    await op("answer", { lessonId, part: "game", level: current.level, word: "AB", eventId: "correct-level" });
    assert.deepEqual((await op("begin", { lessonId, part: "game" })).resume.foundWords, ["AB"]);
    await op("finish", { lessonId, part: "game", level: 1 });
    const next = await op("begin", { lessonId, part: "game" });
    assert.equal(next.level, 3); assert.equal(next.completedLevels, 1);
    await op("answer", { lessonId, part: "game", level: next.level, word: "BA", eventId: "next-level" });
    const result = await op("finish", { lessonId, part: "game", level: 3 });
    assert.equal(result.score, 2); assert.equal(result.total, 2); assert.equal(result.finished, true);
    const completed = await read(`users/student/assignedLessons/${lessonId}`);
    assert.equal((await op("begin", { lessonId, part: "game" })).finished, true);
    assert.deepEqual(await read(`users/student/assignedLessons/${lessonId}`), completed);
  });
  await test("queued crossword words cannot repopulate a reset attempt", async () => {
    const lessonId = "queued-crossword";
    await seed(`classes/a/classLessons/${lessonId}`, { lessonId });
    await seed(`lessons/${lessonId}/game/first`, { level: 1, words: ["AB", "BA"] });
    const initial = await op("begin", { lessonId, part: "game" });
    const fields = { lessonId, part: "game", level: 1, word: "AB", eventId: "queued-word", attemptId: initial.attemptId };
    await op("answer", fields);
    await db.doc(`users/student/assignedLessons/${lessonId}`).delete();
    const reopened = await op("begin", { lessonId, part: "game" });
    assert.notEqual(reopened.attemptId, initial.attemptId);
    await rejects(op("answer", fields), 409);
    assert.deepEqual((await op("begin", { lessonId, part: "game" })).resume.foundWords, []);
    const accepted = await op("answer", { ...fields, attemptId: reopened.attemptId });
    assert.deepEqual(await op("answer", { ...fields, attemptId: reopened.attemptId }), accepted, "A lost response retries with one recorded word");
  });
  await test("last-word batches validate every word and finalize atomically with idempotent retries", async () => {
    const lessonId = "batch-crossword";
    await seed(`classes/a/classLessons/${lessonId}`, { lessonId });
    await seed(`lessons/${lessonId}/game/first`, { level: 1, words: ["AB", "BA"] });
    await seed(`lessons/${lessonId}/game/second`, { level: 3, words: ["CD"] });
    const { attemptId } = await op("begin", { lessonId, part: "game" });
    const fields = { lessonId, part: "game", level: 1, attemptId };
    for (const words of ["AB", ["AB", "WRONG"], ["AB", 1], ["AB", "BA", "AB"]])
      await rejects(op("finish", { ...fields, words }), 400);
    await rejects(op("finish", { ...fields, words: ["AB"] }), 409);
    assert.deepEqual((await op("begin", { lessonId, part: "game" })).resume.foundWords, [], "A failed batch must not partially accept words");
    await rejects(op("finish", { ...fields, level: 3, words: ["CD"] }), 409);
    const first = await op("finish", { ...fields, words: ["ab", "BA"] });
    assert.equal(first.score, 1); assert.equal(first.finished, false);
    assert.deepEqual(await op("finish", { ...fields, words: ["ab", "BA"] }), first);
    assert.equal((await read(`users/student/assignedLessons/${lessonId}`)).skills.talasalitaan.items, 2);
    const result = await op("finish", { ...fields, level: 3, words: ["CD"] });
    assert.equal(result.finished, true); assert.equal(result.score, 2);
    assert.deepEqual(await op("finish", { ...fields, level: 3, words: ["CD"] }), result);
    assert.equal((await read(`users/student/assignedLessons/${lessonId}`)).skills.talasalitaan.items, 3);
    await rejects(op("answer", { ...fields, words: ["AB"], eventId: "invalid-batch" }), 400);
  });
  await test("summary recalculated only from stored results", async () => {
    const result = await op("summary");
    const progress = await read("users/student/assignedLessons/lesson");
    assert.equal(result.summary.skills.pagkilala.score, 50);
    assert.equal(result.summary.skills.pagsusulit.score, progress.quizScore * 50);
    assert.equal(result.summary.validation, "server-v1");
    await rejects(op("summary", { skillSummary: { score: 100 } }), 400);
  });
  await test("lesson edits cannot change an in-progress attempt", async () => {
    await seed("classes/a/classLessons/changed", { lessonId: "changed" });
    await seed("lessons/changed/activity/content", { pages: [{ words: ["a", "b"], correctIndices: [0] }] });
    await op("answer", { lessonId: "changed", part: "activity", index: 0, selected: [1], eventId: "old-content" });
    await seed("lessons/changed/activity/content", { pages: [{ words: ["a", "b"], correctIndices: [1] }] });
    await rejects(op("answer", { lessonId: "changed", part: "activity", index: 0, selected: [1], eventId: "new-content" }), 409);
  });
  await test("fabricated legacy attempt state cannot become server evidence", async () => {
    await seed("classes/a/classLessons/forged", { lessonId: "forged" });
    await seed("lessons/forged/quiz/content", { questions: [{ question: "Q", choices: ["a", "b"], answer: 1 }] });
    await seed("users/student/assignedLessons/forged", { classId: "a", progressSession: "session-a", lectureFinished: true,
      assessmentState: { quiz: { attemptId: "invented", answers: { 0: { selected: [1], right: true } } } }, resume: { quiz: { done: 1, total: 1, score: 999 } } });
    await rejects(op("finish", { lessonId: "forged", part: "quiz" }), 409);
    assert.equal(await client("users/student/assessmentAttempts/invented", { parts: {} }), 403);
    assert.equal(await client("users/student/assessmentReceipts/invented", { reply: {} }), 403);
  });
  await test("removing and reassigning a lesson starts a new attempt with fresh receipts", async () => {
    await seed("classes/a/classLessons/reassigned", { lessonId: "reassigned" });
    await seed("lessons/reassigned/activity/content", { pages: [{ words: ["a"], correctIndices: [0] }] });
    const fields = { lessonId: "reassigned", part: "activity", index: 0, selected: [0], eventId: "reused-event" };
    await op("answer", fields);
    const firstId = (await read("users/student/assignedLessons/reassigned")).assessmentState.activity.attemptId;
    await op("finish", { lessonId: "reassigned", part: "activity" });
    await db.doc("users/student/assignedLessons/reassigned").delete();
    await op("answer", fields);
    const saved = await read("users/student/assignedLessons/reassigned");
    assert.notEqual(saved.assessmentState.activity.attemptId, firstId);
    assert.equal(saved.resume.activity.done, 1);
    assert.notEqual(saved.activityFinished, true);
  });
  await test("confirmed exit clears only the unfinished quiz and rejects delayed old answers", async () => {
    await seed("classes/a/classLessons/restart", { lessonId: "restart" });
    await seed("lessons/restart/quiz/content", { questions: [{ question: "Q", choices: ["a", "b"], answer: 1 }] });
    await seed("users/student/assignedLessons/restart", { classId: "a", progressSession: "session-a", lectureFinished: true, activityFinished: true, skills: { pagkilala: { correct: 1, attempts: 1, items: 1 } } });
    const first = await op("begin", { lessonId: "restart", part: "quiz" });
    await op("answer", { lessonId: "restart", part: "quiz", index: 0, selected: [0], eventId: "before-exit", attemptId: first.attemptId });
    assert.equal((await op("abandon", { lessonId: "restart", part: "quiz", attemptId: first.attemptId })).abandoned, true);
    assert.equal((await op("abandon", { lessonId: "restart", part: "quiz", attemptId: first.attemptId })).abandoned, true);
    const after = await read("users/student/assignedLessons/restart");
    assert.equal(after.resume.quiz, undefined); assert.equal(after.quizScore, undefined);
    assert.equal(after.lectureFinished, true); assert.equal(after.activityFinished, true); assert.equal(after.skills.pagkilala.correct, 1);
    await rejects(op("answer", { lessonId: "restart", part: "quiz", index: 0, selected: [0], eventId: "delayed", attemptId: first.attemptId }), 409);
    await rejects(op("finish", { lessonId: "restart", part: "quiz", attemptId: first.attemptId }), 409);
    const second = await op("begin", { lessonId: "restart", part: "quiz" });
    assert.notEqual(second.attemptId, first.attemptId); assert.equal(second.resume.done, 0);
    await op("answer", { lessonId: "restart", part: "quiz", index: 0, selected: [1], eventId: "new-answer", attemptId: second.attemptId });
    assert.equal((await op("finish", { lessonId: "restart", part: "quiz", attemptId: second.attemptId })).score, 1);
    const finalized = await read("users/student/assignedLessons/restart");
    assert.equal((await op("abandon", { lessonId: "restart", part: "quiz", attemptId: second.attemptId })).finished, true);
    assert.deepEqual(await read("users/student/assignedLessons/restart"), finalized);
    await rejects(op("begin", { lessonId: "restart", part: "quiz" }), 409);
  });
  await test("abandoning cannot erase deadline results or reset another part", async () => {
    await seed("classes/a/classLessons/exit-deadline", { lessonId: "exit-deadline" });
    await seed("lessons/exit-deadline/quiz/content", { questions: [{ question: "Q", choices: ["a", "b"], answer: 1 }] });
    await seed("users/student/assignedLessons/exit-deadline", { classId: "a", progressSession: "session-a", lectureFinished: true });
    const attempt = await op("begin", { lessonId: "exit-deadline", part: "quiz" });
    await op("answer", { lessonId: "exit-deadline", part: "quiz", index: 0, selected: [1], eventId: "deadline-answer", attemptId: attempt.attemptId });
    await db.doc("classes/a/classLessons/exit-deadline").update({ dueAt: Timestamp.fromMillis(Date.now() - 1000) });
    assert.equal((await op("abandon", { lessonId: "exit-deadline", part: "quiz", attemptId: attempt.attemptId })).closed, true);
    assert.equal((await read("users/student/assignedLessons/exit-deadline")).resume.quiz.score, 1);
    await rejects(op("abandon", { part: "activity", attemptId: attempt.attemptId }), 400);
  });
  await test("practice answers never create assessment progress or summaries", async () => {
    await seed("classes/a/classLessons/practice-entry", { lessonId: "practice", mode: "practice" });
    await seed("lessons/practice/quiz/content", { questions: [{ question: "Practice", choices: ["a", "b"], answer: 0 }] });
    const before = (await read("users/student")).skillSummary;
    const result = await op("answer", { practice: true, entryId: "practice-entry", lessonId: "practice", part: "quiz", index: 0, selected: [0] });
    assert.equal(result.right, true); assert.equal(await read("users/student/assignedLessons/practice"), undefined);
    assert.deepEqual((await read("users/student")).skillSummary, before);
    await rejects(op("content", { lessonId: "practice" }), 403);
  });
  await test("deadline summaries include unfinished/unanswered items as wrong", async () => {
    const previousLessons = (await op("summary")).summary.skills.pagsusulit.lessons;
    await seed("classes/a/classLessons/missed", { lessonId: "missed", dueAt: Timestamp.fromMillis(Date.now() - 1000) });
    await seed("lessons/missed/quiz/content", { questions: [{ question: "Missed", choices: ["a"], answer: 0 }] });
    await rejects(op("answer", { lessonId: "missed", part: "quiz", index: 0, selected: [0], eventId: "late" }), 403);
    const summary = (await op("summary")).summary;
    assert.equal(summary.skills.pagsusulit.lessons, previousLessons + 1);
    assert.ok(summary.skills.pagsusulit.lessonScores.includes(0));
  });
  await test("removed roster and closed class stop all assessment requests", async () => {
    await db.doc("classes/a").update({ membershipClosed: true }); await rejects(op("summary"), 403);
    await db.doc("classes/a").update({ membershipClosed: false }); await db.doc("classes/a/students/student").delete();
    await rejects(op("content"), 403);
  });
  console.log(`Assessment integrity: ${count} scenarios passed.`);
} finally { await db.terminate(); await deleteApp(app); await emulator.stop(); }
