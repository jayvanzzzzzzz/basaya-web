import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import { setImmediate as flush } from "node:timers/promises";
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { parseHTML } = require("linkedom");
let checks = 0;
async function check(label, run) { await run(); checks++; console.log(`PASS: ${label}`); }
const sample = [
  { studentId: "ana", requestId: "request-ana", fullName: "Santos, Ana", requestedAt: "2026-11-01T01:00:00Z" },
  { studentId: "ben", requestId: "request-ben", fullName: "Reyes, Ben", requestedAt: "2026-11-01T02:00:00Z" },
  { studentId: "bea", requestId: "request-bea", fullName: "Garcia, Bea", requestedAt: "2026-11-01T03:00:00Z" },
];
async function setup(requests = sample) {
  const { window, document } = parseHTML("<!doctype html><html><body><main></main></body></html>");
  const context = vm.createContext({ document, window, console });
  const state = { requests: requests.map((item) => ({ ...item })), calls: [], notices: [], enrolled: 0, error: null };
  function module(exports) { return new vm.SyntheticModule(Object.keys(exports), function () { for (const [name, value] of Object.entries(exports)) this.setExport(name, value); }, { context }); }
  const firestore = module({ collection: () => ({}), query: () => ({}), where: () => ({}), onSnapshot: (_, callback, error) => { state.emit = () => callback({ docs: state.requests.map((item) => ({ id: item.studentId, data: () => item })) }); state.subscriptionError = error; state.emit(); return () => { state.stopped = true; }; } });
  const helpers = module({ $: (selector) => document.querySelector(selector), notify: (notice) => state.notices.push(notice) });
  const api = module({ reviewJoinRequests: async (classId, requests, action) => {
    state.calls.push({ classId, requests, action });
    if (state.hold) await new Promise((resolve) => { state.release = resolve; });
    if (state.error) throw state.error;
    const ids = new Set(requests.map((item) => item.requestId));
    state.requests = state.requests.filter((item) => !ids.has(item.requestId));
    if (!state.stopped) state.emit();
    return { results: requests.map((item) => ({ studentId: item.studentId, status: action === "approve" ? "approved" : "declined" })) };
  } });
  const db = module({ db: {} });
  const ui = new vm.SourceTextModule(await readFile(new URL("../teacher/views/joinRequestsUi.js", import.meta.url), "utf8"), { context });
  await ui.link(() => {}); await ui.evaluate();
  document.querySelector("main").innerHTML = ui.namespace.joinRequestsPanel({ className: "Grade 4 — Rizal", classCode: "ABC123" }, 24);
  const controller = new vm.SourceTextModule(await readFile(new URL("../teacher/views/joinRequests.js", import.meta.url), "utf8"), { context });
  await controller.link((specifier) => specifier.includes("gstatic.com") ? firestore : specifier.endsWith("/firebase.js") ? db : specifier.endsWith("/helpers.js") ? helpers : specifier.endsWith("/api.js") ? api : ui);
  await controller.evaluate();
  controller.namespace.watchJoinRequests("class-a", async () => { state.enrolled++; });
  const $ = (selector) => document.querySelector(selector);
  const change = (selector, checked) => { const target = $(selector); target.checked = checked; target.dispatchEvent(new window.Event("change", { bubbles: true })); };
  const click = (selector) => $(selector).dispatchEvent(new window.Event("click", { bubbles: true }));
  const search = (term) => { $("#join-request-search").value = term; $("#join-request-search").dispatchEvent(new window.Event("input", { bubbles: true })); };
  const choose = (requestId, value) => {
    const select = $(`[data-join-progress="${requestId}"]`);
    for (const option of select.querySelectorAll("option")) option.selected = option.value === value;
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  };
  return { state, document, $, change, click, search, choose, stop: () => controller.namespace.leaveJoinRequests() };
}
await check("live list renders requests, dates and counts", async () => { const ui = await setup(); assert.equal(ui.document.querySelectorAll(".join-request").length, 3); assert.equal(ui.$("#join-summary-count").textContent, "3"); assert.equal(ui.$("#join-review-list").getAttribute("aria-busy"), "false"); ui.stop(); });
await check("bulk approval starts disabled", async () => { const ui = await setup(); assert.equal(ui.$("#join-approve-selected").disabled, true); ui.stop(); });
await check("individual selection updates count and mixed select-all state", async () => { const ui = await setup(); ui.change('[data-join-check="request-ana"]', true); assert.equal(ui.$("#join-select-all").indeterminate, true); assert.match(ui.$("#join-approve-selected").textContent, /1/); assert.equal(ui.$("#join-approve-selected").disabled, false); ui.stop(); });
await check("select all checks shown requests and can clear them", async () => { const ui = await setup(); ui.change("#join-select-all", true); assert.equal(ui.document.querySelectorAll("[data-join-check][checked]").length, 3); assert.equal(ui.$("#join-select-all").indeterminate, false); ui.change("#join-select-all", false); assert.equal(ui.$("#join-approve-selected").disabled, true); ui.stop(); });
await check("filtering clears previous selection and select-all covers only matches", async () => { const ui = await setup(); ui.change("#join-select-all", true); ui.search("ana"); assert.equal(ui.document.querySelectorAll(".join-request").length, 1); assert.equal(ui.$("#join-approve-selected").disabled, true); ui.change("#join-select-all", true); ui.click("#join-approve-selected"); await flush(); assert.deepEqual(Array.from(ui.state.calls[0].requests, (item) => item.studentId), ["ana"]); assert.equal(ui.state.enrolled, 1); ui.stop(); });
await check("only selected students are sent for bulk approval", async () => { const ui = await setup(); ui.change('[data-join-check="request-ana"]', true); ui.change('[data-join-check="request-bea"]', true); ui.click("#join-approve-selected"); await flush(); assert.deepEqual(Array.from(ui.state.calls[0].requests, (item) => item.studentId), ["ana", "bea"]); assert.equal(ui.state.calls[0].action, "approve"); assert.equal(ui.document.querySelectorAll(".join-request").length, 1); ui.stop(); });
await check("individual approve and decline use their own request ids", async () => { const ui = await setup(); ui.click('[data-join-decline="request-ben"]'); await flush(); assert.equal(ui.state.calls[0].action, "decline"); assert.equal(ui.state.calls[0].requests[0].requestId, "request-ben"); assert.equal(ui.state.enrolled, 0); ui.click('[data-join-approve="request-ana"]'); await flush(); assert.equal(ui.state.calls[1].action, "approve"); assert.equal(ui.state.enrolled, 1); ui.stop(); });
await check("in-flight approval disables controls and ignores duplicate clicks", async () => { const ui = await setup(); ui.state.hold = true; ui.change("#join-select-all", true); ui.click("#join-approve-selected"); ui.click("#join-approve-selected"); assert.equal(ui.state.calls.length, 1); assert.equal(ui.$("#join-request-search").disabled, true); assert.equal(ui.$("#join-select-all").disabled, true); assert.equal(ui.document.querySelectorAll(".join-request button:not([disabled])").length, 0); ui.state.release(); await flush(); ui.stop(); });
await check("large selection is sent in batches of at most 50", async () => { const ui = await setup(); ui.state.requests = Array.from({ length: 101 }, (_, i) => ({ studentId: `s-${i}`, requestId: `r-${i}`, fullName: `Student ${i}` })); ui.state.emit(); ui.change("#join-select-all", true); ui.click("#join-approve-selected"); await flush(); await flush(); assert.deepEqual(ui.state.calls.map((call) => call.requests.length), [50, 50, 1]); assert.equal(ui.state.enrolled, 1); ui.stop(); });
await check("live removal clears stale selected requests", async () => { const ui = await setup(); ui.change("#join-select-all", true); ui.state.requests = []; ui.state.emit(); assert.equal(ui.$("#join-approve-selected").disabled, true); assert.equal(ui.$("#join-select-all").checked, false); assert.equal(ui.$("#join-summary-count").textContent, "0"); ui.stop(); });
await check("network failure reports the problem and refreshes roster after possible partial success", async () => { const ui = await setup(); ui.state.error = new Error("Connection interrupted"); ui.change("#join-select-all", true); ui.click("#join-approve-selected"); await flush(); assert.equal(ui.state.notices[0].tone, "danger"); assert.match(ui.state.notices[0].message, /Connection/); assert.equal(ui.state.enrolled, 1); assert.equal(ui.$("#join-select-all").disabled, false); ui.stop(); });
await check("unsubscribing stops updates when leaving Students page", async () => { const ui = await setup(); ui.stop(); assert.equal(ui.state.stopped, true); });
await check("stored names are escaped rather than interpreted as HTML", async () => { const ui = await setup(); ui.state.requests = [{ studentId: "xss", requestId: "xss", fullName: '<img src=x onerror="alert(1)">' }]; ui.state.emit(); assert.equal(ui.document.querySelectorAll("img").length, 0); assert.match(ui.$(".join-request__identity").textContent, /<img/); ui.stop(); });
await check("subscription errors clear loading and display a readable message", async () => { const ui = await setup(); ui.state.subscriptionError(new Error("offline")); assert.equal(ui.$("#join-review-list").getAttribute("aria-busy"), "false"); assert.equal(ui.$("#join-review-error").hidden, false); ui.stop(); });

