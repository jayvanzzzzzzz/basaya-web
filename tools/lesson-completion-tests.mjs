import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [data, home, notifications] = await Promise.all([
  "student/data.js", "student/views/home.js", "student/views/notifications.js",
].map(file => readFile(new URL(`../${file}`, import.meta.url), "utf8")));
const functionSource = (source, name) => {
  const match = source.match(new RegExp(`(?:export )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Missing function ${name}`);
  return match[0].replace(/^export /, "");
};
const complete = data.match(/export const isComplete = [^]*?;/);
assert.ok(complete);
const HOUR = 60 * 60 * 1000;
const time = 10 * 24 * HOUR;
const student = { lessons: [] };
const context = vm.createContext({ student, HOUR, DAY: 24 * HOUR, feed: [],
  formatWhen: String, now: () => time });
vm.runInContext([
  complete[0].replace("export ", ""),
  functionSource(data, "availability"), functionSource(data, "canOpen"),
  functionSource(home, "statusOf"), functionSource(home, "percentOf"),
  functionSource(notifications, "visibleItems"),
  "globalThis.check = { isComplete, statusOf, percentOf, canOpen, visibleItems };",
].join("\n"), context);
const { isComplete, statusOf, percentOf, canOpen, visibleItems } = context.check;
const finished = { id: "lesson", title: "Lesson", dueAt: time + HOUR / 2,
  lectureFinished: true, gameFinished: true, activityFinished: true,
  pronunciationFinished: true, quizFinished: true };
let checks = 0;
const test = (label, run) => { run(); checks++; console.log(`PASS: ${label}`); };

test("unfinished Bigkas leaves Home at 80% with deadline reminders", () => {
  const lesson = { ...finished, pronunciationFinished: false };
  assert.equal(isComplete(lesson), false);
  assert.equal(statusOf(lesson).label, "Nasa progreso");
  assert.equal(percentOf(lesson), 80);
  student.lessons = [lesson];
  assert.deepEqual(Array.from(visibleItems(), item => item.kind), ["hour", "day"]);
});
test("all five finished parts show completion and suppress deadline reminders", () => {
  assert.equal(isComplete(finished), true);
  assert.equal(statusOf(finished).label, "Tapos na");
  assert.equal(percentOf(finished), 100);
  student.lessons = [finished];
  assert.equal(visibleItems().length, 0);
});
test("every required part must be complete, including missing Bigkas flags", () => {
  for (const field of ["lectureFinished", "gameFinished", "activityFinished", "pronunciationFinished", "quizFinished"]) {
    const lesson = { ...finished, [field]: false };
    assert.ok(!isComplete(lesson), field);
    assert.equal(percentOf(lesson), 80, field);
  }
  const legacy = { ...finished };
  delete legacy.pronunciationFinished;
  assert.ok(!isComplete(legacy));
  assert.equal(percentOf(legacy), 80);
});
test("skipped game and Gawain stay optional while Bigkas stays required", () => {
  const lesson = { ...finished, gameFinished: false, activityFinished: false,
    gameSkipped: true, activitySkipped: true };
  assert.equal(isComplete(lesson), true);
  assert.equal(percentOf(lesson), 100);
  lesson.pronunciationFinished = false;
  assert.equal(isComplete(lesson), false);
  assert.equal(percentOf(lesson), 66);
  student.lessons = [lesson];
  assert.equal(visibleItems().length, 2);
});
test("Bigkas alone counts as progress and an untouched lesson stays new", () => {
  assert.equal(statusOf({ pronunciationFinished: true }).key, "progress");
  assert.equal(percentOf({ pronunciationFinished: true }), 20);
  assert.equal(statusOf({}).key, "new");
  assert.equal(percentOf({}), 0);
});
test("closed lessons require Bigkas completion for review access", () => {
  const closed = { ...finished, dueAt: time - 1 };
  assert.equal(canOpen(closed), true);
  assert.equal(canOpen({ ...closed, pronunciationFinished: false }), false);
});
console.log(`Lesson completion: ${checks} scenarios passed.`);
