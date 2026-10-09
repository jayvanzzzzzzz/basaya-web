import {
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state, getAllTeachers, getAllClasses } from "../../js/state.js";
import {
  $,
  escapeHtml,
  page,
  empty,
  time,
  openModal,
  toast,
} from "../../js/helpers.js";

function closeClassMenus() {
  document.querySelectorAll(".admin-class-menu-popup").forEach((menu) => {
    menu.hidden = true;
    menu
      .closest(".admin-class-menu")
      ?.querySelector(".admin-class-menu-toggle")
      ?.setAttribute("aria-expanded", "false");
  });
}

document.addEventListener("click", (event) => {
  if (
    event.target instanceof Element &&
    !event.target.closest(".admin-class-menu")
  ) {
    closeClassMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeClassMenus();
});

export async function renderClasses() {
  await Promise.all([getAllTeachers(), getAllClasses()]);

  const teacherNameById = new Map(
    state.teachers.map((t) => [t.id, t.displayName || t.email || "Unnamed teacher"]),
  );

  page("All classes", "Every class across the platform, with its teacher.");

  $("#page-content").innerHTML = state.allClasses.length
    ? `<section class="admin-class-directory" aria-label="All classes">
        <div class="admin-class-directory__intro">
          <div>
            <span class="admin-class-directory__eyebrow">Learning spaces</span>
            <h2>Classes across BaSaya</h2>
            <p>A clear view of every classroom and the teacher leading it.</p>
          </div>
          <span class="admin-class-directory__count">
            <strong>${state.allClasses.length}</strong>
            ${state.allClasses.length === 1 ? "class" : "classes"}
          </span>
        </div>
        <label class="admin-directory-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
          <span class="sr-only">Search classes by class name</span>
          <input type="search" id="class-name-search" placeholder="Search by class name..." autocomplete="off" />
        </label>
        <div class="admin-class-table-wrap">
          <table class="table admin-class-table">
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col">Teacher</th>
                <th scope="col">Created</th>
                <th scope="col" aria-label="Class actions"></th>
              </tr>
            </thead>
            <tbody>
              ${state.allClasses
                .map((classroom) => {
                  const className = classroom.className || "Untitled class";
                  const teacherName =
                    teacherNameById.get(classroom.teacherId) || "Unassigned";
                  const initials = className
                    .split(/\s+/)
                    .map((part) => part.charAt(0))
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return `<tr data-class-name="${escapeHtml(className)}">
                    <td>
                      <div class="admin-class-table__identity">
                        <span class="admin-class-table__mark" aria-hidden="true">${escapeHtml(initials || "C")}</span>
                        <span>
                          <strong>${escapeHtml(className)}</strong>
                          <small>${escapeHtml(classroom.section || "Classroom")}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span class="admin-class-table__teacher">
                        <span class="admin-class-table__teacher-dot" aria-hidden="true"></span>
                        ${escapeHtml(teacherName)}
                      </span>
                    </td>
                    <td class="admin-class-table__date">${escapeHtml(time(classroom.createdAt))}</td>
                    <td>
                      <div class="admin-class-menu">
                        <button
                          type="button"
                          class="admin-class-menu-toggle"
                          aria-label="Actions for ${escapeHtml(className)}"
                          aria-haspopup="true"
                          aria-expanded="false"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                        <div class="admin-class-menu-popup" hidden>
                          <button type="button" class="admin-class-menu-item" data-edit-class="${classroom.id}">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" /></svg>
                            <span>Edit class</span>
                          </button>
                          <button type="button" class="admin-class-menu-item admin-class-menu-item--danger" data-delete-class="${classroom.id}">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" /></svg>
                            <span>Delete class</span>
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>`;
                })
                .join("")}
              <tr class="admin-directory-search-empty" hidden>
                <td colspan="4">No classes match that name.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>`
    : empty(
        "No classes yet",
        "Classes will appear here once teachers create them.",
        "Refresh",
        "refresh-classes",
      );

  $("#class-name-search")?.addEventListener("input", (event) => {
    const query = event.currentTarget.value.trim().toLowerCase();
    const rows = [...document.querySelectorAll(".admin-class-table tbody tr[data-class-name]")];
    let visibleCount = 0;
    rows.forEach((row) => {
      const matches = row.dataset.className.toLowerCase().includes(query);
      row.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    const emptyRow = $(".admin-directory-search-empty");
    if (emptyRow) emptyRow.hidden = visibleCount !== 0;
  });

  $("#refresh-classes")?.addEventListener("click", renderClasses);

  state.allClasses.forEach((classroom) => {
    const row = $(`[data-edit-class="${classroom.id}"]`)?.closest("tr");
    const toggle = row?.querySelector(".admin-class-menu-toggle");
    const popup = row?.querySelector(".admin-class-menu-popup");

    toggle?.addEventListener("click", () => {
      const willOpen = popup.hidden;
      closeClassMenus();
      popup.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
    row
      ?.querySelector(`[data-edit-class="${classroom.id}"]`)
      ?.addEventListener("click", () => {
        closeClassMenus();
        openEditClassModal(classroom);
      });
    row
      ?.querySelector(`[data-delete-class="${classroom.id}"]`)
      ?.addEventListener("click", () => {
        closeClassMenus();
        openDeleteClassModal(classroom);
      });
  });
}

function openEditClassModal(classroom) {
  openModal(
    `<h2>Edit class</h2>
     <p>Update the classroom details shown across the platform.</p>
     <form id="edit-class-form" class="form-card">
       <label>Class name<input name="className" required maxlength="100" value="${escapeHtml(classroom.className || "")}" /></label>
       <label>Section<input name="section" maxlength="40" value="${escapeHtml(classroom.section || "")}" placeholder="e.g. Rizal" /></label>
       <label>Description<textarea name="description" maxlength="500" placeholder="A short note about this class">${escapeHtml(classroom.description || "")}</textarea></label>
       <div class="modal-actions">
         <button type="button" class="button secondary" data-cancel>Cancel</button>
         <button class="button primary" type="submit">Save changes</button>
       </div>
     </form>`,
    (modal, close) => {
      modal.querySelector("[data-cancel]").addEventListener("click", close);
      modal
        .querySelector("#edit-class-form")
        .addEventListener("submit", async (event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(event.currentTarget));
          try {
            await updateDoc(doc(db, "classes", classroom.id), {
              className: values.className.trim(),
              section: values.section.trim(),
              description: values.description.trim(),
              updatedAt: serverTimestamp(),
            });
            close();
            toast("Class updated.");
            await renderClasses();
          } catch (error) {
            toast(error.message);
          }
        });
    },
  );
}

function openDeleteClassModal(classroom) {
  openModal(
    `<h2>Delete this class?</h2>
     <p>You're about to remove <strong>${escapeHtml(classroom.className || "Untitled class")}</strong>.</p>
     <p class="muted">The class will no longer appear in the teacher portal. Existing student and lesson records are not deleted automatically.</p>
     <div class="modal-actions">
       <button type="button" class="button secondary" data-cancel>Keep class</button>
       <button type="button" class="button danger" data-confirm-delete>Delete class</button>
     </div>`,
    (modal, close) => {
      modal.querySelector("[data-cancel]").addEventListener("click", close);
      modal
        .querySelector("[data-confirm-delete]")
        .addEventListener("click", async () => {
          try {
            await deleteDoc(doc(db, "classes", classroom.id));
            close();
            toast("Class deleted.");
            await renderClasses();
          } catch (error) {
            toast(error.message);
          }
        });
    },
  );
}
