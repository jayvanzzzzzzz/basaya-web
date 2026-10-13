import {
  deleteField,
  doc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { $, escapeHtml, openModal, toast } from "../../js/helpers.js";
import { removeStudent } from "../../js/api.js";
import { relativeTime } from "./progressUi.js";

// Students ask to leave from the app (classes/{id}/students/{uid}.leaveRequest {reason, requestedAt}).
// Approving removes them through notify-api/api/remove-student, which also deletes their
// progress for this class. Declining stores leaveDeclined {note, declinedAt}; the app shows it.
// Styles: css/components/class-deletion.css (shared with deletion requests).

const millis = (value) => (value?.toMillis ? value.toMillis() : 0);

export const pendingLeaves = (students) =>
  students
    .filter((student) => student.leaveRequest)
    .sort((a, b) => millis(a.leaveRequest.requestedAt) - millis(b.leaveRequest.requestedAt));

/** "Leave requests" panel for the top of the Students page ("" when there are none). */
export function leaveRequestsPanel(students) {
  const pending = pendingLeaves(students);
  if (!pending.length) return "";

  return `<section class="deletion-requests leave-requests" aria-labelledby="leave-requests-title">
    <div class="deletion-requests__head">
      <span class="deletion-requests__pulse" aria-hidden="true"></span>
      <div>
        <span class="eyebrow">Needs your decision</span>
        <h2 id="leave-requests-title">Leave requests</h2>
      </div>
      <span class="deletion-requests__count">${pending.length}</span>
    </div>
    <div class="deletion-requests__list">
      ${pending
        .map((student, index) => {
          const name = student.fullName || "Student";
          const request = student.leaveRequest;
          const reason = (request.reason || "").trim();
          return `<article class="deletion-request" style="--i:${index}">
            <div class="student-avatar" aria-hidden="true">${escapeHtml(name.trim().charAt(0).toUpperCase() || "S")}</div>
            <div class="deletion-request__main">
              <strong>${escapeHtml(name)}</strong>
              <span>Asked to leave · ${escapeHtml(relativeTime(millis(request.requestedAt)))}</span>
              ${
                reason
                  ? `<blockquote>${escapeHtml(reason)}</blockquote>`
                  : '<span class="leave-request__no-reason">No reason given.</span>'
              }
            </div>
            <div class="deletion-request__actions">
              <button type="button" class="button secondary small" data-decline-leave="${escapeHtml(student.id)}">Decline</button>
              <button type="button" class="button danger small" data-approve-leave="${escapeHtml(student.id)}">Approve</button>
            </div>
          </article>`;
        })
        .join("")}
    </div>
  </section>`;
}

export function wireLeaveRequests(classroom, students, onChange) {
  const find = (id) => students.find((student) => student.id === id);
  document.querySelectorAll("[data-approve-leave]").forEach((button) =>
    button.addEventListener("click", () => {
      const student = find(button.dataset.approveLeave);
      if (student) openApproveModal(classroom, student, onChange);
    }),
  );
  document.querySelectorAll("[data-decline-leave]").forEach((button) =>
    button.addEventListener("click", () => {
      const student = find(button.dataset.declineLeave);
      if (student) openDeclineModal(classroom, student, onChange);
    }),
  );
}

/** Chip for the student's roster row. */
export const leaveChip = (student) =>
  student.leaveRequest
    ? '<span class="deletion-chip deletion-chip--pending">Wants to leave</span>'
    : "";

function openApproveModal(classroom, student, onChange) {
  const name = student.fullName || "this student";
  const reason = (student.leaveRequest?.reason || "").trim();
  openModal(
    `<div class="deletion-modal">
      <span class="deletion-modal__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" /></svg></span>
      <h2>Let ${escapeHtml(name)} leave?</h2>
      ${reason ? `<p class="deletion-modal__reason"><span>Student's reason</span>“${escapeHtml(reason)}”</p>` : ""}
      <div class="deletion-modal__impact">
        <strong>Approving removes from ${escapeHtml(classroom.className || "this class")}:</strong>
        <ul>
          <li>The student, from the class roster</li>
          <li>Their lesson progress and scores for this class's lessons</li>
        </ul>
      </div>
      <p class="muted">Their account stays. They can join a class again with a class code. This can't be undone.</p>
      <p class="form-error" id="approve-leave-error" role="alert"></p>
      <div class="modal-actions">
        <button type="button" class="button secondary" data-cancel>Not now</button>
        <button type="button" class="button danger" data-confirm>Approve &amp; remove</button>
      </div>
    </div>`,
    (modal, close) => {
      $("[data-cancel]", modal).addEventListener("click", close);
      const confirmButton = $("[data-confirm]", modal);
      confirmButton.addEventListener("click", async () => {
        confirmButton.disabled = true;
        confirmButton.textContent = "Removing…";
        try {
          await removeStudent(classroom.id, student.id);
          close();
          toast(`${name} has left the class.`);
          await onChange();
        } catch (error) {
          $("#approve-leave-error", modal).textContent = `Couldn't remove the student: ${error.message}.`;
          confirmButton.disabled = false;
          confirmButton.textContent = "Approve & remove";
        }
      });
    },
  );
}

function openDeclineModal(classroom, student, onChange) {
  const name = student.fullName || "this student";
  openModal(
    `<div class="deletion-modal">
      <h2>Decline ${escapeHtml(name)}'s request?</h2>
      <p>They'll stay in ${escapeHtml(classroom.className || "the class")}, and the app will tell them you said no.</p>
      <form id="decline-leave-form">
        <label><span>Note for the student <span class="muted">(optional)</span></span>
          <textarea name="note" rows="3" maxlength="300" placeholder="e.g. Let's talk about it in class first."></textarea>
        </label>
        <p class="form-error" id="decline-leave-error" role="alert"></p>
        <div class="modal-actions">
          <button type="button" class="button secondary" data-cancel>Back</button>
          <button type="submit" class="button primary">Decline request</button>
        </div>
      </form>
    </div>`,
    (modal, close) => {
      $("[data-cancel]", modal).addEventListener("click", close);
      const form = $("#decline-leave-form", modal);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector("[type=submit]");
        submit.disabled = true;
        try {
          await updateDoc(doc(db, "classes", classroom.id, "students", student.id), {
            leaveRequest: deleteField(),
            leaveDeclined: { note: form.note.value.trim(), declinedAt: serverTimestamp() },
          });
          close();
          toast(`${name} stays in the class.`);
          await onChange();
        } catch (error) {
          $("#decline-leave-error", modal).textContent = `Couldn't decline: ${error.message}.`;
          submit.disabled = false;
        }
      });
    },
  );
}
