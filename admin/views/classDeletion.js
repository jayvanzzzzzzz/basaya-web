import {
  collection,
  deleteField,
  doc,
  getCountFromServer,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { $, escapeHtml, openModal, time, toast } from "../../js/helpers.js";
import { deleteClass } from "../../js/api.js";

// Admin side of class deletion: teachers' requests (classes/{id}.deletionRequest) are
// approved or declined here. Deleting always goes through notify-api/api/delete-class,
// which also removes every student's progress. Styles: css/components/class-deletion.css.

const CONFIRM_WORD = "delete";

/** "Deletion requests" panel for the top of All classes ("" when there are none). */
export function requestsPanel(classes, teacherNameById) {
  const pending = classes
    .filter((classroom) => classroom.deletionRequest)
    .sort(
      (a, b) =>
        (a.deletionRequest.requestedAt?.seconds || 0) - (b.deletionRequest.requestedAt?.seconds || 0),
    );
  if (!pending.length) return "";

  return `<section class="deletion-requests" aria-labelledby="deletion-requests-title">
    <div class="deletion-requests__head">
      <span class="deletion-requests__pulse" aria-hidden="true"></span>
      <div>
        <span class="eyebrow">Needs your decision</span>
        <h2 id="deletion-requests-title">Deletion requests</h2>
      </div>
      <span class="deletion-requests__count">${pending.length}</span>
    </div>
    <div class="deletion-requests__list">
      ${pending
        .map((classroom, index) => {
          const request = classroom.deletionRequest;
          const teacher =
            request.requestedByName || teacherNameById.get(classroom.teacherId) || "A teacher";
          return `<article class="deletion-request" style="--i:${index}">
            <div class="deletion-request__main">
              <strong>${escapeHtml(classroom.className || "Untitled class")}</strong>
              <span>Requested by ${escapeHtml(teacher)} · ${escapeHtml(time(request.requestedAt))}</span>
              <blockquote>${escapeHtml(request.reason || "No reason given.")}</blockquote>
            </div>
            <div class="deletion-request__actions">
              <button type="button" class="button secondary small" data-decline-deletion="${escapeHtml(classroom.id)}">Decline</button>
              <button type="button" class="button danger small" data-approve-deletion="${escapeHtml(classroom.id)}">Approve &amp; delete</button>
            </div>
          </article>`;
        })
        .join("")}
    </div>
  </section>`;
}

export function wireRequestsPanel(classes, onChange) {
  const find = (id) => classes.find((classroom) => classroom.id === id);
  document.querySelectorAll("[data-approve-deletion]").forEach((button) =>
    button.addEventListener("click", () => {
      const classroom = find(button.dataset.approveDeletion);
      if (classroom) openDeleteConfirm(classroom, onChange);
    }),
  );
  document.querySelectorAll("[data-decline-deletion]").forEach((button) =>
    button.addEventListener("click", () => {
      const classroom = find(button.dataset.declineDeletion);
      if (classroom) openDeclineModal(classroom, onChange);
    }),
  );
}

/** Small chip for the class row in the table. */
export const requestChip = (classroom) =>
  classroom.deletionRequest
    ? '<span class="deletion-chip deletion-chip--pending">Deletion requested</span>'
    : "";

async function studentCount(classId) {
  try {
    const snap = await getCountFromServer(collection(db, "classes", classId, "students"));
    return snap.data().count;
  } catch {
    return null;
  }
}

/** The final step, for approving a request and for deleting directly: the admin types "delete" before the button unlocks. */
export function openDeleteConfirm(classroom, onChange) {
  const name = classroom.className || "Untitled class";
  const request = classroom.deletionRequest;
  openModal(
    `<div class="deletion-modal">
      <span class="deletion-modal__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3" /></svg></span>
      <h2>${request ? "Approve and delete" : "Delete"} ${escapeHtml(name)}?</h2>
      ${request ? `<p class="deletion-modal__reason"><span>Teacher's reason</span>“${escapeHtml(request.reason || "")}”</p>` : ""}
      <div class="deletion-modal__impact">
        <strong>This permanently removes:</strong>
        <ul>
          <li>The class, its class code, lesson plan and notifications</li>
          <li data-student-impact>Every student's progress and scores in this class</li>
          <li>Students from the class (their accounts and the lesson library stay)</li>
        </ul>
      </div>
      <form id="confirm-delete-form">
        <label><span>To continue, type <b>${CONFIRM_WORD}</b></span>
          <input name="confirm" autocomplete="off" spellcheck="false" placeholder="${CONFIRM_WORD}" aria-describedby="confirm-delete-error" />
        </label>
        <p class="form-error" id="confirm-delete-error" role="alert"></p>
        <div class="modal-actions">
          <button type="button" class="button secondary" data-cancel>Keep class</button>
          <button type="submit" class="button danger" data-confirm-delete disabled>Delete class</button>
        </div>
      </form>
    </div>`,
    (modal, close) => {
      const input = $("[name=confirm]", modal);
      const submit = $("[data-confirm-delete]", modal);
      $("[data-cancel]", modal).addEventListener("click", close);
      input.addEventListener("input", () => {
        const ready = input.value.trim().toLowerCase() === CONFIRM_WORD;
        submit.disabled = !ready;
        input.classList.toggle("is-confirmed", ready);
      });
      setTimeout(() => input.focus(), 50);

      studentCount(classroom.id).then((count) => {
        const line = $("[data-student-impact]", modal);
        if (line && count != null) {
          line.textContent = `Progress and scores of ${count} ${count === 1 ? "student" : "students"} in this class`;
        }
      });

      $("#confirm-delete-form", modal).addEventListener("submit", async (event) => {
        event.preventDefault();
        if (input.value.trim().toLowerCase() !== CONFIRM_WORD) return;
        submit.disabled = true;
        submit.textContent = "Deleting…";
        try {
          const result = await deleteClass(classroom.id);
          close();
          toast(
            `${name} was deleted${result.students ? `, with the progress of ${result.students} ${result.students === 1 ? "student" : "students"}` : ""}.`,
          );
          onChange();
        } catch (error) {
          $("#confirm-delete-error", modal).textContent = `Couldn't delete the class: ${error.message}.`;
          submit.disabled = false;
          submit.textContent = "Delete class";
        }
      });
    },
  );
}

