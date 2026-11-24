import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { downloadLessons } from "../student/downloadQueue.js";
import { withDownloadAbort } from "../student/downloadCancellation.js";
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const noop = () => {};
const defaults = { shouldContinue: () => true, isEligible: () => true, onProgress: noop, onResult: noop };
const lessons = [{ id: "a" }, { id: "b" }, { id: "c" }];
let active = 0;
let maximum = 0;
const order = [];
const progress = [];
const normal = await downloadLessons(lessons, {
  ...defaults,
  download: async (lesson, report) => {
    maximum = Math.max(maximum, ++active);
    order.push(lesson.id);
    await Promise.resolve();
    report(50);
    report(100);
    active--;
  },
  onProgress: (lesson, index, total, percent) => progress.push([lesson.id, index, total, percent]),
});
check(maximum === 1, "Bulk downloads run sequentially");
check(order.join() === "a,b,c" && normal.downloaded === 3, "All queued lessons complete in order");
check(progress[0][3] === 0 && progress.at(-1)[3] === 100 && progress.every((item) => item[2] === 3), "Progress reports lesson position and percentage");
const failed = [];
const partial = await downloadLessons(lessons, {
  ...defaults,
  download: async (lesson) => { if (lesson.id === "b") throw new Error("storage full"); },
  onResult: async (lesson, error) => { if (error) failed.push(lesson.id); },
});
check(partial.downloaded === 2 && partial.failed === 1 && failed.join() === "b", "A failed lesson is reported while later lessons continue");
const saved = new Set(["a"]);
const skip = await downloadLessons([...lessons, { id: "b" }], {
  ...defaults,
  isEligible: (lesson) => !saved.has(lesson.id),
  download: async (lesson) => saved.add(lesson.id),
});
check(skip.downloaded === 2 && skip.skipped === 2, "Existing downloads and newly completed duplicate entries are skipped");
let connected = true;
const stopped = await downloadLessons(lessons, {
  ...defaults,
  shouldContinue: () => connected,
  download: async () => { connected = false; },
});
check(stopped.stopped && stopped.downloaded === 1, "Offline or account/view changes stop the remaining queue");
const cancelled = await downloadLessons(lessons, { ...defaults, shouldContinue: () => false, download: async () => assert.fail("must not download") });
check(cancelled.stopped && cancelled.downloaded === 0, "Leaving before the queue starts downloads nothing");
let closed = false;
const changedSchedule = await downloadLessons(lessons, {
  ...defaults,
  isEligible: (lesson) => lesson.id !== "b" || !closed,
  download: async () => { closed = true; },
});
check(changedSchedule.downloaded === 2 && changedSchedule.skipped === 1, "Eligibility is rechecked when a lesson's schedule changes");
const empty = await downloadLessons([], { ...defaults, download: async () => assert.fail("empty queue") });
check(empty.downloaded === 0 && !empty.stopped, "An empty eligible list is handled cleanly");
const controller = new AbortController();
const cancelledOrder = [];
const cancelledResults = [];
const cancelledDuringTransfer = await downloadLessons(lessons, {
  ...defaults,
  signal: controller.signal,
  download: async (lesson) => {
    cancelledOrder.push(lesson.id);
    if (lesson.id === "b") {
      queueMicrotask(() => controller.abort());
      await withDownloadAbort(new Promise(() => {}), controller.signal);
    }
  },
  onResult: async (lesson, error) => cancelledResults.push([lesson.id, error?.name]),
});
check(cancelledDuringTransfer.stopped && cancelledDuringTransfer.downloaded === 1 && cancelledDuringTransfer.failed === 0, "Cancelling an active transfer retains completed lessons and is not counted as failure");
check(cancelledOrder.join() === "a,b" && cancelledResults[1][1] === "AbortError", "Cancel cleans up the active item and never starts remaining lessons");
const preCancelled = new AbortController();
preCancelled.abort();
const neverStarted = await downloadLessons(lessons, { ...defaults, signal: preCancelled.signal, download: async () => assert.fail("cancelled queue") });
check(neverStarted.stopped && neverStarted.downloaded === 0, "Cancelling during preparation prevents all transfers");
await assert.rejects(withDownloadAbort(Promise.resolve("ready"), preCancelled.signal), { name: "AbortError" });
check(await withDownloadAbort(Promise.resolve("ready"), new AbortController().signal) === "ready", "Abortable preparation still returns successful reads");

