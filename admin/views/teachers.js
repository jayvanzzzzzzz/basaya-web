import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, secondaryAuth, db } from "../../js/firebase.js";
import { state, getAllTeachers } from "../../js/state.js";
import { $, escapeHtml, toast, notify, initials, page, empty, openModal, currentRoute } from "../../js/helpers.js";
import { paginate } from "../../js/pagination.js";
import { fieldError } from "../../js/field-errors.js";
import { sendPasswordReset } from "../../js/api.js";
import { MIN_LENGTH } from "../../js/password-rules.js";
import { titleChipsMarkup, titleLabel } from "../../js/teacherTitle.js";
import { assignClasses, classIdsOf, teacherLabel, teacherOptions } from "./classTeacher.js";

let pager = null;

function closeTeacherMenus() {
  document.querySelectorAll(".teacher-table__menu-popup").forEach((menu) => {
    menu.hidden = true;
    menu
      .closest(".teacher-table__menu")
      ?.querySelector(".teacher-table__menu-toggle")
      ?.setAttribute("aria-expanded", "false");
  });
}

document.addEventListener("click", (event) => {
  if (
    event.target instanceof Element &&
    !event.target.closest(".teacher-table__menu")
  ) {
    closeTeacherMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTeacherMenus();
});

export async function renderTeachers() {
  await getAllTeachers();

  page(
    "Teacher accounts",
    [`${state.teachers.length} ${state.teachers.length === 1 ? "teacher" : "teachers"}`],
    `<button class="button primary" id="add-teacher">+ Add teacher</button>`,
  );

  $("#page-content").innerHTML = state.teachers.length
    ? `<section class="teacher-directory" aria-label="Teacher accounts">
        <div class="teacher-directory__intro">
          <div>
            <span class="teacher-directory__eyebrow">People</span>
            <h2>Meet your teachers</h2>
            <p>Manage account details and access in one place.</p>
          </div>
          <span class="teacher-directory__count">
            <strong>${state.teachers.length}</strong>
            ${state.teachers.length === 1 ? "teacher" : "teachers"}
          </span>
        </div>
        <label class="admin-directory-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
          <span class="sr-only">Search teachers by name</span>
          <input type="search" id="teacher-name-search" placeholder="Search by teacher name..." autocomplete="off" />
        </label>
        <div class="teacher-table-wrap">
        <table class="table teacher-table">
          <thead>
            <tr><th scope="col">Teacher</th><th scope="col">Email address</th><th scope="col" aria-label="Teacher actions"></th></tr>
          </thead>
          <tbody>
            ${state.teachers
              .map(
                (t) => `<tr data-teacher-name="${escapeHtml(t.displayName || "Unnamed teacher")}">
                  <td>
                    <div class="teacher-table__person">
                      <span class="teacher-table__avatar" aria-hidden="true">${escapeHtml(initials(t.displayName || t.email || "T"))}</span>
                      <span class="teacher-table__name">${escapeHtml(t.displayName || "Unnamed teacher")}</span>
                      ${titleLabel(t.title) ? `<span class="teacher-table__title">${escapeHtml(titleLabel(t.title))}</span>` : ""}
                    </div>
                  </td>
                  <td class="teacher-table__email">${escapeHtml(t.email || "No email on file")}</td>
                  <td>
                    <div class="teacher-table__menu">
                      <button
                        type="button"
                        class="teacher-table__menu-toggle"
                        aria-label="Actions for ${escapeHtml(t.displayName || t.email || "teacher")}"
                        aria-haspopup="true"
                        aria-expanded="false"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                      </button>
                      <div class="teacher-table__menu-popup" hidden>
                        <button type="button" class="teacher-table__menu-item" data-edit="${escapeHtml(t.id)}">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" /></svg>
                          <span>Edit details</span>
                        </button>
                        <button type="button" class="teacher-table__menu-item" data-reset="${escapeHtml(t.id)}">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8 2 2-2 2 2 2-3 3-2-2-3 3" /></svg>
                          <span>Reset password</span>
                        </button>
                        <button type="button" class="teacher-table__menu-item teacher-table__menu-item--danger" data-delete="${escapeHtml(t.id)}">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" /></svg>
                          <span>Remove teacher</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>`,
              )
              .join("")}
            <tr class="admin-directory-search-empty" hidden>
              <td colspan="3">No teachers match that name.</td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>`
    : empty(
        "No teacher accounts yet",
        "Add your first teacher account to get started.",
        "Add teacher",
        "add-teacher-empty",
      );

  $("#add-teacher")?.addEventListener("click", openAddTeacherModal);
  $("#add-teacher-empty")?.addEventListener("click", openAddTeacherModal);

  $("#teacher-name-search")?.addEventListener("input", (event) => {
    const query = event.currentTarget.value.trim().toLowerCase();
    const rows = [...document.querySelectorAll(".teacher-table tbody tr[data-teacher-name]")];
    let visibleCount = 0;
    rows.forEach((row) => {
      const matches = row.dataset.teacherName.toLowerCase().includes(query);
      row.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    const emptyRow = $(".admin-directory-search-empty");
    if (emptyRow) emptyRow.hidden = visibleCount !== 0;
  });

  pager = paginate({
    rows: () => [...document.querySelectorAll(".teacher-table tbody tr[data-teacher-name]")],
    after: $(".teacher-table-wrap"),
    search: $("#teacher-name-search"),
    label: ["teacher", "teachers"],
  });

  state.teachers.forEach((t) => {
    const editButton = [...document.querySelectorAll("[data-edit]")].find(
      (button) => button.dataset.edit === t.id,
    );
    const resetButton = [...document.querySelectorAll("[data-reset]")].find(
      (button) => button.dataset.reset === t.id,
    );
    const deleteButton = [...document.querySelectorAll("[data-delete]")].find(
      (button) => button.dataset.delete === t.id,
    );
    const row = editButton?.closest("tr");
    const toggle = row?.querySelector(".teacher-table__menu-toggle");
    const popup = row?.querySelector(".teacher-table__menu-popup");

    toggle?.addEventListener("click", () => {
      const willOpen = popup.hidden;
      closeTeacherMenus();
      popup.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
    editButton?.addEventListener("click", () => {
      closeTeacherMenus();
      openEditTeacherModal(t);
    });
    resetButton?.addEventListener("click", () => {
      closeTeacherMenus();
      resetPassword(t);
    });
    deleteButton?.addEventListener("click", () => {
      closeTeacherMenus();
      openRemoveTeacherModal(t);
    });
  });
}

function openAddTeacherModal() {
  openModal(
    `<h2>Add teacher</h2>
     <form id="add-teacher-form" class="form-card">
       <label>Full name<input name="displayName" required data-missing="Enter the teacher's full name, like Juan Dela Cruz." placeholder="Juan Dela Cruz" /></label>
       ${titleChipsMarkup()}
       <label>Email<input name="email" type="email" required data-missing="Enter the email the teacher will sign in with." placeholder="teacher@school.edu" /></label>
       <label>Temporary password<input name="password" type="password" required data-missing="Set a temporary password for the teacher's first sign-in." minlength="${MIN_LENGTH}" placeholder="At least ${MIN_LENGTH} characters" /></label>
       <p id="add-teacher-error" class="form-error" role="alert"></p>
       <div class="modal-actions"><button class="button primary" type="submit">Create account</button></div>
     </form>`,
    (modal, close) => {
      modal
        .querySelector("#add-teacher-form")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const displayName = form.get("displayName").trim();
          const title = form.get("title") || "";
          const email = form.get("email").trim();
          const password = form.get("password");
          const errorEl = modal.querySelector("#add-teacher-error");
          errorEl.textContent = "";
          // Temporary password: length only, no small/capital/number rule.
          const fields = e.currentTarget.elements;
          if (password.length < MIN_LENGTH) {
            fieldError(fields.password, `The temporary password needs at least ${MIN_LENGTH} characters.`);
            fields.password.focus();
            return;
          }
          try {
            // Created on the secondary Auth instance so this doesn't
            // replace the admin's own active session.
            const cred = await createUserWithEmailAndPassword(
              secondaryAuth,
              email,
              password,
            );
            await setDoc(doc(db, "users", cred.user.uid), {
              role: "teacher",
              displayName,
              title,
              email,
              createdAt: serverTimestamp(),
            });
            await signOut(secondaryAuth);
            toast(`Teacher account created for ${displayName}.`);
            close();
            await renderTeachers();
          } catch (error) {
            const field = {
              "auth/email-already-in-use": [fields.email, "An account with this email already exists."],
              "auth/invalid-email": [fields.email, "That doesn't look like an email address. Check it has an @ and a domain."],
              "auth/weak-password": [fields.password, "That password is too weak. Try a longer one."],
            }[error.code];
            if (field) {
              fieldError(...field);
              field[0].focus();
            } else {
              errorEl.textContent = error.message;
            }
          }
        });
    },
  );
}

function openEditTeacherModal(teacher) {
  openModal(
    `<h2>Edit teacher</h2>
     <form id="edit-teacher-form" class="form-card">
       <label>Full name<input name="displayName" required data-missing="The teacher's name can't be blank. Enter their full name." value="${escapeHtml(teacher.displayName || "")}" /></label>
       ${titleChipsMarkup(teacher.title)}
       <p class="muted">Email: ${escapeHtml(teacher.email || "—")}. Use "Reset password" to let them set a new password.</p>
       <div class="modal-actions"><button class="button primary" type="submit">Save changes</button></div>
     </form>`,
    (modal, close) => {
      modal
        .querySelector("#edit-teacher-form")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          const displayName = values.get("displayName").trim();
          const title = values.get("title") || "";
          try {
            await updateDoc(doc(db, "users", teacher.id), { displayName, title });
            toast("Teacher account updated.");
            close();
            await renderTeachers();
          } catch (error) {
            toast(error.message);
          }
        });
    },
  );
}

/**
 * Sends the BaSaya-branded reset email (notify-api). If the API can't send it
 * (e.g. Gmail isn't set up yet), falls back to Firebase's standard reset email.
 */
async function resetPassword(teacher) {
  const name = teacherName(teacher);
  if (!teacher.email) {
    return notify({ tone: "danger", title: "No email on file", message: `${name} has no email to send a reset link to.` });
  }
  const sending = notify({
    tone: "info",
    avatar: initials(name),
    title: "Sending reset link…",
    message: teacher.email,
    duration: 20000,
  });
  try {
    const { email } = await sendPasswordReset(teacher.id);
    sending.dismiss();
    notify({
      tone: "success",
      avatar: initials(name),
      title: "Reset link sent",
      message: `${name} will get an email at ${email}. The link works for 1 hour.`,
    });
  } catch (error) {
    console.warn("Branded reset email failed, using Firebase's:", error);
    try {
      await sendPasswordResetEmail(auth, teacher.email);
      sending.dismiss();
      notify({
        tone: "success",
        avatar: initials(name),
        title: "Reset link sent",
        message: `Sent to ${teacher.email} with the standard Firebase email.`,
      });
    } catch (fallbackError) {
      sending.dismiss();
      notify({ tone: "danger", title: "Couldn't send the reset link", message: fallbackError.message });
    }
  }
}

const ICON_USER_MINUS =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 11h6" /></svg>';
const ICON_LOCK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>';
const ICON_CLASSES =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M3.5 9.5h17M9 9.5v10" /></svg>';
const ICON_SHIELD =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6l-7-2.5Z" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>';

const teacherName = (teacher) => teacher.displayName || teacher.email || "this teacher";

function openRemoveTeacherModal(teacher) {
  const name = teacherName(teacher);
  openModal(
    `<div class="remove-teacher">
      <div class="remove-teacher__head">
        <span class="remove-teacher__icon">${ICON_USER_MINUS}</span>
        <div>
          <h2>Remove teacher access?</h2>
          <p>Review what changes before you continue.</p>
        </div>
      </div>
      <div class="remove-teacher__person">
        <span class="remove-teacher__avatar" aria-hidden="true">${escapeHtml(initials(name))}</span>
        <span class="remove-teacher__who">
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(teacher.email || "No email on file")}</span>
        </span>
        <span class="remove-teacher__role">Teacher</span>
      </div>
      <ul class="remove-teacher__impact">
        <li class="is-lost">${ICON_LOCK}<span><strong>Portal access ends right away</strong><small>They can no longer sign in to the teacher portal.</small></span></li>
        <li class="is-kept">${ICON_CLASSES}<span>
          <strong data-class-impact>Their classes stay</strong>
          <small data-class-detail>Classes remain and show as Unassigned until you reassign them.</small>
          <label class="remove-teacher__move" hidden>
            <span>Move their classes to</span>
            <select name="moveTo">
              <option value="">Leave unassigned for now</option>
              ${teacherOptions("", teacher.id)}
            </select>
          </label>
        </span></li>
        <li class="is-kept">${ICON_SHIELD}<span><strong>Lessons and student progress are kept</strong><small>Nothing students have done is deleted.</small></span></li>
      </ul>
      <p class="form-error" id="remove-teacher-error" role="alert"></p>
      <div class="modal-actions">
        <button type="button" class="button secondary" data-cancel>Keep teacher</button>
        <button type="button" class="button danger" data-confirm-remove>Remove teacher</button>
      </div>
    </div>`,
    (modal, close) => {
      $("[data-cancel]", modal).addEventListener("click", close);
      setTimeout(() => $("[data-cancel]", modal).focus(), 50);

      // Once we know how many classes they lead, offer to hand them to another teacher.
      let count = 0;
      const moveTo = $("[name=moveTo]", modal);
      const describeClasses = () => {
        if (!count) return;
        const target = state.teachers.find((t) => t.id === moveTo.value);
        const classes = `${count} ${count === 1 ? "class" : "classes"}`;
        $("[data-class-impact]", modal).textContent = target
          ? `${classes} move to ${teacherLabel(target)}`
          : `${classes} ${count === 1 ? "stays" : "stay"}, now unassigned`;
        $("[data-class-detail]", modal).textContent = target
          ? "Their students, lesson plans and progress go with them."
          : "They show as Unassigned until you reassign them in All classes.";
      };
      moveTo.addEventListener("change", describeClasses);
      classIdsOf(teacher.id)
        .then((ids) => {
          count = ids.length;
          describeClasses();
          // Only worth asking when there are classes and someone to take them.
          $(".remove-teacher__move", modal).hidden = !count || moveTo.options.length < 2;
        })
        .catch(() => {});

      const confirmButton = $("[data-confirm-remove]", modal);
      confirmButton.addEventListener("click", async () => {
        confirmButton.disabled = true;
        confirmButton.textContent = "Removing…";
        const target = state.teachers.find((t) => t.id === moveTo.value);
        try {
          // Hand the classes over first, so they're never left without a teacher.
          const moved = target ? await classIdsOf(teacher.id) : [];
          await assignClasses(moved, target?.id);
          // Deleting the Firestore profile revokes access (the role check in
          // teacher/app.js fails for this UID). The Firebase Auth account itself
          // stays: only the Admin SDK can delete another user's Auth record.
          await deleteDoc(doc(db, "users", teacher.id));
          close();
          await removeRow(teacher.id);
          showRemovedNotice(teacher, moved, target);
        } catch (error) {
          $("#remove-teacher-error", modal).textContent = `Couldn't remove the teacher: ${error.message}`;
          confirmButton.disabled = false;
          confirmButton.textContent = "Remove teacher";
        }
      });
    },
  );
}

/** Fades the teacher's row out, collapses its space, then updates the count and pages. */
async function removeRow(teacherId) {
  state.teachers = state.teachers.filter((t) => t.id !== teacherId);
  const row = document
    .querySelector(`[data-delete="${CSS.escape(teacherId)}"]`)
    ?.closest("tr");
  if (!state.teachers.length || !row) {
    if (currentRoute() === "/teachers") await renderTeachers();
    return;
  }

  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    row.classList.add("is-leaving");
    await new Promise((resolve) => setTimeout(resolve, 520));
    // Swap the cells for one spacer of the same height, then shrink it.
    const height = row.getBoundingClientRect().height;
    row.classList.add("is-collapsing");
    row.innerHTML = `<td colspan="3"><div style="height:${height}px"></div></td>`;
    await row.firstElementChild.firstElementChild.animate(
      [{ height: `${height}px` }, { height: "0px" }],
      { duration: 280, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
    ).finished;
  }
  row.remove();

  const count = $(".teacher-directory__count");
  if (count) {
    const total = state.teachers.length;
    count.innerHTML = `<strong>${total}</strong> ${total === 1 ? "teacher" : "teachers"}`;
  }
  pager?.refresh();
}

/** "Removed" notice with Undo, which restores the account and moves any classes back. */
function showRemovedNotice(teacher, moved = [], target = null) {
  const name = teacherName(teacher);
  const { id, ...profile } = teacher;
  notify({
    tone: "danger",
    avatar: initials(name),
    title: `${name} was removed`,
    message: moved.length
      ? `Access revoked. ${moved.length} ${moved.length === 1 ? "class" : "classes"} moved to ${teacherLabel(target)}.`
      : "Portal access has been revoked.",
    duration: 8000,
    action: {
      label: "Undo",
      busyLabel: "Restoring…",
      run: async () => {
        try {
          await setDoc(doc(db, "users", id), profile);
          await assignClasses(moved, id);
        } catch (error) {
          notify({ tone: "danger", title: "Couldn't restore the teacher", message: error.message });
          return;
        }
        if (currentRoute() === "/teachers") {
          await renderTeachers();
          document
            .querySelector(`[data-delete="${CSS.escape(id)}"]`)
            ?.closest("tr")
            ?.classList.add("is-restored");
        }
        notify({
          tone: "success",
          avatar: initials(name),
          title: `${name} is back`,
          message: moved.length
            ? "Their access and classes have been restored."
            : "Their portal access has been restored.",
          duration: 4500,
        });
      },
    },
  });
}