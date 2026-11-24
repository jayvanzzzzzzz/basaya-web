import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { setImmediate as flush } from "node:timers/promises";
const require = createRequire(new URL("../notify-api/package.json", import.meta.url));
const { parseHTML } = require("linkedom");
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`PASS: ${name}`); }
const source = (file) => readFile(new URL(`../teacher/views/${file}`, import.meta.url), "utf8");
const samples = () => [
  { id: "ana", fullName: "Santos, Ana", leaveRequest: { reason: "Transferred section", requestedAt: "2026-11-01T01:00:00Z" } },
  { id: "ben", fullName: "Reyes, Ben", leaveRequest: { reason: "New class", requestedAt: "2026-11-01T02:00:00Z" } },
  { id: "bea", fullName: "Garcia, Bea", leaveRequest: { requestedAt: "2026-11-01T03:00:00Z" } },
];
async function setup() {
  const { window, document } = parseHTML("<!doctype html><html><body><main></main></body></html>");
  const context = vm.createContext({ window, document, console });
  const state = { students: samples(), calls: [], notices: [], updates: [], refreshes: 0, fails: new Set(), modals: 0 };
  const $ = (selector, root = document) => root.querySelector(selector);
  const module = (exports) => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  const snapshot = (student) => ({ id: student?.id, exists: () => Boolean(student), data: () => student, get: (key) => student?.[key] });
  const ref = (_, ...parts) => ({ id: parts.at(-1), path: parts.join("/") });
  const getDoc = async (reference) => snapshot(state.students.find((student) => student.id === reference.id));
  const firestore = module({ collection: ref, doc: ref, deleteField: () => "__DELETE__", serverTimestamp: () => "now", getDoc,
    onSnapshot: (_, callback, error) => { state.emit = () => callback({ docs: state.students.map(snapshot) }); state.subscriptionError = error; state.emit(); return () => { state.stopped = true; }; },
    runTransaction: async (_, callback) => callback({ get: getDoc, update: (reference, fields) => { state.updates.push({ reference, fields }); const student = state.students.find((item) => item.id === reference.id); for (const [key, value] of Object.entries(fields)) value === "__DELETE__" ? delete student[key] : student[key] = value; state.emit(); } }),
  });
  const helpers = module({ $, escapeHtml: (text = "") => String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]), notify: (notice) => state.notices.push(notice),
    openModal: (html, mount, options) => { state.modals++; const element = document.createElement("section"); element.innerHTML = html; document.body.append(element); state.modal = element; state.modalOptions = options; mount(element, () => { element.remove(); state.closed = true; }); },
  });
  const api = module({ removeStudent: async (classId, studentId) => { state.calls.push({ classId, studentId }); if (state.hold) await new Promise((resolve) => { state.release = resolve; }); if (state.fails.has(studentId)) throw new Error("network"); state.students = state.students.filter((student) => student.id !== studentId); if (!state.stopped) state.emit(); } });
  const database = module({ db: {} });
  const ui = new vm.SourceTextModule(await source("leaveRequestsUi.js"), { context }); await ui.link(() => {}); await ui.evaluate();
  const ribbons = new vm.SourceTextModule(await source("requestRibbons.js"), { context }); await ribbons.link(() => {}); await ribbons.evaluate();
  $("main").innerHTML = ribbons.namespace.requestRibbons(3) + `<div id="request-panel-join" role="tabpanel">Join content</div><div id="request-panel-leave" role="tabpanel" hidden>${ui.namespace.leaveRequestsPanel()}</div>`;
  ribbons.namespace.wireRequestRibbons("class-a", document);
  const controller = new vm.SourceTextModule(await source("leaveRequests.js"), { context });
  await controller.link((name) => name.includes("gstatic") ? firestore : name.endsWith("/firebase.js") ? database : name.endsWith("/helpers.js") ? helpers : name.endsWith("/api.js") ? api : ui); await controller.evaluate();
  controller.namespace.wireLeaveRequests({ id: "class-a", className: "Grade 4 — Rizal" }, state.students, async () => { state.refreshes++; });
  const change = (selector, checked) => { $(selector).checked = checked; $(selector).dispatchEvent(new window.Event("change", { bubbles: true })); };
  const click = (selector, root) => $(selector, root).dispatchEvent(new window.Event("click", { bubbles: true }));
  const search = (term) => { $("#leave-request-search").value = term; $("#leave-request-search").dispatchEvent(new window.Event("input", { bubbles: true })); };
  return { state, $, document, window, change, click, search, stop: () => controller.namespace.leaveLeaveRequests() };
}
await check("join and leave requests have separate ribbon tabs", async () => { const h = await setup(); assert.equal(h.$("#request-panel-join").hidden, false); h.click("#request-tab-leave"); assert.equal(h.$("#request-panel-join").hidden, true); assert.equal(h.$("#request-panel-leave").hidden, false); assert.equal(h.$("#request-tab-leave").getAttribute("aria-selected"), "true"); h.stop(); });
await check("ribbons support arrow-key navigation", async () => { const h = await setup(); const event = new h.window.Event("keydown", { bubbles: true }); Object.defineProperty(event, "key", { value: "ArrowRight" }); h.$("#request-tab-join").dispatchEvent(event); assert.equal(h.$("#request-tab-leave").getAttribute("aria-selected"), "true"); h.stop(); });
await check("leave count, student reasons and empty reasons render", async () => { const h = await setup(); assert.equal(h.$("#leave-request-count").textContent, "3"); assert.match(h.$("#leave-review-list").textContent, /Transferred section/); assert.match(h.$("#leave-review-list").textContent, /No reason given/); h.stop(); });
await check("leave selection sets exact count and mixed checkbox state", async () => { const h = await setup(); h.change('[data-leave-check="ana"]', true); assert.equal(h.$("#leave-select-all").indeterminate, true); assert.match(h.$("#leave-approve-selected").textContent, /1/); h.stop(); });
await check("select all shown can be checked and cleared", async () => { const h = await setup(); h.change("#leave-select-all", true); assert.equal(h.document.querySelectorAll("[data-leave-check][checked]").length, 3); h.change("#leave-select-all", false); assert.equal(h.$("#leave-approve-selected").disabled, true); h.stop(); });
await check("search clears hidden selection and selects only matching requests", async () => { const h = await setup(); h.change("#leave-select-all", true); h.search("ana"); assert.equal(h.$("#leave-approve-selected").disabled, true); h.change("#leave-select-all", true); h.click("#leave-approve-selected"); assert.match(h.state.modal.textContent, /Approve 1 leave request/); h.click("[data-leave-confirm]", h.state.modal); await flush(); assert.deepEqual(h.state.calls.map((call) => call.studentId), ["ana"]); h.stop(); });
await check("bulk approval requires explicit confirmation and lists its impact", async () => { const h = await setup(); h.change("#leave-select-all", true); h.click("#leave-approve-selected"); assert.equal(h.state.calls.length, 0); assert.match(h.state.modal.textContent, /archives their progress/); assert.equal(h.state.modal.querySelectorAll(".leave-confirm-names li").length, 3); h.click("[data-leave-cancel]", h.state.modal); assert.equal(h.state.calls.length, 0); assert.equal(h.state.closed, true); h.stop(); });
await check("confirmed bulk approval calls the existing API once per selected student", async () => { const h = await setup(); h.change("#leave-select-all", true); h.click("#leave-approve-selected"); h.click("[data-leave-confirm]", h.state.modal); await flush(); assert.deepEqual(h.state.calls.map((call) => call.studentId), ["ana", "ben", "bea"]); assert.equal(h.state.refreshes, 1); assert.equal(h.$("#request-tab-leave-count").textContent, "0"); h.stop(); });
await check("duplicate confirmations cannot duplicate removals", async () => { const h = await setup(); h.state.hold = true; h.click('[data-approve-leave="ana"]'); h.click("[data-leave-confirm]", h.state.modal); h.click("[data-leave-confirm]", h.state.modal); await flush(); assert.equal(h.state.calls.length, 1); assert.equal(h.$("#leave-request-search").disabled, true); assert.equal(h.state.modalOptions.beforeClose(), false); h.state.release(); await flush(); h.stop(); });
await check("a cancelled request is skipped while confirmation is open", async () => { const h = await setup(); h.click('[data-approve-leave="ana"]'); delete h.state.students[0].leaveRequest; h.state.emit(); h.click("[data-leave-confirm]", h.state.modal); await flush(); assert.equal(h.state.calls.length, 0); assert.ok(h.state.notices.some((notice) => /skipped/.test(notice.title))); h.stop(); });
await check("a replacement request clears stale selection", async () => { const h = await setup(); h.change('[data-leave-check="ana"]', true); h.state.students[0].leaveRequest = { requestedAt: "2026-11-02T01:00:00Z" }; h.state.emit(); assert.equal(h.$("#leave-approve-selected").disabled, true); h.stop(); });
await check("partial failures retain unsuccessful requests and report a retry", async () => { const h = await setup(); h.state.fails.add("ben"); h.change("#leave-select-all", true); h.click("#leave-approve-selected"); h.click("[data-leave-confirm]", h.state.modal); await flush(); assert.equal(h.state.students.length, 1); assert.equal(h.state.students[0].id, "ben"); assert.ok(h.state.notices.some((notice) => notice.tone === "danger")); assert.equal(h.state.refreshes, 1); h.stop(); });
await check("decline keeps membership and sends the optional note", async () => { const h = await setup(); h.click('[data-decline-leave="ana"]'); h.$("textarea", h.state.modal).value = "Please speak with me."; h.$("#decline-leave-form", h.state.modal).dispatchEvent(new h.window.Event("submit", { bubbles: true, cancelable: true })); await flush(); assert.equal(h.state.calls.length, 0); assert.equal(h.state.students.length, 3); assert.equal(h.state.students[0].leaveDeclined.note, "Please speak with me."); assert.equal(h.state.students[0].leaveRequest, undefined); h.stop(); });
await check("declining a cancelled request makes no write", async () => { const h = await setup(); h.click('[data-decline-leave="ana"]'); delete h.state.students[0].leaveRequest; h.state.emit(); h.$("#decline-leave-form", h.state.modal).dispatchEvent(new h.window.Event("submit", { bubbles: true, cancelable: true })); await flush(); assert.equal(h.state.updates.length, 0); assert.match(h.$("[data-leave-decline-error]", h.state.modal).textContent, /already changed/); h.stop(); });
await check("stored student names and leave reasons are escaped", async () => { const h = await setup(); h.state.students[0].fullName = '<img src=x onerror="alert(1)">'; h.state.students[0].leaveRequest.reason = "<script>alert(1)</script>"; h.state.emit(); assert.equal(h.document.querySelectorAll("img,script").length, 0); h.stop(); });
await check("leaving the page unsubscribes and closes confirmation", async () => { const h = await setup(); h.click('[data-approve-leave="ana"]'); h.stop(); assert.equal(h.state.stopped, true); assert.equal(h.state.closed, true); });

