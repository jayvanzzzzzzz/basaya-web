import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../js/login.js", import.meta.url), "utf8");
const callback = source.slice(source.lastIndexOf("onAuthStateChanged(auth,"));

async function restore({ user = { uid: "student-1", providerData: [] }, role = "student", exists = true, fromCache = false, failure } = {}) {
  const state = { signOuts: 0, reveals: 0, destination: null, message: {}, removed: [] };
  let pending;
  const context = {
    auth: {}, db: {},
    onAuthStateChanged: (_, handler) => { pending = handler(user); },
    getDoc: async () => {
      if (failure) throw failure;
      return { exists: () => exists, data: () => ({ role }), metadata: { fromCache } };
    },
    doc: () => ({}),
    signOut: async () => { state.signOuts++; },
    revealLogin: () => { state.reveals++; },
    ROLE_DESTINATIONS: { student: "student/index.html", teacher: "teacher/index.html", admin: "admin/index.html" },
    sessionStorage: { removeItem: (key) => state.removed.push(key) },
    window: { location: { replace: (url) => { state.destination = url; }, reload: () => { state.reloaded = true; } } },
    document: { createElement: () => ({ addEventListener: (_, handler) => { state.retry = handler; } }) },
    $: () => ({ set textContent(value) { state.message.text = value; }, append: (element) => { state.button = element; } }),
    console: { error() {} },
  };
  vm.runInNewContext(callback, context);
  await pending;
  return state;
}

for (const role of ["student", "teacher", "admin"]) {
  const result = await restore({ role });
  assert.equal(result.destination, `${role}/index.html`);
  assert.equal(result.signOuts, 0);
}
for (const options of [{ failure: new Error("network unavailable") }, { exists: false, fromCache: true }]) {
  const result = await restore(options);
  assert.equal(result.signOuts, 0, "A temporary profile failure must preserve the saved session");
  assert.equal(result.destination, null);
  assert.equal(result.button.type, "button");
  result.retry();
  assert.equal(result.reloaded, true);
}
for (const options of [{ exists: false }, { role: "unknown" }]) {
  assert.equal((await restore(options)).signOuts, 1, "Confirmed accounts without portal access are still rejected");
}
assert.equal((await restore({ user: null })).reveals, 1);
assert.equal((await restore({ exists: false, user: { uid: "new-google", providerData: [{ providerId: "google.com" }] } })).destination, "complete-profile.html");
console.log("Session restoration: 9 scenarios passed");
