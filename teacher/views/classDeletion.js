import {
  deleteField,
  doc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state } from "../../js/state.js";
import { $, displayName, escapeHtml, openModal, time, toast } from "../../js/helpers.js";

// Teachers can't delete a class themselves: they send a request (with a reason) that an
// admin approves or declines on the admin "All classes" page. Stored on the class:
//   deletionRequest  { reason, requestedBy, requestedByName, requestedAt }
//   deletionDeclined { note, declinedAt }   (shown until the teacher dismisses it)
// Styles: css/components/class-deletion.css.

const classRef = (classroom) => doc(db, "classes", classroom.id);

const ICON = {
  pending: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3 2" /></svg>',
  declined: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>',
};

/** Small status chip for a class card. */
export function deletionChip(classroom) {
  if (classroom.deletionRequest) {
    return `<span class="deletion-chip deletion-chip--pending">${ICON.pending}Deletion pending</span>`;
  }
  if (classroom.deletionDeclined) {
    return `<span class="deletion-chip deletion-chip--declined">${ICON.declined}Deletion declined</span>`;
  }
  return "";
}

/** Banner for the top of the class page (or "" when there is nothing to show). */
export function deletionBanner(classroom) {
  if (classroom.deletionRequest) {
    const request = classroom.deletionRequest;
    return `<section class="deletion-banner deletion-banner--pending" role="status">
      <span class="deletion-banner__icon">${ICON.pending}</span>
      <div class="deletion-banner__text">
        <strong>Waiting for an admin to approve deleting this class</strong>
        <p>Requested ${escapeHtml(time(request.requestedAt))} · Reason: “${escapeHtml(request.reason || "")}” · The class works as usual until then.</p>
      </div>
      <button class="button secondary small" type="button" data-cancel-deletion>Cancel request</button>
    </section>`;
  }
  if (classroom.deletionDeclined) {
    const note = classroom.deletionDeclined.note;
    return `<section class="deletion-banner deletion-banner--declined" role="status">
      <span class="deletion-banner__icon">${ICON.declined}</span>
      <div class="deletion-banner__text">
        <strong>An admin declined deleting this class</strong>
        <p>${note ? `Note from the admin: “${escapeHtml(note)}”` : "No note was added."}</p>
      </div>
      <button class="button secondary small" type="button" data-dismiss-declined>Dismiss</button>
    </section>`;
  }
  return "";
}

/** Hooks up the banner's buttons; `onChange` re-renders the page. */
export function wireDeletionBanner(classroom, onChange) {
  $("[data-cancel-deletion]")?.addEventListener("click", () =>
    confirmCancelRequest(classroom, onChange),
  );
  $("[data-dismiss-declined]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    try {
      await updateDoc(classRef(classroom), { deletionDeclined: deleteField() });
      onChange();
    } catch (error) {
      toast(error.message);
    }
  });
}

export function openRequestDeletionModal(classroom, onChange) {
  openModal(
    `<div class="deletion-modal">
      <span class="deletion-modal__icon">${ICON.declined}</span>
      <h2>Request to delete this class?</h2>
      <p>An admin has to approve before <strong>${escapeHtml(classroom.className)}</strong> is deleted. Until then, everything keeps working.</p>
      <div class="deletion-modal__impact">
        <strong>Once approved, this permanently removes:</strong>
        <ul>
          <li>The class and its class code</li>
          <li>Its lesson plan, schedules and notifications</li>
          <li>Every student's progress and scores in this class</li>
          <li>Students from the class (their accounts stay)</li>
        </ul>
      </div>
      <form id="request-deletion-form">
        <label>Reason for deleting
          <textarea name="reason" required minlength="5" maxlength="300" placeholder="e.g. The school year has ended and this section is closed."></textarea>
        </label>
        <p class="form-error" role="alert"></p>
        <div class="modal-actions">
          <button type="button" class="button secondary" data-cancel>Keep class</button>
          <button type="submit" class="button danger">Send request</button>
        </div>
      </form>
    </div>`,
    (modal, close) => {
      $("[data-cancel]", modal).addEventListener("click", close);
      $("#request-deletion-form", modal).addEventListener("submit", async (event) => {
        event.preventDefault();
        const reason = new FormData(event.currentTarget).get("reason").trim();
        const error = $(".form-error", modal);
        if (reason.length < 5) {
          error.textContent = "Please write a short reason (at least 5 characters).";
          return;
        }
        const submit = event.submitter;
        submit.disabled = true;
        try {
          await updateDoc(classRef(classroom), {
            deletionRequest: {
              reason,
              requestedBy: state.user.uid,
              requestedByName: displayName(),
              requestedAt: serverTimestamp(),
            },
            deletionDeclined: deleteField(),
          });
          close();
          toast("Request sent. An admin will review it.");
          onChange();
        } catch (err) {
          error.textContent = err.message;
          submit.disabled = false;
        }
      });
    },
  );
}

export function confirmCancelRequest(classroom, onChange) {
  openModal(
    `<h2>Cancel the deletion request?</h2>
     <p>${escapeHtml(classroom.className)} will stay, and the admin won't see the request anymore.</p>
     <div class="modal-actions">
       <button type="button" class="button secondary" data-cancel>Back</button>
       <button type="button" class="button primary" data-confirm>Cancel request</button>
     </div>`,
    (modal, close) => {
      $("[data-cancel]", modal).addEventListener("click", close);
      $("[data-confirm]", modal).addEventListener("click", async (event) => {
        event.currentTarget.disabled = true;
        try {
          await updateDoc(classRef(classroom), { deletionRequest: deleteField() });
          close();
          toast("Deletion request cancelled.");
          onChange();
        } catch (error) {
          toast(error.message);
          event.currentTarget.disabled = false;
        }
      });
    },
  );
}
