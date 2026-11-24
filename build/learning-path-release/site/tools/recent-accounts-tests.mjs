import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const storeSource = (await readFile(new URL("js/recent-accounts.js", root), "utf8")).replaceAll("export function ", "function ");
const loginSource = (await readFile(new URL("js/login.js", root), "utf8")).replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, "");
const key = "basaya.recentAccounts.v1";
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
const storage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
};
const local = storage();
const persistence = vm.createContext({ localStorage: local });
vm.runInContext(storeSource + "\nglobalThis.api = { recentAccounts, rememberAccount, removeAccount };", persistence);
const api = persistence.api;
const user = (uid, provider = "password") => ({ uid, email: `${uid}@example.test`, displayName: `User ${uid}`,
  photoURL: "https://example.test/avatar.png", providerData: [{ providerId: provider }], password: "never-save-this", accessToken: "secret-token" });

check(api.recentAccounts().length, 0, "New device has no account hints");
api.rememberAccount(user("one"), { firstName: "Ana", lastName: "Santos" });
check(api.recentAccounts()[0].name, "Ana Santos");
check(local.getItem(key).includes("never-save-this") || local.getItem(key).includes("secret-token"), false, "Credentials never enter profile storage");
for (const uid of ["two", "three", "four", "five", "six"]) api.rememberAccount(user(uid));
check(api.recentAccounts().length, 5, "Only five profiles retained");
check(api.recentAccounts().some((account) => account.uid === "one"), false, "Oldest profile evicted");
api.rememberAccount(user("three", "google.com"));
check(api.recentAccounts()[0].uid, "three", "Returning account moves to front");
check(api.recentAccounts().filter((account) => account.uid === "three").length, 1, "No duplicate profile");
check(api.recentAccounts()[0].provider, "google.com");
api.removeAccount("three");
check(api.recentAccounts().some((account) => account.uid === "three"), false);
local.setItem(key, '{broken');
check(api.recentAccounts().length, 0, "Malformed storage falls back to ordinary login");
local.setItem(key, JSON.stringify([null, { uid: "x" }, { uid: "valid", email: "v@example.test", photoURL: "javascript:alert(1)", password: "secret" }]));
check(api.recentAccounts().length, 1);
check(api.recentAccounts()[0].photoURL, "", "Unsafe photo URL discarded");
vm.runInContext("localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };", persistence);
check(api.recentAccounts().length, 0);
check(api.rememberAccount(user("blocked")), false, "Unavailable storage never blocks login");

// Run the actual login module with Firebase stubbed. Account hints have no authentication powers.
class Element {
  constructor() { this.hidden = false; this.disabled = false; this.value = ""; this.textContent = ""; this.type = "password"; this.children = []; this.events = {}; this.nodes = {}; this.attrs = {}; this.classList = { toggle() {}, add() {}, remove() {} }; }
  querySelector(selector) { return this.nodes[selector] ||= new Element(); }
  querySelectorAll() { return []; }
  setAttribute(key, value) { this.attrs[key] = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, handler) { (this.events[name] ||= []).push(handler); }
  async fire(name, event = {}) { for (const handler of this.events[name] || []) await handler({ preventDefault() {}, ...event }); }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
}
function page(savedUsers = []) {
  const elements = new Map();
  const get = (selector) => { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); };
  const localStorage = storage();
  const sessionStorage = storage();
  const winEvents = {};
  const state = { signIns: [], google: [], signOuts: 0, destination: null, failPassword: false, failGoogle: false };
  class Provider { setCustomParameters(parameters) { this.parameters = parameters; } }
  const context = vm.createContext({
    localStorage, sessionStorage, console, GoogleAuthProvider: Provider,
    auth: {}, db: {}, $: get, clearFieldErrors() {}, fieldError(element, text) { element.error = text; },
    document: { getElementById: (id) => get(`#${id}`), querySelector: () => null, createElement: () => new Element(), addEventListener() {} },
    window: { matchMedia: () => ({ matches: false }), addEventListener: (name, handler) => { winEvents[name] = handler; },
      location: { replace: (url) => { state.destination = url; } } },
    signInWithEmailAndPassword: async (_, email, password) => { state.signIns.push({ email, password }); if (state.failPassword) throw { code: "auth/invalid-credential" }; },
    signInWithPopup: async (_, provider) => { state.google.push(provider.parameters); if (state.failGoogle) throw { code: "auth/popup-closed-by-user" }; },
    signOut: async () => { state.signOuts++; },
    onAuthStateChanged: (_, callback) => { state.authChanged = callback; },
    doc() {}, getDoc: async () => ({ exists: () => true, data: () => ({ role: "student", firstName: "Ana" }), metadata: { fromCache: false } }),
  });
  vm.runInContext(storeSource + "\nglobalThis.store = { rememberAccount, recentAccounts };", context);
  savedUsers.forEach((entry) => context.store.rememberAccount(entry));
  vm.runInContext(loginSource, context);
  return { get, state, context, localStorage, sessionStorage, winEvents };
}
let view = page();
await view.state.authChanged(null);
check(view.get("#recent-accounts").hidden, true);
check(view.get("#login-form").hidden, false, "First-time users retain standard login");