const returning = [{ ...sample[0], hasPreviousProgress: true }, sample[1], { ...sample[2], hasPreviousProgress: true }];
await check("new students have normal approval without any restore option", async () => { const ui = await setup(); assert.equal(ui.document.querySelectorAll("[data-join-progress]").length, 0); assert.doesNotMatch(ui.$("#join-review-list").textContent, /Restore previous progress/); ui.stop(); });
await check("only returning students with archived work see restore selected by default", async () => { const ui = await setup(returning); assert.equal(ui.document.querySelectorAll("[data-join-progress]").length, 2); assert.equal(ui.$('[data-join-progress="request-ana"]').value, "restore"); assert.match(ui.$("#join-review-list").textContent, /Completed assessments stay completed/); ui.stop(); });
await check("individual returning approval sends explicit restore default", async () => { const ui = await setup(returning); ui.click('[data-join-approve="request-ana"]'); await flush(); assert.equal(ui.state.calls[0].requests[0].progressMode, "restore"); ui.stop(); });
await check("explicit start fresh survives redraw and explains archived history", async () => { const ui = await setup(returning); ui.choose("request-ana", "fresh"); ui.change('[data-join-check="request-ana"]', true); assert.equal(ui.$('[data-join-progress="request-ana"]').value, "fresh"); assert.match(ui.$("#join-review-list").textContent, /Previous results stay archived/); ui.click('[data-join-approve="request-ana"]'); await flush(); assert.equal(ui.state.calls[0].requests[0].progressMode, "fresh"); ui.stop(); });
await check("mixed bulk approval keeps per-student choices and omits mode for newcomers", async () => { const ui = await setup(returning); ui.choose("request-ana", "fresh"); ui.change("#join-select-all", true); ui.click("#join-approve-selected"); await flush(); assert.deepEqual(Array.from(ui.state.calls[0].requests, item => item.progressMode), ["fresh", undefined, "restore"]); ui.stop(); });
await check("fresh choice does not carry to a replacement request", async () => { const ui = await setup(returning); ui.choose("request-ana", "fresh"); ui.state.requests[0] = { ...returning[0], requestId: "replacement" }; ui.state.emit(); assert.equal(ui.$('[data-join-progress="replacement"]').value, "restore"); ui.stop(); });
await check("declining a returning student sends no progress reset instruction", async () => { const ui = await setup(returning); ui.choose("request-ana", "fresh"); ui.click('[data-join-decline="request-ana"]'); await flush(); assert.equal(ui.state.calls[0].action, "decline"); assert.equal(ui.state.calls[0].requests[0].progressMode, undefined); ui.stop(); });
await check("progress choices are disabled while approval is in flight", async () => { const ui = await setup(returning); ui.state.hold = true; ui.click('[data-join-approve="request-ana"]'); assert.equal(ui.$('[data-join-progress="request-ana"]').disabled, true); ui.state.release(); await flush(); ui.stop(); });

// Verify routing keeps existing removal URLs working and stays within the current plan.
const config = JSON.parse(await readFile(new URL("../notify-api/vercel.json", import.meta.url), "utf8"));
const { default: router } = await import("../notify-api/api/class-membership.js");
for (const source of ["/api/join-class", "/api/review-join-requests", "/api/remove-student"]) {
  await check(`${source} rewrite dispatches to a protected handler`, async () => {
    const rewrite = config.rewrites.find((item) => item.source === source); assert.ok(rewrite);
    const query = Object.fromEntries(new URL(rewrite.destination, "https://test.invalid").searchParams);
    const response = { status(value) { this.code = value; return this; }, json(body) { this.body = body; return this; }, setHeader() {}, end() { return this; } };
    await router({ query, method: "POST", headers: {} }, response); assert.equal(response.code, 401);
  });
}
await check("Vercel API function count remains twelve", async () => { assert.equal((await readdir(new URL("../notify-api/api/", import.meta.url))).filter((file) => file.endsWith(".js")).length, 12); });
console.log(`Join requests UI: ${checks} DOM, selection, and routing checks passed.`);
