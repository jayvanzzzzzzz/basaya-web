import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const generated = await read("offline-shell.js");
const worker = await read("service-worker.js");
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }

async function serviceWorker(failSDK = false) {
  const stores = new Map();
  const events = {};
  const base = "https://example.test/BaSaya-web/";
  const normalize = (value) => typeof value === "string" ? value : value.url || value.href;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const items = stores.get(name);
      return {
        put: async (key, value) => items.set(normalize(key), value),
        match: async (key) => items.get(normalize(key))?.clone(),
        addAll: async (urls) => {
          for (const url of urls) {
            const path = url.slice(base.length);
            await access(new URL(path, root));
            items.set(url, new Response(await readFile(new URL(path, root))));
          }
        },
      };
    },
  };
  let network = true;
  const fetch = async (request) => {
    const url = normalize(request);
    if (!network) throw new Error("offline");
    if (url.startsWith("https://www.gstatic.com/")) {
      if (failSDK) throw new Error("SDK network failure");
      return new Response(url.endsWith("firebase-auth.js") ? 'import { shared } from "./shared.js";' : "export const shared = true;");
    }
    return new Response("network");
  };
  const self = { registration: { scope: base }, clients: { claim: async () => {} }, addEventListener: (name, fn) => events[name] = fn };
  const context = vm.createContext({ self, caches, fetch, URL, Response, importScripts: () => vm.runInContext(generated, context) });
  vm.runInContext(worker, context);
  let installation;
  events.install({ waitUntil: (value) => installation = value });
  if (failSDK) {
    await assert.rejects(installation);
    check(![...stores.values()].some((store) => store.has(`${base}.offline-ready`)), "Failed SDK installation must not mark shell ready");
    return;
  }
  await installation;
  check([...stores.values()].some((store) => store.has(`${base}.offline-ready`)), "Complete shell is marked ready");
  check(stores.get("basaya-sdk-v2").has("https://www.gstatic.com/firebasejs/10.12.2/shared.js"), "Transitive SDK module is cached");
  network = false;
  let rootResponse;
  events.fetch({ request: { url: base, mode: "navigate", method: "GET" }, respondWith: (value) => rootResponse = value });
  const redirect = await rootResponse;
  check(redirect.status === 302 && redirect.headers.get("location") === `${base}student/`, "Installed PWA root launch redirects to the student shell offline");
  async function request(url, mode = "cors", method = "GET") {
    let result;
    events.fetch({ request: { url, mode, method }, respondWith: (value) => result = value });
    return result ? await (await result).text() : null;
  }
  check((await request(`${base}student/`, "navigate")).includes('id="app-view"'), "Offline student navigation gets the student shell");
  check((await request(`${base}student/index.html?installed=1`, "navigate")).includes('id="app-view"'), "Explicit student URL with a query gets the shell");
  check((await request(`${base}admin/`, "navigate")).includes("html"), "Other portals retain an offline fallback");
  check((await request(`${base}student/data.js?v=1`)).includes("downloadLesson"), "Versioned static requests match cached shell files");
  check(await request("https://firestore.googleapis.com/private") === null, "Authenticated Firebase API requests are not cached");
  check(await request(`${base}student/data.js`, "cors", "POST") === null, "Mutations are never intercepted");
}
await serviceWorker();
await serviceWorker(true);

// Exercise the real save/receipt module against Firestore event sequencing.
const storage = new Map();
const listeners = new Set();
const writes = [];
const status = { hidden: true, textContent: "", append() {} };
const localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
const syncContext = vm.createContext({
  localStorage, navigator: { onLine: false }, window: { addEventListener() {} },
  document: { getElementById: () => status, createElement: () => ({ setAttribute() {}, addEventListener() {} }) },
  offlineReady: Promise.resolve(true), queueMicrotask,
  onSnapshot: (reference, options, callback) => {
    const listener = { reference, callback };
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setDoc: (reference) => {
    queueMicrotask(() => {
      for (const listener of listeners) if (listener.reference === reference) listener.callback({ metadata: { hasPendingWrites: true } });
    });
    return new Promise((resolve, reject) => writes.push({ resolve, reject }));
  },
});
vm.runInContext((await read("student/sync.js")).replace(/^import .*;\r?\n/gm, "").replaceAll("export ", ""), syncContext);
const reference = { id: "lesson-1" };
await syncContext.saveLocally(reference, { resume: { quiz: { done: 1, total: 3, updatedAt: { _methodName: "serverTimestamp" } } } }, { merge: true }, "student-1");
check(writes.length === 1, "Offline save resolves on local acknowledgement without waiting for the server");
check(JSON.parse(storage.get("basaya.pendingSaves.student-1"))[reference.id]["resume.quiz.done"].value === 1, "Resume receipt survives a restart");
await syncContext.saveLocally(reference, { quizFinished: true, resume: { quiz: { _methodName: "deleteField" } } }, { merge: true }, "student-1");
const receipt = JSON.parse(storage.get("basaya.pendingSaves.student-1"))[reference.id];
check(!receipt["resume.quiz.done"] && receipt["resume.quiz"].deleted, "Completing a quiz removes obsolete resume receipt fields");
syncContext.watchSync("student-1", "progress-query");
check(syncContext.hasPendingSaves(), "Reloaded pending receipts prevent sign-out");
const queryListener = [...listeners].find((item) => item.reference === "progress-query");
queryListener.callback({ metadata: { hasPendingWrites: false, fromCache: false }, docs: [{ id: "lesson-1", data: () => ({ quizFinished: true }) }] });
check(!syncContext.hasPendingSaves(), "Matching server acknowledgement clears the receipt");
check(!storage.get("basaya.syncError.student-1"), "Accepted writes do not show rejection warnings");
storage.set("basaya.pendingSaves.student-1", JSON.stringify({ "lesson-1": { quizFinished: { value: true } } }));
queryListener.callback({ metadata: { hasPendingWrites: false, fromCache: false }, docs: [] });
check(Boolean(storage.get("basaya.syncError.student-1")), "Rejected offline progress is detected after a restart");
writes.forEach((write) => write.resolve());
console.log(`Passed ${assertions} offline regression checks.`);
