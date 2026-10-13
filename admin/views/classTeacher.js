// Assigning a class to a teacher. Everything a teacher can see or do in a class
// (roster, lesson plan, progress, leave requests, notifications) is checked against
// classes/{id}.teacherId, so changing that one field hands the whole class over.
// Used by: the "Teacher" field in Edit class, the "Assign teacher" button on
// unassigned classes, and "Move their classes to…" when removing a teacher.

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state } from "../../js/state.js";
import { $, escapeHtml, initials, notify, openModal } from "../../js/helpers.js";

export const teacherLabel = (teacher) =>
  teacher?.displayName || teacher?.email || "Unnamed teacher";

/** True when the class's teacher no longer has a teacher account. */
export const isUnassigned = (classroom) =>
  !state.teachers.some((teacher) => teacher.id === classroom.teacherId);

/** <option>s for every teacher (sorted by name), skipping `exclude`. */
export function teacherOptions(selectedId = "", exclude = "") {
  return [...state.teachers]
    .filter((teacher) => teacher.id !== exclude)
    .sort((a, b) => teacherLabel(a).localeCompare(teacherLabel(b)))
    .map(
      (teacher) =>
        `<option value="${escapeHtml(teacher.id)}" ${teacher.id === selectedId ? "selected" : ""}>${escapeHtml(teacherLabel(teacher))}${teacher.email && teacher.displayName ? ` · ${escapeHtml(teacher.email)}` : ""}</option>`,
    )
    .join("");
}

/** Ids of the classes a teacher leads. */
export async function classIdsOf(teacherId) {
  const snap = await getDocs(
    query(collection(db, "classes"), where("teacherId", "==", teacherId)),
  );
  return snap.docs.map((d) => d.id);
}

/** Points every class in `classIds` at `teacherId`, in one atomic write. */
export async function assignClasses(classIds, teacherId) {
  if (!classIds.length) return;
  const batch = writeBatch(db);
  classIds.forEach((id) =>
    batch.update(doc(db, "classes", id), { teacherId, updatedAt: serverTimestamp() }),
  );
  await batch.commit();
}

/** Quick picker for an unassigned class. */
export function openAssignTeacherModal(classroom, onDone) {
  const className = classroom.className || "Untitled class";
  if (!state.teachers.length) {
    notify({
      tone: "info",
      title: "No teachers yet",
      message: "Add a teacher account first, then assign this class.",
    });
    return;
  }
  openModal(
    `<div class="assign-teacher">
      <div class="remove-teacher__head">
        <span class="assign-teacher__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" /></svg></span>
        <div>
          <h2>Assign a teacher</h2>
          <p>Choose who will lead this class.</p>
        </div>
      </div>
      <div class="remove-teacher__person">
        <span class="assign-teacher__mark" aria-hidden="true">${escapeHtml(initials(className))}</span>
        <span class="remove-teacher__who">
          <strong>${escapeHtml(className)}</strong>
          <span>${escapeHtml(classroom.section || "Classroom")}</span>
        </span>
        <span class="class-teacher-badge">Needs a teacher</span>
      </div>
      <form id="assign-teacher-form" class="form-card">
        <label>Teacher
          <select name="teacherId" required>
            <option value="" disabled selected>Choose a teacher…</option>
            ${teacherOptions()}
          </select>
        </label>
        <p class="assign-teacher__note">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>
          The students, lesson plan and progress stay with the class. It appears in the teacher's portal right away.
        </p>
        <p class="form-error" id="assign-teacher-error" role="alert"></p>
        <div class="modal-actions">
          <button type="button" class="button secondary" data-cancel>Cancel</button>
          <button type="submit" class="button primary">Assign teacher</button>
        </div>
      </form>
    </div>`,
    (modal, close) => {
      $("[data-cancel]", modal).addEventListener("click", close);
      const form = $("#assign-teacher-form", modal);
      setTimeout(() => $("select", modal).focus(), 50);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const teacherId = new FormData(form).get("teacherId");
        if (!teacherId) return;
        const submit = $("[type=submit]", form);
        submit.disabled = true;
        submit.textContent = "Assigning…";
        try {
          await assignClasses([classroom.id], teacherId);
          close();
          const teacher = state.teachers.find((t) => t.id === teacherId);
          notify({
            tone: "success",
            avatar: initials(teacherLabel(teacher)),
            title: `${className} now has a teacher`,
            message: `Assigned to ${teacherLabel(teacher)}.`,
          });
          await onDone?.();
        } catch (error) {
          $("#assign-teacher-error", modal).textContent = `Couldn't assign the teacher: ${error.message}`;
          submit.disabled = false;
          submit.textContent = "Assign teacher";
        }
      });
    },
  );
}
