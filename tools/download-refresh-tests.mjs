import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const root = process.env.BASAYA_WEB_TEST_ROOT
  ? pathToFileURL(process.env.BASAYA_WEB_TEST_ROOT.replace(/\\/g, "/") + "/")
  : new URL("../", import.meta.url);
const storageSource = await readFile(new URL("student/offlineStore.js", root), "utf8");
const home = await readFile(new URL("student/views/home.js", root), "utf8");
const start = home.indexOf("  const load = async");
const end = home.indexOf("  /** From a tapped notification", start);
assert(start >= 0 && end > start, "Home refresh function is present");
const refreshSource = home.slice(start, end) + "\nglobalThis.refresh = load;";
const recordKey = (uid, cid, id = "lesson") => JSON.stringify([uid, cid, id]);
const oldDownload = () => ({
  key: recordKey("student", "class"), uid: "student", classId: "class",
  meta: { id: "lesson", title: "Old title", contentVersion: 1 },
  parts: { lectures: ["old content"] }, audioCache: "old-cache", downloadedAt: 100,
});

// A queued IndexedDB facade runs request callbacks before transaction completion.
// It records transaction boundaries while exercising the actual production store module.
function storage() {
  const rows = new Map();
  const transactions = [];
  const database = {
    createObjectStore() {},
    transaction(_name, mode) {
      const operations = [];
      const trace = { mode, operations: [] };
      transactions.push(trace);
      const tx = { objectStore: () => store };
      const request = (type, action) => {
        const result = {};
        operations.push(() => {
          trace.operations.push(type);
          result.result = structuredClone(action());
          result.onsuccess?.();
        });
        return result;
      };
      const store = {
        get: (key) => request("get", () => rows.get(key)),
        getAll: () => request("getAll", () => [...rows.values()]),
        put: (item) => request("put", () => { rows.set(item.key, structuredClone(item)); return item.key; }),
        delete: (key) => request("delete", () => { rows.delete(key); }),
      };
      const drain = () => {
        try {
          if (!operations.length) { tx.oncomplete?.(); return; }
          operations.shift()();
          setImmediate(drain);
        } catch (error) { tx.error = error; tx.onerror?.(); }
      };
      setImmediate(drain);
      return tx;
    },
  };
  const context = vm.createContext({
    indexedDB: { open: () => {
      const request = { result: database };
      setImmediate(() => { request.onupgradeneeded?.(); request.onsuccess?.(); });
      return request;
    } },
    caches: { delete: async () => true },
  });
  vm.runInContext(storageSource.replace(/\bexport /g, "") + `
    globalThis.api = { getDownload, putDownload, listDownloads, removeDownload,
      updateDownloadMetadata: typeof updateDownloadMetadata === "function" ? updateDownloadMetadata : undefined };
  `, context);
  return { rows, transactions, api: context.api };
}

async function refreshScenario({ change = () => {}, switchScope = false, online = true, assigned = true } = {}) {
  const state = storage();
  state.rows.set(recordKey("student", "class"), oldDownload());
  const student = { uid: "student", profile: { classId: "class" }, lessons: assigned
    ? [{ id: "lesson", title: "Current title", contentVersion: 3, dueAt: 999 }] : [] };
  let reads = 0;
  const list = async (uid, cid) => {
    const snapshot = await state.api.listDownloads(uid, cid);
    if (++reads === 1) await change(state, student);
    return snapshot;
  };
  const element = { textContent: "", closest: () => ({ hidden: false }) };
  const context = vm.createContext({
    console, JSON, Map, active: true, navigator: { onLine: online }, student, search: element, $: () => element,
    downloads: new Map(), classId: () => student.profile.classId,
    loadProfile: async () => {}, loadClassLessons: async () => {
      if (switchScope) { student.uid = "other"; student.profile.classId = "other-class"; }
    },
    ...state.api, listDownloads: list,
    downloadedLessons: () => list(student.uid, student.profile.classId),
    removeLessonDownload: (id) => state.api.removeDownload(student.uid, student.profile.classId, id),
    refreshDownloads() {}, draw() {}, refreshBell: async () => {}, highlightFromNotification() {},
  });
  vm.runInContext(refreshSource, context);
  await context.refresh();
  return { ...state, visible: context.downloads };
}

const removed = await refreshScenario({ change: (state) => state.api.removeDownload("student", "class", "lesson") });
assert.equal(removed.rows.size, 0, "Refresh must not restore a removed download");
assert.equal(removed.visible.size, 0, "Removed download must disappear from the card state");

const replaced = await refreshScenario({ change: (state) => state.api.putDownload("student", "class", {
  ...oldDownload(), meta: { id: "lesson", title: "New download", contentVersion: 2 },
  parts: { lectures: ["new content"] }, audioCache: "new-cache", downloadedAt: 200,
}) });
const latest = replaced.rows.get(recordKey("student", "class"));
assert.equal(latest.audioCache, "new-cache", "Refresh must retain the latest audio cache");
assert.deepEqual(latest.parts, { lectures: ["new content"] }, "Refresh must retain the latest lesson content");
assert.equal(latest.downloadedAt, 200, "Refresh must retain the latest download timestamp");
assert.equal(latest.meta.contentVersion, 2, "Saved content version must match the actual downloaded content");
assert.equal(latest.meta.title, "Current title", "Metadata still refreshes");
assert.equal(latest.meta.dueAt, 999, "Teacher schedule still refreshes");
assert.ok(replaced.transactions.some((tx) => tx.mode === "readwrite" && tx.operations.join() === "get,put"),
  "Metadata read and write must occur in one readwrite transaction");

const switched = await refreshScenario({ switchScope: true });
assert.equal(switched.transactions.length, 0, "Account/class switch must stop the old refresh before storage access");
const switchedDuringRead = await refreshScenario({ change: (_state, student) => {
  student.uid = "other"; student.profile.classId = "other-class";
} });
assert.ok(switchedDuringRead.transactions.every((tx) => tx.mode === "readonly"),
  "Account/class switch during a storage read must stop writes");
assert.equal(switchedDuringRead.visible.size, 0, "An old scope must not replace visible download state");

const missing = storage();
await missing.api.updateDownloadMetadata("student", "class", { id: "lesson", contentVersion: 3 });
assert.equal(missing.rows.size, 0, "Metadata refresh must not create downloads");
missing.rows.set(recordKey("other", "class"), { ...oldDownload(), key: recordKey("other", "class"), uid: "other" });
await missing.api.updateDownloadMetadata("student", "class", { id: "lesson", title: "Wrong account" });
assert.equal(missing.rows.get(recordKey("other", "class")).meta.title, "Old title",
  "Metadata refresh must not touch another account");
missing.rows.set(recordKey("student", "other-class"), { ...oldDownload(), key: recordKey("student", "other-class"), classId: "other-class" });
await missing.api.updateDownloadMetadata("student", "class", { id: "lesson", title: "Wrong class" });
assert.equal(missing.rows.get(recordKey("student", "other-class")).meta.title, "Old title",
  "Metadata refresh must not touch another class");

const offline = await refreshScenario({ online: false });
assert.equal(offline.visible.size, 1, "Offline refresh still shows saved lessons");
assert.ok(offline.transactions.every((tx) => tx.mode === "readonly"), "Offline refresh must not rewrite downloads");
const unassigned = await refreshScenario({ assigned: false });
assert.equal(unassigned.rows.size, 0, "Downloads no longer assigned to the class are still removed");
console.log("Passed 18 download refresh and storage checks.");
