import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { setImmediate as flush } from "node:timers/promises";
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { parseHTML } = require("linkedom");
const code = await readFile(new URL("../student/views/join.js", import.meta.url), "utf8");
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS: ${name}`); }
async function setup(className = "Grade 8 - Aguinaldo") {
  const { window, document } = parseHTML('<main id="page-content"></main>');
  const context = vm.createContext({ window, document, console });
  const student = { email: "test@example.invalid", profile: { joinRequest: { status: "pending", className } } };
  const state = { reads: 0, joins: 0, leaves: [], navigations: [] };
  const $ = (selector) => document.querySelector(selector);
  const module = (exports) => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  const api = module({ requestClassJoin: async () => { state.joins++; } });
  const helpers = module({ $, escapeHtml: (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]), navigate: (route) => state.navigations.push(route) });
  const data = module({ student, classId: () => student.profile.classId || "", fullName: () => "Test Student", loadProfile: async () => { state.reads++; if (state.hold) await new Promise((resolve) => { state.release = resolve; }); if (state.error) throw state.error; if (state.nextProfile) student.profile = state.nextProfile; return student.profile; } });
  const ui = module({ buddy: () => "", icon: (name) => `<svg data-icon="${name}" aria-hidden="true"></svg>`, content: () => $("#page-content"), setBuddyMood: () => {}, shake: () => {} });
  const router = module({ onLeave: (callback) => state.leaves.push(callback) });
  const fields = module({ fieldError: () => {} });
  const controller = new vm.SourceTextModule(code, { context });
  await controller.link((name) => name.endsWith("/api.js") ? api : name.endsWith("/helpers.js") ? helpers : name.endsWith("/data.js") ? data : name.endsWith("/ui.js") ? ui : name.endsWith("/router.js") ? router : fields); await controller.evaluate();
  await controller.namespace.renderJoin();
  const refresh = () => $("#join-refresh").dispatchEvent(new window.Event("click", { bubbles: true }));
  return { state, student, document, $, refresh };
}
await check("professional pending heading and class status are present", async () => { const h = await setup(); assert.equal(h.$("h1").textContent, "Naghihintay ng pag-apruba"); assert.equal(h.$("h2").textContent, "Grade 8 - Aguinaldo"); assert.match(h.$(".st-join-pending__badge").textContent, /Nakabinbin/); });
await check("main action uses the requested label and home route", async () => { const h = await setup(); assert.equal(h.$(".st-join-pending__home").textContent.trim(), "Bumalik sa home screen"); assert.equal(h.$(".st-join-pending__home").getAttribute("href"), "#/home"); });
await check("refresh is icon-only with accessible name and tooltip", async () => { const h = await setup(); const button = h.$("#join-refresh"); assert.equal(button.textContent.trim(), ""); assert.equal(button.querySelectorAll("svg").length, 1); assert.equal(button.getAttribute("aria-label"), "I-refresh ang katayuan"); assert.equal(button.getAttribute("title"), "I-refresh ang katayuan"); });
await check("refresh checks status without creating another request", async () => { const h = await setup(); h.refresh(); await flush(); assert.equal(h.state.reads, 1); assert.equal(h.state.joins, 0); assert.match(h.$("#join-pending-status").textContent, /Nakabinbin pa/); });
await check("duplicate refresh clicks are blocked while checking", async () => { const h = await setup(); h.state.hold = true; h.refresh(); h.refresh(); assert.equal(h.state.reads, 1); assert.equal(h.$("#join-refresh").disabled, true); assert.equal(h.$("#join-refresh").getAttribute("aria-busy"), "true"); h.state.release(); await flush(); });
await check("failed refresh restores the icon button and reports the connection issue", async () => { const h = await setup(); h.state.error = new Error("offline"); h.refresh(); await flush(); assert.equal(h.$("#join-refresh").disabled, false); assert.equal(h.$("#join-refresh").hasAttribute("aria-busy"), false); assert.match(h.$("#join-pending-status").textContent, /Hindi ma-refresh/); });
await check("a response arriving after leaving cannot replace the new screen", async () => { const h = await setup(); h.state.hold = true; h.refresh(); h.state.leaves.forEach((leave) => leave()); h.$("#page-content").innerHTML = "Home screen"; h.state.release(); await flush(); assert.equal(h.$("#page-content").textContent, "Home screen"); });
await check("approval discovered by refresh returns to home", async () => { const h = await setup(); h.state.nextProfile = { classId: "approved-class" }; h.refresh(); await flush(); assert.deepEqual(h.state.navigations, ["/home"]); assert.equal(h.state.joins, 0); });
await check("stored class names cannot inject markup", async () => { const h = await setup('<img src=x onerror="alert(1)">'); assert.equal(h.document.querySelectorAll("img").length, 0); assert.match(h.$("h2").textContent, /<img/); });
console.log(`Pending join screen: ${checks} interaction checks passed.`);
