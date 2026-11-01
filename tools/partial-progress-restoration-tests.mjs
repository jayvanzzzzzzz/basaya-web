import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startFirestoreTestServer } from "./firestore-test-server.mjs";
import { archiveClassMember } from "../notify-api/lib/classProgress.js";
import { requestClassJoin, reviewClassJoins } from "../notify-api/lib/classMembership.js";
import { assessmentOperation } from "../notify-api/lib/assessments.js";
import { submitSpeech } from "../notify-api/lib/assessmentSpeech.js";

// Real local Firestore and server transitions. Speech recognition is a local stub;
// no production users, recordings, provider calls, or deployed data are touched.
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const app = initializeApp({ projectId: emulator.project });
const db = getFirestore(app);
const read = async path => (await db.doc(path).get()).data();
const words = ["bahay", "puno", "bata", "aso", "pusa"];
const wav = Buffer.alloc(44); wav.write("RIFF", 0); wav.write("WAVE", 8);
const audio = wav.toString("base64");
let checks = 0, event = 0;
async function test(label, run) { await run(); checks++; console.log(`PASS: ${label}`); }
async function enroll(uid) {
  await requestClassJoin(db, uid, "ABC123");
  const pending = await read(`classes/a/joinRequests/${uid}`);
  await reviewClassJoins(db, "teacher", "a", [{ studentId: uid, requestId: pending.requestId }], "approve");
}
async function op(uid, operation, fields = {}) {
  const user = await read(`users/${uid}`);
  return assessmentOperation(db, uid, { classId: "a", progressSession: user.progressSession, lessonId: "only", operation, ...fields });
}
async function say(uid, index, text = words[index]) {
  const user = await read(`users/${uid}`);
  return submitSpeech(db, uid, { classId: "a", progressSession: user.progressSession, lessonId: "only", operation: "speech", part: "pronunciation", index, eventId: `recording-${++event}`, audio }, "Bearer synthetic", async () => text);
}
async function restorePartial(uid, { nothingFinished = true } = {}) {
  const before = await read(`users/${uid}/assignedLessons/only`);
  const session = (await read(`users/${uid}`)).progressSession;
  assert.equal((await db.collection(`users/${uid}/assignedLessons`).get()).size, 1);
  if (nothingFinished) for (const part of ["lecture", "game", "activity", "pronunciation", "quiz"]) assert.notEqual(before[`${part}Finished`], true);
  await archiveClassMember(db, "teacher", "a", uid);
  const history = await read(`users/${uid}/classProgress/a`);
  assert.equal(history.progressCount, 1, "A single partial lesson is eligible");
  await requestClassJoin(db, uid, "ABC123");
  const pending = await read(`classes/a/joinRequests/${uid}`);
  assert.equal(pending.hasPreviousProgress, true, "Teacher must see Restore even without a finished part");
  assert.equal(await read(`users/${uid}/assignedLessons/only`), undefined, "Approval is still required");
  await reviewClassJoins(db, "teacher", "a", [{ studentId: uid, requestId: pending.requestId }], "approve");
  assert.equal((await read(`users/${uid}`)).progressSession, session);
  const after = await read(`users/${uid}/assignedLessons/only`);
  assert.deepEqual(after.resume, before.resume);
  assert.deepEqual(after.assessmentState, before.assessmentState);
  if (nothingFinished) for (const part of ["lecture", "game", "activity", "pronunciation", "quiz"]) assert.notEqual(after[`${part}Finished`], true);
  return after;
}
try {
  for (const [path, data] of [
    ["users/teacher", { role: "teacher" }], ["classes/a", { teacherId: "teacher", classCode: "ABC123" }],
    ["classes/a/classLessons/only", { lessonId: "only" }], ["lessons/only", { title: "Only lesson" }],
    ["lessons/only/lectures/content", { pages: Array.from({ length: 4 }, () => ({ sentences: ["Read"] })) }],
    ["lessons/only/pronunciation/content", { words }],
    ["lessons/only/activity/content", { pages: words.map(word => ({ words: [word, "other"], correctIndices: [0] })) }],
    ["lessons/only/quiz/content", { questions: words.map(word => ({ question: word, choices: ["yes", "no"], answer: 0 })) }],
    ["lessons/only/game/level1", { level: 1, words }],
  ]) await db.doc(path).set(data);
  for (const uid of ["lecture", "speech", "activity", "game", "quiz"]) {
    await db.doc(`users/${uid}`).set({ role: "student", classId: "" }); await enroll(uid);
  }
  await test("unfinished lecture alone offers Restore and continues from page 3 of 4", async () => {
    await op("lecture", "resume", { part: "lecture", done: 1 }); await op("lecture", "resume", { part: "lecture", done: 2 });
    const restored = await restorePartial("lecture"); assert.equal(restored.resume.lecture.done, 2);
    await op("lecture", "resume", { part: "lecture", done: 3 });
    assert.equal((await read("users/lecture/assignedLessons/only")).resume.lecture.done, 3);
    await assert.rejects(op("lecture", "finish", { part: "lecture" }), error => error.status === 409);
  });
  await test("3 of 5 pronunciation words restore with no lecture or lesson completed", async () => {
    for (let index = 0; index < 3; index++) await say("speech", index);
    const restored = await restorePartial("speech");
    assert.equal(restored.resume.pronunciation.done, 3); assert.equal(restored.resume.pronunciation.total, 5);
    assert.equal(restored.resume.pronunciation.correct, 3); assert.equal(restored.resume.pronunciation.firstTryCorrect, 3);
    assert.equal((await op("speech", "speech-check", { part: "pronunciation", index: 3, eventId: "next-word" })).word, "aso");
  });
  await test("restored pronunciation continues at word 4 without repeating accepted words", async () => {
    const reply = await say("speech", 3); assert.equal(reply.done, 4); assert.equal(reply.correct, 4);
    await assert.rejects(say("speech", 0), error => error.status === 409);
  });
  await test("an unfinished word also restores its remaining lives and prior mistakes", async () => {
    await say("speech", 4, "salitangmali");
    const restored = await restorePartial("speech");
    assert.equal(restored.resume.pronunciation.done, 4); assert.equal(restored.resume.pronunciation.lives, 2);
    assert.equal(restored.resume.pronunciation.misses, 1); assert.deepEqual(restored.resume.pronunciation.hardWords, ["pusa"]);
    const reply = await say("speech", 4); assert.equal(reply.done, 5); assert.equal(reply.firstTryCorrect, 4);
    await op("speech", "finish", { part: "pronunciation" });
    const finished = await read("users/speech/assignedLessons/only");
    assert.equal(finished.pronunciationFinished, true); assert.equal(finished.skills.pagbigkas.correct, 4); assert.equal(finished.skills.pagbigkas.items, 5);
  });
  await test("3 of 5 activity pages restore and accept page 4", async () => {
    for (let index = 0; index < 3; index++) await op("activity", "answer", { part: "activity", index, selected: [0], eventId: `activity-${index}` });
    const restored = await restorePartial("activity"); assert.equal(restored.resume.activity.done, 3);
    assert.equal((await op("activity", "answer", { part: "activity", index: 3, selected: [0], eventId: "activity-next" })).done, 4);
  });
  await test("3 found words restore even before the first game level is finished", async () => {
    for (const word of words.slice(0, 3)) await op("game", "answer", { part: "game", level: 1, word, eventId: `game-${word}` });
    const restored = await restorePartial("game"); assert.equal(restored.gameScore, undefined);
    assert.equal(restored.resume.game.done, 3); assert.deepEqual(restored.resume.game.foundWords, words.slice(0, 3).map(word => word.toUpperCase()));
    assert.equal((await op("game", "answer", { part: "game", level: 1, word: "aso", eventId: "game-next" })).done, 4);
  });
  await test("3 accepted quiz answers restore their original unfinished attempt", async () => {
    for (let done = 1; done <= 4; done++) await op("quiz", "resume", { part: "lecture", done });
    await op("quiz", "finish", { part: "lecture" }); const start = await op("quiz", "begin", { part: "quiz" });
    for (let index = 0; index < 3; index++) await op("quiz", "answer", { part: "quiz", attemptId: start.attemptId, index, selected: [0], eventId: `quiz-${index}` });
    const restored = await restorePartial("quiz", { nothingFinished: false }); assert.equal(restored.quizFinished, undefined);
    const continued = await op("quiz", "begin", { part: "quiz" }); assert.equal(continued.attemptId, start.attemptId); assert.equal(continued.done, 3);
    assert.equal((await op("quiz", "answer", { part: "quiz", attemptId: start.attemptId, index: 3, selected: [0], eventId: "quiz-next" })).done, 4);
    await assert.rejects(op("quiz", "finish", { part: "quiz", attemptId: start.attemptId }), error => error.status === 409);
  });
  console.log(`Partial progress restoration: ${checks} end-to-end server scenarios passed.`);
} finally { await db.terminate(); await deleteApp(app); await emulator.stop(); }
