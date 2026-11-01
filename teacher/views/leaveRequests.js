import { collection, deleteField, doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { $, escapeHtml, openModal, notify } from "../../js/helpers.js";
import { removeStudent } from "../../js/api.js";
import { pendingLeaves, leaveRequestKey, leaveRequestRows } from "./leaveRequestsUi.js";
export { leaveRequestsPanel, pendingLeaves } from "./leaveRequestsUi.js";

export const leaveChip = (student) => student.leaveRequest ? '<span class="deletion-chip deletion-chip--pending">Wants to leave</span>' : "";
let leave;
export function leaveLeaveRequests() { leave?.(); leave = null; }

export function wireLeaveRequests(classroom, initialStudents, onChange) {
  leaveLeaveRequests();
  const list = $("#leave-review-list");
  const search = $("#leave-request-search");
  const all = $("#leave-select-all");
  const bulk = $("#leave-approve-selected");
  const error = $("#leave-review-error");
  let students = initialStudents;
  let active = true;
  let busy = false;
  let confirming = false;
  let closeModal;
  const selected = new Map();
  const visible = () => pendingLeaves(students).filter((student) => (student.fullName || "Student").toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
  function controls() {
    const shown = visible();
    const count = shown.filter((student) => selected.get(student.id) === leaveRequestKey(student)).length;
    all.checked = shown.length > 0 && count === shown.length;
    all.indeterminate = count > 0 && count < shown.length;
    all.disabled = busy || !shown.length;
    bulk.disabled = busy || count === 0;
    bulk.innerHTML = busy ? "Processing…" : `Approve selected <span>${count}</span>`;
    search.disabled = busy;
    $("#leave-selection-status").textContent = count ? `${count} ${count === 1 ? "request" : "requests"} selected` : "No requests selected";
    list.querySelectorAll("button, input").forEach((element) => { element.disabled = busy; });
  }
  function draw() {
    const shown = visible();
    const valid = new Map(shown.map((student) => [student.id, leaveRequestKey(student)]));
    for (const [id, key] of selected) if (valid.get(id) !== key) selected.delete(id);
    list.innerHTML = leaveRequestRows(shown, selected, Boolean(search.value.trim()));
    list.setAttribute("aria-busy", String(busy));
    const count = pendingLeaves(students).length;
    $("#leave-request-count").textContent = count;
    const ribbon = $("#request-tab-leave-count");
    if (ribbon) ribbon.textContent = count;
    controls();
  }
  const rosterRef = (id) => doc(db, "classes", classroom.id, "students", id);
  const sameRequest = (snapshot, student) => snapshot.exists() && snapshot.get("leaveRequest") && leaveRequestKey({ id: student.id, ...snapshot.data() }) === leaveRequestKey(student);
  function openApprove(items) {
    if (!active || busy || confirming || !items.length) return;
    confirming = true;
    const chosen = items.map((student) => ({ ...student }));
    const count = chosen.length;
    openModal(`<div class="deletion-modal"><h2>Approve ${count} leave ${count === 1 ? "request" : "requests"}?</h2><p>These students will be removed from <strong>${escapeHtml(classroom.className || "this class")}</strong>.</p><ul class="leave-confirm-names">${chosen.map((student) => `<li>${escapeHtml(student.fullName || "Student")}</li>`).join("")}</ul><div class="deletion-modal__impact"><strong>Approval archives their progress and scores for this class.</strong><p>Their accounts stay. Rejoining requires teacher approval, with saved progress restored by default. A teacher can choose a fresh record while keeping previous results archived.</p></div><p class="muted">Requests that have been cancelled or changed will be skipped.</p><div class="modal-actions"><button type="button" class="button secondary" data-leave-cancel>Keep students</button><button type="button" class="button danger" data-leave-confirm>Approve &amp; remove ${count}</button></div></div>`, (modal, close) => {
      closeModal = () => { confirming = false; close(); };
      const cancel = $("[data-leave-cancel]", modal);
      const confirm = $("[data-leave-confirm]", modal);
      cancel.addEventListener("click", closeModal);
      confirm.addEventListener("click", async () => {
        if (busy || !active) return;
        busy = true;
        cancel.disabled = confirm.disabled = true;
        controls();
        let removed = 0;
        let skipped = 0;
        const failed = [];
        try {
          for (const [index, student] of chosen.entries()) {
            if (!active) break;
            confirm.textContent = `Processing ${index + 1} of ${count}…`;
            try {
              // Re-read before calling the existing removal endpoint: no cancelled request is intentionally approved.
              const current = await getDoc(rosterRef(student.id));
              if (!sameRequest(current, student)) { skipped++; continue; }
              await removeStudent(classroom.id, student.id);
              removed++;
              selected.delete(student.id);
            } catch { failed.push(student.fullName || "Student"); }
          }
          closeModal?.();
          if (removed) notify({ title: `${removed} ${removed === 1 ? "student" : "students"} left the class`, message: "Their class membership and progress have been removed." });
          if (skipped) notify({ title: `${skipped} changed ${skipped === 1 ? "request" : "requests"} skipped`, message: "These students were kept in the class.", tone: "info" });
          if (failed.length) notify({ title: `${failed.length} ${failed.length === 1 ? "request needs" : "requests need"} another try`, message: "Some requests could not be processed. Review the refreshed list before trying again.", tone: "danger" });
          if (active) await onChange();
        } finally { busy = false; if (active) draw(); }
      });
    }, { closeOnBackdrop: false, beforeClose: () => { if (busy) return false; confirming = false; return true; } });
  }
  function openDecline(student) {
    if (!active || busy || confirming) return;
    confirming = true;
    openModal(`<div class="deletion-modal"><h2>Decline ${escapeHtml(student.fullName || "this student")}’s request?</h2><p>They will stay in ${escapeHtml(classroom.className || "the class")}.</p><form id="decline-leave-form"><label>Note for the student (optional)<textarea name="note" rows="3" maxlength="300" placeholder="For example: Let’s discuss this in class."></textarea></label><p class="form-error" data-leave-decline-error role="alert"></p><div class="modal-actions"><button class="button secondary" type="button" data-leave-cancel>Back</button><button class="button primary" type="submit">Decline request</button></div></form></div>`, (modal, close) => {
      closeModal = () => { confirming = false; close(); };
      const cancel = $("[data-leave-cancel]", modal);
      cancel.addEventListener("click", closeModal);
      const form = $("#decline-leave-form", modal);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy || !active) return;
        busy = true;
        const submit = $("[type=submit]", form);
        submit.disabled = cancel.disabled = true;
        controls();
        try {
          await runTransaction(db, async (transaction) => {
            const ref = rosterRef(student.id);
            if (!sameRequest(await transaction.get(ref), student)) throw new Error("This request has already changed. Refresh before reviewing it.");
            transaction.update(ref, { leaveRequest: deleteField(), leaveDeclined: { note: $("textarea", form).value.trim(), declinedAt: serverTimestamp() } });
          });
          closeModal();
          notify({ title: "Leave request declined", message: "The student stays in the class and keeps their progress." });
          if (active) await onChange();
        } catch (failure) {
          if (active) $("[data-leave-decline-error]", modal).textContent = failure.message;
        } finally { busy = false; if (active) { submit.disabled = cancel.disabled = false; draw(); } }
      });
    }, { closeOnBackdrop: false, beforeClose: () => { if (busy) return false; confirming = false; return true; } });
  }
  search.addEventListener("input", () => { selected.clear(); draw(); });
  all.addEventListener("change", () => { for (const student of visible()) all.checked ? selected.set(student.id, leaveRequestKey(student)) : selected.delete(student.id); draw(); });
  list.addEventListener("change", (event) => {
    const input = event.target.closest("[data-leave-check]");
    if (!input || busy) return;
    const student = visible().find((student) => student.id === input.dataset.leaveCheck);
    if (!student) return;
    input.checked ? selected.set(student.id, leaveRequestKey(student)) : selected.delete(student.id);
    input.closest(".leave-request").classList.toggle("is-selected", input.checked);
    controls();
  });
  bulk.addEventListener("click", () => openApprove(visible().filter((student) => selected.get(student.id) === leaveRequestKey(student))));
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-approve-leave], [data-decline-leave]");
    if (!button) return;
    const student = visible().find((student) => student.id === (button.dataset.approveLeave || button.dataset.declineLeave));
    if (student) button.hasAttribute("data-approve-leave") ? openApprove([student]) : openDecline(student);
  });
  draw();
  const unsubscribe = onSnapshot(collection(db, "classes", classroom.id, "students"), (snapshot) => {
    if (!active) return;
    students = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    error.hidden = true;
    draw();
  }, () => { if (active) { error.textContent = "Leave requests could not be updated. Check your connection and refresh this page."; error.hidden = false; } });
  leave = () => { active = false; unsubscribe(); closeModal?.(); };
}