function openDeclineModal(classroom, onChange) {
  openModal(
    `<h2>Decline this request?</h2>
     <p><strong>${escapeHtml(classroom.className || "Untitled class")}</strong> will stay as it is. The teacher will see that you declined.</p>
     <form id="decline-deletion-form">
       <label>Note to the teacher <span class="muted">(optional)</span>
         <textarea name="note" maxlength="300" placeholder="e.g. Keep this class until grades are submitted."></textarea>
       </label>
       <div class="modal-actions">
         <button type="button" class="button secondary" data-cancel>Back</button>
         <button type="submit" class="button primary">Decline request</button>
       </div>
     </form>`,
    (modal, close) => {
      $("[data-cancel]", modal).addEventListener("click", close);
      $("#decline-deletion-form", modal).addEventListener("submit", async (event) => {
        event.preventDefault();
        const note = new FormData(event.currentTarget).get("note").trim();
        event.submitter.disabled = true;
        try {
          await updateDoc(doc(db, "classes", classroom.id), {
            deletionRequest: deleteField(),
            deletionDeclined: { note, declinedAt: serverTimestamp() },
          });
          close();
          toast("Request declined. The teacher will see your note.");
          onChange();
        } catch (error) {
          toast(error.message);
          event.submitter.disabled = false;
        }
      });
    },
  );
}

/** Count badge on the "All classes" menu item. */
export async function refreshDeletionBadge() {
  const link = document.querySelector('[data-nav="classes"]');
  if (!link) return;
  let count = 0;
  try {
    const snap = await getDocs(query(collection(db, "classes"), where("deletionRequest", "!=", null)));
    count = snap.size;
  } catch (error) {
    console.warn("Could not count deletion requests", error);
  }
  let badge = link.querySelector(".nav-badge");
  if (!count) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "nav-badge";
    link.append(badge);
  }
  badge.textContent = String(count);
  badge.setAttribute("aria-label", `${count} deletion ${count === 1 ? "request" : "requests"}`);
}
