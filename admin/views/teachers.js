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
import { $, escapeHtml, toast, page, empty, openModal } from "../../js/helpers.js";

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
    "Create, edit, and remove teacher accounts.",
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
                      <span class="teacher-table__avatar" aria-hidden="true">${escapeHtml((t.displayName || t.email || "T").split(/\s+/).map((part) => part.charAt(0)).join("").slice(0, 2).toUpperCase())}</span>
                      <span class="teacher-table__name">${escapeHtml(t.displayName || "Unnamed teacher")}</span>
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
      deleteTeacher(t);
    });
  });
}

function openAddTeacherModal() {
  openModal(
    `<h2>Add teacher</h2>
     <form id="add-teacher-form" class="form-card">
       <label>Full name<input name="displayName" required placeholder="Juan Dela Cruz" /></label>
       <label>Email<input name="email" type="email" required placeholder="teacher@school.edu" /></label>
       <label>Temporary password<input name="password" type="password" required minlength="6" placeholder="At least 6 characters" /></label>
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
          const email = form.get("email").trim();
          const password = form.get("password");
          const errorEl = modal.querySelector("#add-teacher-error");
          errorEl.textContent = "";
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
              email,
              createdAt: serverTimestamp(),
            });
            await signOut(secondaryAuth);
            toast(`Teacher account created for ${displayName}.`);
            close();
            await renderTeachers();
          } catch (error) {
            errorEl.textContent =
              error.code === "auth/email-already-in-use"
                ? "An account with this email already exists."
                : error.message;
          }
        });
    },
  );
}

function openEditTeacherModal(teacher) {
  openModal(
    `<h2>Edit teacher</h2>
     <form id="edit-teacher-form" class="form-card">
       <label>Full name<input name="displayName" required value="${escapeHtml(teacher.displayName || "")}" /></label>
       <p class="muted">Email: ${escapeHtml(teacher.email || "—")}. Use "Reset password" to let them set a new password.</p>
       <div class="modal-actions"><button class="button primary" type="submit">Save changes</button></div>
     </form>`,
    (modal, close) => {
      modal
        .querySelector("#edit-teacher-form")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const displayName = new FormData(e.currentTarget)
            .get("displayName")
            .trim();
          try {
            await updateDoc(doc(db, "users", teacher.id), { displayName });
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

async function resetPassword(teacher) {
  if (!teacher.email) return toast("This account has no email on file.");
  try {
    await sendPasswordResetEmail(auth, teacher.email);
    toast(`Password reset email sent to ${teacher.email}.`);
  } catch (error) {
    toast(error.message);
  }
}

async function deleteTeacher(teacher) {
  const confirmed = confirm(
    `Remove ${teacher.displayName || teacher.email}? This immediately revokes their portal access. Their existing classes and lessons will remain but become unassigned.`,
  );
  if (!confirmed) return;
  try {
    // Deletes the Firestore profile, which revokes access (the role
    // check in teacher/app.js will fail for this UID going forward).
    // This does NOT delete the underlying Firebase Auth account —
    // client-side code can only delete the currently signed-in user's
    // own account. Fully deleting the Auth record requires the Admin
    // SDK (a Cloud Function) — worth adding post-defense if needed.
    await deleteDoc(doc(db, "users", teacher.id));
    toast("Teacher account removed.");
    await renderTeachers();
  } catch (error) {
    toast(error.message);
  }
}