async function badge() {
  const { document } = parseHTML('<button id="view-students">Students<span data-student-requests-dot hidden></span></button>');
  const context = vm.createContext({ document });
  const subscriptions = [];
  const module = (exports) => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  const notices = module({ watchStudentNotifications: (classId, onChange) => {
    let active=true,joins=false,leaves=false;
    const paint=()=>{if(active)onChange({joins,hasPending:joins||leaves,hasMessages:false,hasReadings:false,byStudent:new Map([['student',{leave:leaves}]])})};
    const join={ref:{path:`classes/${classId}/joinRequests`},callback:snapshot=>{joins=!snapshot.empty;paint()},stopped:false};
    const leave={ref:{path:`classes/${classId}/students`},callback:snapshot=>{leaves=Boolean(snapshot.docs.length);paint()},stopped:false};
    subscriptions.push(join,leave);paint();return()=>{active=false;join.stopped=leave.stopped=true};
  } });
  const controller = new vm.SourceTextModule(await source("studentRequestsBadge.js"), { context }); await controller.link(() => notices); await controller.evaluate();
  controller.namespace.watchStudentRequestsBadge("a");
  return { document, subscriptions, dot: document.querySelector("[data-student-requests-dot]"), emitJoin: (count) => subscriptions.at(-2).callback({ empty: count === 0 }), emitLeave: (count) => subscriptions.at(-1).callback({ docs: Array.from({ length: count }, () => ({ get: () => ({ reason: "leave" }) })) }), controller: controller.namespace };
}
await check("red dot is hidden with no active request", async () => { const h = await badge(); h.emitJoin(0); h.emitLeave(0); assert.equal(h.dot.hidden, true); h.controller.leaveStudentRequestsBadge(); });
await check("join requests show the red dot without a leave request", async () => { const h = await badge(); h.emitJoin(1); h.emitLeave(0); assert.equal(h.dot.hidden, false); assert.match(h.document.querySelector("button").getAttribute("aria-label"), /pending join/); h.controller.leaveStudentRequestsBadge(); });
await check("leave requests show the red dot without a join request", async () => { const h = await badge(); h.emitJoin(0); h.emitLeave(1); assert.equal(h.dot.hidden, false); h.controller.leaveStudentRequestsBadge(); });
await check("resolving one kind keeps the dot until both are clear", async () => { const h = await badge(); h.emitJoin(1); h.emitLeave(1); h.emitJoin(0); assert.equal(h.dot.hidden, false); h.emitLeave(0); assert.equal(h.dot.hidden, true); h.controller.leaveStudentRequestsBadge(); });
await check("changing classes disposes both old badge listeners", async () => { const h = await badge(); h.controller.watchStudentRequestsBadge("b"); assert.ok(h.subscriptions.slice(0, 2).every((sub) => sub.stopped)); assert.ok(h.subscriptions.slice(2).every((sub) => sub.ref.path.startsWith("classes/b/"))); h.controller.leaveStudentRequestsBadge(); });
await check("disposed badge listeners cannot change the button", async () => { const h = await badge(); h.controller.leaveStudentRequestsBadge(); h.emitJoin(1); assert.equal(h.dot.hidden, true); assert.ok(h.subscriptions.every((sub) => sub.stopped)); });
console.log(`Leave requests and request indicator: ${checks} interaction checks passed.`);
