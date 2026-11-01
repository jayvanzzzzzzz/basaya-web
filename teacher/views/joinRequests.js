import { collection, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { $, notify } from "../../js/helpers.js";
import { reviewJoinRequests } from "../../js/api.js";
import { joinRequestRows } from "./joinRequestsUi.js";

let leave;
export function leaveJoinRequests() { leave?.(); leave = null; }
export function watchJoinRequests(classId, onEnrolled) {
  leaveJoinRequests();
  const list = $("#join-review-list");
  const search = $("#join-request-search");
  const all = $("#join-select-all");
  const bulk = $("#join-approve-selected");
  const error = $("#join-review-error");
  let active = true;
  let requests = [];
  const selected = new Set();
  const progressModes = new Map();
  let busy = false;
  const visible = () => requests.filter((item) => item.fullName.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
  const controls = () => {
    const shown = visible();
    const count = shown.filter((item) => selected.has(item.requestId)).length;
    all.checked = shown.length > 0 && count === shown.length;
    all.indeterminate = count > 0 && count < shown.length;
    all.disabled = busy || !shown.length;
    bulk.disabled = busy || count === 0;
    bulk.innerHTML = busy ? "Processing…" : `Approve selected <span>${count}</span>`;
    search.disabled = busy;
    $("#join-selection-status").textContent = count ? `${count} ${count === 1 ? "request" : "requests"} selected` : "No requests selected";
    list.querySelectorAll("input, button, select").forEach((element) => { element.disabled = busy; });
  };
  const draw = () => {
    const shown = visible();
    const valid = new Set(shown.map((item) => item.requestId));
    for (const id of selected) if (!valid.has(id)) selected.delete(id);
    list.innerHTML = joinRequestRows(shown, selected, progressModes);
    list.setAttribute("aria-busy", String(busy));
    $("#join-request-count").textContent = requests.length;
    $("#join-summary-count").textContent = requests.length;
    const ribbon = $("#request-tab-join-count");
    if (ribbon) ribbon.textContent = requests.length;
    controls();
  };
  search.addEventListener("input", () => { selected.clear(); draw(); });
  all.addEventListener("change", () => { for (const item of visible()) all.checked ? selected.add(item.requestId) : selected.delete(item.requestId); draw(); });
  list.addEventListener("change", (event) => {
    const mode = event.target.closest("[data-join-progress]");
    if (mode) {
      if (busy) return;
      const request = requests.find((item) => item.requestId === mode.dataset.joinProgress);
      if (request?.hasPreviousProgress === true) progressModes.set(request.requestId, mode.value === "fresh" ? "fresh" : "restore");
      draw();
      list.querySelectorAll("[data-join-progress]").forEach((element) => { if (element.dataset.joinProgress === request?.requestId) element.focus(); });
      return;
    }
    const input = event.target.closest("[data-join-check]");
    if (!input || busy) return;
    input.checked ? selected.add(input.dataset.joinCheck) : selected.delete(input.dataset.joinCheck);
    input.closest(".join-request").classList.toggle("is-selected", input.checked);
    controls();
  });
  async function review(items, action) {
    if (busy || !items.length) return;
    busy = true;
    error.hidden = true;
    controls();
    let decided = 0;
    let changed = 0;
    try {
      for (let start = 0; start < items.length; start += 50) {
        const response = await reviewJoinRequests(classId, items.slice(start, start + 50).map(({ studentId, requestId, hasPreviousProgress }) => ({ studentId, requestId,
          ...(action === "approve" && hasPreviousProgress === true ? { progressMode: progressModes.get(requestId) || "restore" } : {}),
        })), action);
        for (const result of response.results) {
          if (result.status === (action === "approve" ? "approved" : "declined")) decided++;
          else changed++;
        }
      }
      if (!active) return;
      notify({ title: action === "approve" ? `${decided} ${decided === 1 ? "student" : "students"} approved` : "Request declined", message: action === "approve" ? "Approved students can now open the class lessons and chat." : "The student can submit a new request using a valid class code." });
      if (changed) notify({ title: "Some requests had already changed", message: `${changed} skipped. The list has been updated.`, tone: "info" });
      selected.clear();
      if (action === "approve" && decided) await onEnrolled();
    } catch (failure) {
      if (active) {
        // Earlier transactions may have committed before a network failure.
        notify({ title: "Review interrupted", message: failure.message, tone: "danger" });
        await onEnrolled();
      }
    } finally { busy = false; if (active) draw(); }
  }
  bulk.addEventListener("click", () => review(visible().filter((item) => selected.has(item.requestId)), "approve"));
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-join-approve], [data-join-decline]");
    if (!button) return;
    const id = button.dataset.joinApprove || button.dataset.joinDecline;
    const item = requests.find((request) => request.requestId === id);
    if (item) review([item], button.hasAttribute("data-join-approve") ? "approve" : "decline");
  });
  const unsubscribe = onSnapshot(query(collection(db, "classes", classId, "joinRequests"), where("status", "==", "pending")), (snapshot) => {
    requests = snapshot.docs.map((doc) => ({ studentId: doc.id, ...doc.data() })).sort((a, b) => (a.requestedAt?.toMillis?.() || 0) - (b.requestedAt?.toMillis?.() || 0));
    const eligible = new Set(requests.filter((item) => item.hasPreviousProgress === true).map((item) => item.requestId));
    for (const id of progressModes.keys()) if (!eligible.has(id)) progressModes.delete(id);
    draw();
  }, () => { list.setAttribute("aria-busy", "false"); list.innerHTML = '<p class="join-review__empty">Requests are temporarily unavailable.</p>'; error.textContent = "Join requests could not be loaded. Check your connection and refresh this page."; error.hidden = false; });
  leave = () => { active = false; unsubscribe(); };
}