// Render the actual lesson-card functions with lightweight DOM-independent inputs.
let installed = true;
const context = vm.createContext({
  window: { matchMedia: () => ({ matches: installed }) },
  navigator: { standalone: false, onLine: true },
  icon: () => '<svg aria-hidden="true"></svg>', escapeHtml: String,
  canOpen: () => true, availability: () => "open", isComplete: () => false,
  student: { lessons: [] },
});
const source = (await readFile(new URL("../student/views/home.js", import.meta.url), "utf8"))
  .split("const TABS =")[0].replace(/import\s+[\s\S]*?from\s*["'][^"']+["'];/g, "");
vm.runInContext(source + `\nglobalThis.cards = {
  render: lessonCard,
  saved: () => downloads.set("a", { meta: { contentVersion: 1 } }),
  bulk: () => { bulkDownloading = true; },
  update: updateDownloadCard,
  progress: (percent) => { downloading.add("a"); downloadProgress.set("a", percent); },
  matchesTab: matchesLessonTab,
};`, context);
const lesson = { id: "a", title: "Aralin", difficulty: "beginner", contentVersion: 1, practice: true };
context.student.lessons = [lesson];
check(!context.cards.render(lesson, "").includes('class="st-downloaded-ribbon"'), "Cards reserve completion remarks for learning status");
check(!context.cards.matchesTab(lesson, "downloaded"), "The downloaded tab excludes lessons without local downloads");
context.cards.saved();
const card = context.cards.render(lesson, "");
check(!card.includes('class="st-downloaded-ribbon"'), "Downloaded cards use their icon rather than a completion ribbon");
check(context.cards.matchesTab(lesson, "downloaded") && context.cards.matchesTab(lesson, "all"), "Saved lessons appear in both Downloaded and All");
check(!context.cards.matchesTab({ ...lesson, id: "b", quizFinished: true }, "downloaded"), "Finishing a lesson does not imply it is downloaded");
check(card.indexOf('data-download-state="a"') < card.indexOf('<details class="st-download-menu"'), "Downloaded indicator stays outside the three-dot menu");
installed = false;
const browserCard = context.cards.render(lesson, "");
check(!browserCard.includes('class="st-downloaded-ribbon"') && !browserCard.includes('data-download-menu="a"'), "Normal browser tabs hide the PWA download features");
installed = true;
context.cards.bulk();
check((context.cards.render(lesson, "").match(/ disabled/g) || []).length === 2, "Individual update and remove actions are disabled during a bulk download");
// Updating percentage must retain the same ring/card/menu nodes. A full list
// replacement restarts CSS entry animations and was the source of the flicker.
const ringAttributes = {};
const strokeAttributes = {};
const ring = { setAttribute: (key, value) => ringAttributes[key] = value,
  querySelector: () => ({ setAttribute: (key, value) => strokeAttributes[key] = value }) };
const indicator = { querySelector: (selector) => selector === ".st-download-ring" ? ring : null };
Object.defineProperty(indicator, "innerHTML", { set: () => assert.fail("A progress tick must not replace the indicator") });
const download = {};
const remove = {};
const hint = {};
const cardNodes = {
  "[data-download-state]": indicator,
  "[data-download]": download, "[data-remove-download]": remove, "[data-download-hint]": hint,
};
const liveCard = { dataset: { downloadCard: "a" }, querySelector: (selector) => cardNodes[selector] };
for (const percent of [1, 10, 50, 99]) {
  context.cards.progress(percent);
  context.cards.update(liveCard);
}
check(ringAttributes["aria-valuenow"] === 99 && strokeAttributes["stroke-dashoffset"] === 1, "Progress updates the existing ring attributes");
check(download.textContent === "Dina-download… 99%", "Progress text updates without replacing the menu button");
check(!remove.hidden, "Downloaded state and menu nodes remain intact during progress");
console.log(`Passed ${checks} bulk-download and card checks.`);
