import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startFirestoreTestServer } from "./firestore-test-server.mjs";
import { requestClassJoin, reviewClassJoins } from "../notify-api/lib/classMembership.js";
import { archiveClassMember } from "../notify-api/lib/classProgress.js";
import { assessmentOperation } from "../notify-api/lib/assessments.js";

// Verify restoration against the server assessment workflow as well as membership.
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const emulator = await startFirestoreTestServer(...process.argv.slice(2));
process.env.FIRESTORE_EMULATOR_HOST = emulator.host;
const app = initializeApp({ projectId: emulator.project });
const db = getFirestore(app);
const read = async path => (await db.doc(path).get()).data();
let session, checks = 0;
async function test(label, run) { await run(); checks++; console.log(`PASS: ${label}`); }
async function approve(mode) {
  await requestClassJoin(db, "student", "ABC123");
  const pending = await read("classes/a/joinRequests/student");
  await reviewClassJoins(db, "teacher", "a", [{ studentId: "student", requestId: pending.requestId, ...(mode ? { progressMode: mode } : {}) }], "approve");
  session = (await read("users/student")).progressSession;
}
const op = async (operation, fields = {}, token = session) => {
  const body = { operation, classId: "a", progressSession: token, lessonId: "lesson", ...fields };
  if (body.part === "quiz" && ["answer", "finish"].includes(operation)) body.attemptId = (await read("users/student/assignedLessons/lesson"))?.assessmentState?.quiz?.attemptId;
  return assessmentOperation(db, "student", body);
};
async function finishLecture() { await op("resume", { part: "lecture", done: 1 }); await op("finish", { part: "lecture" }); await op("begin", { part: "quiz" }); }
try {
  for (const [path, data] of [
    ["users/teacher", { role: "teacher" }], ["users/student", { role: "student", classId: "" }],
    ["classes/a", { teacherId: "teacher", classCode: "ABC123" }],
    ["classes/a/classLessons/lesson", { lessonId: "lesson" }], ["lessons/lesson", { title: "Synthetic" }],
    ["lessons/lesson/lectures/content", { pages: [{ sentences: ["Read"] }] }],
    ["lessons/lesson/quiz/content", { questions: [{ question: "One?", choices: ["a", "b"], answer: 1 }] }],
    ["lessons/lesson/game/level1", { level: 1, words: ["BAHAY", "PUNO"] }],
  ]) await db.doc(path).set(data);
  await approve();
  await test("server-accepted partial attempts and crossword words survive restoration", async () => {
    await finishLecture();
    await op("answer", { part: "quiz", index: 0, selected: [1], eventId: "original-answer" });
    await op("answer", { part: "game", level: 1, word: "BAHAY", eventId: "original-word" });
    const before = await read("users/student/assignedLessons/lesson"); const originalSession = session;
    await archiveClassMember(db, "teacher", "a", "student"); await approve();
    const after = await read("users/student/assignedLessons/lesson");
    assert.equal(session, originalSession); assert.deepEqual(after.assessmentState, before.assessmentState);
    assert.deepEqual(after.resume.game.foundWords, ["BAHAY"]); assert.equal(after.resume.quiz.score, 1);
    await assert.rejects(op("answer", { part: "quiz", index: 0, selected: [0], eventId: "changed-answer" }), error => error.status === 409);
  });
  await test("restoring finalized assessments preserves completion and refuses another attempt", async () => {
    await op("finish", { part: "quiz" });
    const before = await read("users/student/assignedLessons/lesson");
    await archiveClassMember(db, "teacher", "a", "student"); await approve();
    await assert.rejects(op("answer", { part: "quiz", index: 0, selected: [0], eventId: "second-attempt" }), error => error.status === 409);
    assert.equal((await op("finish", { part: "quiz" })).score, 1);
    const after = await read("users/student/assignedLessons/lesson");
    assert.equal(after.quizFinished, true); assert.deepEqual(after.assessmentState, before.assessmentState);
  });
  await test("explicit fresh start permits a new attempt while retaining finalized history", async () => {
    await archiveClassMember(db, "teacher", "a", "student");
    const archiveId = (await read("users/student/classProgress/a")).latestArchiveId;
    const oldSession = session; await approve("fresh"); assert.notEqual(session, oldSession);
    await assert.rejects(op("resume", { part: "lecture", done: 1 }, oldSession), error => error.status === 409);
    await finishLecture();
    await op("answer", { part: "quiz", index: 0, selected: [0], eventId: "new-attempt" });
    assert.equal((await op("finish", { part: "quiz" })).score, 0);
    assert.equal((await read(`users/student/classProgress/a/archives/${archiveId}/lessons/lesson`)).quizScore, 1);
  });
  console.log(`Restored assessments: ${checks} server-finalization integration scenarios passed.`);
} finally { await db.terminate(); await deleteApp(app); await emulator.stop(); }
