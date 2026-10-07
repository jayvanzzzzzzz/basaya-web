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

export async function renderTeachers() {
  await getAllTeachers();

  page(
    "Teacher accounts",
    "Create, edit, and remove teacher accounts.",
    `<button class="button primary" id="add-teacher">+ Add teacher</button>`,
  );

  $("#page-content").innerHTML = state.teachers.length
    ? `<div class="card">
        <table class="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th></th></tr>
          </thead>
          <tbody>
            ${state.teachers
              .map(
                (t) => `<tr>
                  <td>${escapeHtml(t.displayName || "—")}</td>
                  <td>${escapeHtml(t.email || "—")}</td>
                  <td class="table-actions">
                    <button class="text-button" data-edit="${t.id}">Edit</button>
                    <button class="text-button" data-reset="${t.id}">Reset password</button>
                    <button class="text-button danger" data-delete="${t.id}">Delete</button>
                  </td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>`
    : empty(
        "No teacher accounts yet",
        "Add your first teacher account to get started.",
        "Add teacher",
        "add-teacher-empty",
      );

  $("#add-teacher")?.addEventListener("click", openAddTeacherModal);
  $("#add-teacher-empty")?.addEventListener("click", openAddTeacherModal);

  state.teachers.forEach((t) => {
    $(`[data-edit="${t.id}"]`)?.addEventListener("click", () => openEditTeacherModal(t));
    $(`[data-reset="${t.id}"]`)?.addEventListener("click", () => resetPassword(t));
    $(`[data-delete="${t.id}"]`)?.addEventListener("click", () => deleteTeacher(t));
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