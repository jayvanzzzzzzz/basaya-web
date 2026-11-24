import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../student/data.js", import.meta.url), "utf8");
const loader = source.slice(source.indexOf("export async function loadClassLessons("), source.indexOf("/** One class lesson by id"));
const cacheSource = source.slice(source.indexOf("const dataScope"), source.indexOf("export const classId"));
const metadataSource = source.slice(source.indexOf("let metadataRetryAt"), source.indexOf("export const submitAnswer"));
const links = Array.from({ length: 20 }, (_, i) => ({
  id: `lesson${i}`, get: field => ({ lessonId: `lesson${i}`, order: i })[field],
}));
const lessons = links.map(link => ({ id: link.id, get: field => field === "title" ? link.id : undefined }));
const calls = [], warnings = [];
let time = 100_000, version = null, databaseReads = 0, failure = new TypeError("Failed to fetch");
const state = { uid: "student", profile: {}, lessons: [] };
const context = vm.createContext({
  student: state, navigator: { onLine: true }, Date: { now: () => time },
  classId: () => "class", contentId: id => id, toMillis: () => version, forgetFoundWords: () => {},
  db: {}, collection: (_, ...parts) => parts.join("/"), doc: () => ({}),
  query: () => "lesson-query", where: () => ({}), documentId: () => ({}),
  getDoc: async () => ({ get: () => null }),
  getDocs: async path => { databaseReads++; return { docs: path === "lesson-query" ? lessons : path.includes("assignedLessons") ? [] : links }; },
  linkLessonId: link => link.get("lessonId"), entryId: link => link.id,
  isPracticeLink: link => link.get("mode") === "practice", hasStarted: () => false,
  lessonParts: () => ({ finished: false }),
  scoredLessons: () => state.lessons,
  console: { warn: (...args) => warnings.push(args) },
  postToApi: async (_, body) => {
    calls.push(body);
    if (failure) throw failure;
    const metadata = { skipped: { game: true, activity: false }, counts: { quiz: 2 }, items: {} };
    return body.operation === "metadata-list"
      ? { lessons: Object.fromEntries(lessons.map(lesson => [lesson.id, metadata])) }
      : metadata;
  },
});
vm.runInContext(`${cacheSource.replaceAll("export ", "")} ${metadataSource.replaceAll("export ", "")} ${loader.replaceAll("export ", "")}`, context);
const load = () => context.loadClassLessons({ force: true });

await load();
assert.equal(state.lessons.length, 20, "API outage must not block the Home lesson list");
assert.equal(calls.length, 1, "One unavailable API must not create twenty failing requests");
assert.equal(warnings.length, 1);
assert.equal(state.lessons[0].gameSkipped, false, "Unknown parts must not count as completed");
await load();
assert.equal(calls.length, 1, "Reloading within the cooldown must not retry the missing route");

time += 30_001;
failure = null;
await load();
assert.equal(calls.length, 2, "Twenty lessons load in one request after the cooldown");
assert.ok(state.lessons.every(lesson => lesson.gameSkipped));
assert.equal(calls.at(-1).operation, "metadata-list");
assert.equal((await context.assessmentRequest("lesson0", "metadata")).counts.quiz, 2);
await load();
assert.equal(calls.length, 2, "Home and lesson path reuse the same metadata");

version = 1;
await load();
assert.equal(calls.length, 3, "A content version change bypasses the cache immediately");
await context.assessmentRequest("lesson0", "answer", { part: "game", word: "BAHAY" });
await context.assessmentRequest("lesson0", "answer", { part: "game", word: "BAHAY" });
assert.equal(calls.length, 5, "Answer submissions always reach the server");

state.profile.progressSession = "new-session";
await Promise.all([load(), load()]);
assert.equal(calls.length, 6, "New progress sessions invalidate cached metadata; concurrent loads share one request");
state.uid = "another-student";
await load();
assert.equal(calls.length, 7, "Accounts cannot share cached metadata");

time += 60_001;
failure = Object.assign(new Error("Not found"), { status: 404 });
await load();
assert.equal(calls.length, 8, "Expired metadata is retried once, including HTTP 404 failures");
assert.ok(state.lessons.every(lesson => lesson.gameSkipped), "An outage preserves previously loaded skip flags");
console.log("Passed metadata batching, reuse, expiry, scope/version invalidation, concurrent requests, uncached answers and outage checks.");

let before = databaseReads;
await context.loadClassLessons();
assert.equal(databaseReads, before, "Fresh Home/Progress visits reuse the class snapshot");
context.invalidateStudentData();
await context.loadClassLessons();
assert.equal(databaseReads, before + 3, "Accepted answers or live changes invalidate class/progress reads");
before = databaseReads;
await context.loadClassLessons({ force: true });
assert.equal(databaseReads, before + 3, "Manual refresh always fetches fresh class data");
before = databaseReads;
state.profile.progressSession = "different-session";
await context.loadClassLessons();
assert.equal(databaseReads, before + 3, "A new session cannot reuse old class data");
console.log("Passed class snapshot reuse, invalidation, forced refresh and session isolation.");

const progressSource = source.slice(source.indexOf("export async function loadClassProgressDocs("), source.indexOf("/** Requests a server calculation"));
vm.runInContext(progressSource.replaceAll("export ", ""), context);
before = databaseReads;
await context.loadClassProgressDocs();
assert.equal(databaseReads, before, "Progress reuses the documents fetched with the class snapshot");
await context.loadClassProgressDocs({ force: true });
assert.equal(databaseReads, before + 1, "Explicit progress refresh bypasses the cache");
console.log("Passed progress-document reuse and forced refresh.");

const originalGetDocs = context.getDocs;
let release, hold = true;
const blocked = new Promise(resolve => { release = resolve; });
context.getDocs = async path => {
  if (hold && path.includes("classLessons")) { hold = false; await blocked; }
  return originalGetDocs(path);
};
before = databaseReads;
const oldLoad = context.loadClassLessons({ force: true });
context.invalidateStudentData();
await context.loadClassLessons();
release(); await oldLoad;
assert.equal(databaseReads, before + 5, "A live update supersedes an old load instead of reusing its stale progress");
before = databaseReads;
await context.loadClassLessons();
assert.equal(databaseReads, before, "Only the newer load becomes the reusable snapshot");
console.log("Passed invalidation during an in-flight class load.");
