import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { withDownloadAbort } from "../student/downloadCancellation.js";
const source = (await readFile(new URL("../student/data.js", import.meta.url), "utf8"))
  .split("export async function downloadLesson(")[1].split("export const downloadedLessons")[0];
const functionSource = "async function downloadLesson(" + source.replaceAll("import.meta.url", '"https://example.test/student/data.js"');
let assertions = 0;
async function scenario(cancelAtProgress) {
  const controller = new AbortController();
  const fetched = [];
  const removed = [];
  let committed = 0;
  const cache = { put: async () => {}, match: async () => new Response("ready") };
  const lesson = { id: "a", title: "Aralin" };
  const context = vm.createContext({
    withDownloadAbort, Promise, setTimeout, clearTimeout, AbortController, Response,
    navigator: { onLine: true, serviceWorker: { ready: Promise.resolve({ active: true }) } },
    caches: { keys: async () => ["basaya-offline-v2-test"], open: async () => cache, delete: async (name) => removed.push(name) },
    offlineReady: Promise.resolve(true), URL, console,
    student: { uid: "student-a" }, classId: () => "class-a", findLesson: async () => lesson, canOpen: () => true,
    collection: () => ({}), db: {}, contentId: (id) => id,
    getDocsFromServer: async () => ({ docs: [{ id: "content", data: () => ({ cloudAudio: [{ audioUrl: "https://audio.test/one.mp3" }, { audioUrl: "https://audio.test/two.mp3" }] }) }] }),
    loadLessonProgress: async () => ({}), getDownload: async () => null,
    putDownload: async () => { committed++; },
    fetch: async (url, options) => {
      assert.equal(options.signal, controller.signal, "The audio transfer receives the cancellation signal");
      fetched.push(url);
      return new Response("audio");
    },
  });
  vm.runInContext(functionSource, context);
  const transfer = context.downloadLesson("a", () => {
    if (cancelAtProgress) controller.abort();
  }, { signal: controller.signal });
  if (cancelAtProgress) {
    await assert.rejects(transfer, { name: "AbortError" });
    assert.equal(fetched.length, 1, "The next audio file is not fetched after cancellation");
    assert.equal(committed, 0, "A cancelled lesson is not marked downloaded");
    assert.ok(removed.some((name) => name.startsWith("basaya-audio-student-a-")), "The partial audio cache is removed");
    assertions += 4;
  } else {
    await transfer;
    assert.equal(fetched.length, 2);
    assert.equal(committed, 1, "An uninterrupted lesson is committed");
    assert.equal(removed.length, 0, "Completed audio is retained");
    assertions += 3;
  }
}
await scenario(true);
await scenario(false);
console.log(`Passed ${assertions} download commit/cancellation checks.`);