view = page([user("ana"), user("ben", "google.com")]);
view.sessionStorage.setItem("basayaSignedOut", "true");
await view.state.authChanged(null);
check(view.get("#recent-account-list").children.length, 2);
check(view.get("#recent-accounts").hidden, false);
check(view.get("#login-form").hidden, true);
check(view.state.signIns.length + view.state.google.length, 0, "Rendering saved accounts does not authenticate");
const row = view.get("#recent-account-list").children[1];
await row.children[0].fire("click");
check(view.get("#email").value, "ana@example.test");
check(view.get("#login-email-field").hidden, true);
check(view.get("#password").value, "");
check(view.state.signIns.length, 0, "Selecting an email profile requires a password");
view.winEvents.pageshow();
check(view.get("#email").value, "ana@example.test", "Logout cleanup preserves the selected email");
view.get("#password").value = "wrong";
view.get("#email").value = "autofill-other@example.test";
view.state.failPassword = true;
await view.get("#login-form").fire("submit");
check(view.state.signIns[0].email, "ana@example.test", "Autofill cannot change the account selected for sign-in");
check(view.get("#login-error").textContent, "Incorrect email or password.");
check(view.state.destination, null, "Wrong password cannot access a portal");
check(view.get("#password").disabled, false, "Can retry after authentication failure");
await view.get("#back-to-accounts").fire("click");
await view.get("#recent-account-list").children[0].children[0].fire("click");
check(view.get("#password").value, "", "Switching profiles clears the previous password");
check(view.get("#login-password-field").hidden, true);
check(view.get("#google-login").hidden, false);
check(view.get("#password").required, false);
view.state.failGoogle = true;
await view.get("#google-login").fire("click");
check(view.state.google[0].login_hint, "ben@example.test", "Google selection uses the provider flow");
check(view.get("#google-login").disabled, false, "Google cancellation allows retry");
await view.get("#back-to-accounts").fire("click");
await view.get("#another-account").fire("click");
check(view.get("#email").value, "");
check(view.get("#login-email-field").hidden, false);
check(view.get("#password").required, true);
await view.get("#back-to-accounts").fire("click");
await view.get("#recent-account-list").children[0].children[1].fire("click");
check(view.get("#recent-account-list").children.length, 1);
await view.get("#recent-account-list").children[0].children[1].fire("click");
check(view.get("#recent-accounts").hidden, true);
check(view.get("#login-form").hidden, false, "Removing the last profile restores standard login");
check(view.state.signOuts, 0, "Removing a display hint does not delete or authenticate accounts");
await view.state.authChanged(user("new"));
check(view.state.destination, "student/index.html", "Authenticated users still pass the normal role check");
check(view.context.store.recentAccounts()[0].uid, "new", "Successful authentication remembers the account");
console.log(`Remembered accounts: ${checks} storage and login-flow checks passed`);
