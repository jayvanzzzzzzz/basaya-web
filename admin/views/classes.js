import {
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
  notify,
  initials,
} from "../../js/helpers.js";
import { paginate } from "../../js/pagination.js";
import {
  openDeleteConfirm,
  refreshDeletionBadge,
  requestChip,
  requestsPanel,
  wireRequestsPanel,
} from "./classDeletion.js";
import {
  isUnassigned,
  openAssignTeacherModal,
  teacherLabel,
  teacherOptions,
} from "./classTeacher.js";

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

const GRADE_LEVELS = ["7", "8", "9", "10"];
const NO_GRADE = "none";
// Kept across re-renders (e.g. after editing a class).
let activeGrade = "all";
let onlyUnassigned = false;

/** The class's grade level, or from older names like "Grade 8 - Rizal". */
function gradeOf(classroom) {
  const stored = String(classroom.gradeLevel ?? "").trim();
  if (stored) return stored;
  return (classroom.className || "").match(/grade\s*(\d{1,2})/i)?.[1] || NO_GRADE;
}

const gradeLabel = (grade) => (grade === NO_GRADE ? "No grade" : `Grade ${grade}`);

function gradeTabs(classes) {
  const counts = new Map();
  classes.forEach((classroom) => {
    const grade = gradeOf(classroom);
    counts.set(grade, (counts.get(grade) || 0) + 1);
  });
  // Grades 7–10 always; any other grade found; "No grade" only when needed.
  const grades = [...new Set([...GRADE_LEVELS, ...counts.keys()])]
    .filter((grade) => grade !== NO_GRADE)
    .sort((a, b) => Number(a) - Number(b));
  if (counts.has(NO_GRADE)) grades.push(NO_GRADE);
  if (activeGrade !== "all" && !grades.includes(activeGrade)) activeGrade = "all";

  const tab = (value, label, count) => `
    <button
      type="button"
      class="admin-class-filter ${activeGrade === value ? "is-active" : ""}"
      data-grade-filter="${escapeHtml(value)}"
      aria-pressed="${activeGrade === value}"
      ${count === 0 ? "data-empty" : ""}
    >
      <span>${escapeHtml(label)}</span>
      <span class="admin-class-filter__count">${count}</span>
    </button>`;

  // Works on top of the grade tabs; only shown while some class has no teacher.
  const unassigned = classes.filter(isUnassigned).length;
  if (!unassigned) onlyUnassigned = false;
  const unassignedToggle = unassigned
    ? `<button
        type="button"
        class="admin-class-filter admin-class-filter--alert ${onlyUnassigned ? "is-active" : ""}"
        data-unassigned-filter
        aria-pressed="${onlyUnassigned}"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" /><path d="M12 10v4M12 16.8v.01" /></svg>
        <span>Needs a teacher</span>
        <span class="admin-class-filter__count">${unassigned}</span>
      </button>`
    : "";

  return `<nav class="admin-class-filters" aria-label="Filter classes by grade level">
    ${tab("all", "All", classes.length)}
    ${grades.map((grade) => tab(grade, gradeLabel(grade), counts.get(grade) || 0)).join("")}
    ${unassignedToggle}
  </nav>`;
}

export async function renderClasses() {
  await Promise.all([getAllTeachers(), getAllClasses()]);

  const teacherNameById = new Map(
    state.teachers.map((t) => [t.id, t.displayName || t.email || "Unnamed teacher"]),
  );

  const classCount = state.allClasses.length;
  const needTeacher = state.allClasses.filter(isUnassigned).length;
  const deletionRequests = state.allClasses.filter((c) => c.deletionRequest).length;
  page(
    "All classes",
    [
      `${classCount} ${classCount === 1 ? "class" : "classes"}`,
      needTeacher && {
        label: `${needTeacher} need${needTeacher === 1 ? "s" : ""} a teacher`,
        tone: "warning",
      },
      deletionRequests && {
        label: `${deletionRequests} deletion request${deletionRequests === 1 ? "" : "s"}`,
        tone: "warning",
      },
    ],
  );

  $("#page-content").innerHTML = state.allClasses.length
    ? `${requestsPanel(state.allClasses, teacherNameById)}
      <section class="admin-class-directory" aria-label="All classes">
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
        ${gradeTabs(state.allClasses)}
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
                  const teacherName = teacherNameById.get(classroom.teacherId);
                  const initials = className
                    .split(/\s+/)
                    .map((part) => part.charAt(0))
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return `<tr data-class-name="${escapeHtml(className)}" data-grade="${escapeHtml(gradeOf(classroom))}" ${teacherName ? "" : "data-unassigned"}>
                    <td>
                      <div class="admin-class-table__identity">
                        <span class="admin-class-table__mark" aria-hidden="true">${escapeHtml(initials || "C")}</span>
                        <span>
                          <strong>${escapeHtml(className)}${requestChip(classroom)}</strong>
                          <small>${escapeHtml(classroom.section || "Classroom")}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      ${
                        teacherName
                          ? `<span class="admin-class-table__teacher">
                              <span class="admin-class-table__teacher-dot" aria-hidden="true"></span>
                              ${escapeHtml(teacherName)}
                            </span>`
                          : `<span class="admin-class-table__unassigned">
                              <span class="class-teacher-badge">Needs a teacher</span>
                              <button type="button" class="class-assign-button" data-assign-class="${escapeHtml(classroom.id)}">Assign</button>
                            </span>`
                      }
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
                          <button type="button" class="admin-class-menu-item" data-edit-class="${escapeHtml(classroom.id)}">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" /></svg>
                            <span>Edit class</span>
                          </button>
                          <button type="button" class="admin-class-menu-item admin-class-menu-item--danger" data-delete-class="${escapeHtml(classroom.id)}">
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

  // Search by name and the grade tab work together.
  const applyFilters = () => {
    const query = ($("#class-name-search")?.value || "").trim().toLowerCase();
    const rows = [...document.querySelectorAll(".admin-class-table tbody tr[data-class-name]")];
    let visibleCount = 0;
    rows.forEach((row) => {
      const matches =
        row.dataset.className.toLowerCase().includes(query) &&
        (activeGrade === "all" || row.dataset.grade === activeGrade) &&
        (!onlyUnassigned || row.hasAttribute("data-unassigned"));
      row.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    const emptyRow = $(".admin-directory-search-empty");
    if (emptyRow) {
      emptyRow.hidden = visibleCount !== 0;
      const inGrade = activeGrade === "all" ? "" : ` in ${gradeLabel(activeGrade)}`;
      emptyRow.querySelector("td").textContent = query
        ? `No classes match that name${inGrade}.`
        : onlyUnassigned
          ? `Every class${inGrade} has a teacher.`
          : `No classes${inGrade} yet.`;
    }
  };

  $("#class-name-search")?.addEventListener("input", applyFilters);
  if (state.allClasses.length) applyFilters();

  const pager = paginate({
    rows: () => [...document.querySelectorAll(".admin-class-table tbody tr[data-class-name]")],
    after: $(".admin-class-table-wrap"),
    search: $("#class-name-search"),
    label: ["class", "classes"],
  });

  document.querySelectorAll("[data-grade-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      activeGrade = button.dataset.gradeFilter;
      document.querySelectorAll("[data-grade-filter]").forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-pressed", String(active));
      });
      closeClassMenus();
      applyFilters();
      pager.reset();
    }),
  );

  $("[data-unassigned-filter]")?.addEventListener("click", (event) => {
    onlyUnassigned = !onlyUnassigned;
    event.currentTarget.classList.toggle("is-active", onlyUnassigned);
    event.currentTarget.setAttribute("aria-pressed", String(onlyUnassigned));
    closeClassMenus();
    applyFilters();
    pager.reset();
  });

  document.querySelectorAll("[data-assign-class]").forEach((button) =>
    button.addEventListener("click", () => {
      const classroom = state.allClasses.find((c) => c.id === button.dataset.assignClass);
      if (classroom) openAssignTeacherModal(classroom, renderClasses);
    }),
  );

  $("#refresh-classes")?.addEventListener("click", renderClasses);

  wireRequestsPanel(state.allClasses, renderClasses);
  refreshDeletionBadge();

  state.allClasses.forEach((classroom) => {
    const editButton = [
      ...document.querySelectorAll("[data-edit-class]"),
    ].find((button) => button.dataset.editClass === classroom.id);
    const deleteButton = [
      ...document.querySelectorAll("[data-delete-class]"),
    ].find((button) => button.dataset.deleteClass === classroom.id);
    const row = editButton?.closest("tr");
    const toggle = row?.querySelector(".admin-class-menu-toggle");
    const popup = row?.querySelector(".admin-class-menu-popup");

    toggle?.addEventListener("click", () => {
      const willOpen = popup.hidden;
      closeClassMenus();
      popup.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
    editButton?.addEventListener("click", () => {
      closeClassMenus();
      openEditClassModal(classroom);
    });
    deleteButton?.addEventListener("click", () => {
      closeClassMenus();
      openDeleteClassModal(classroom);
    });
  });
}

function openEditClassModal(classroom) {
  const unassigned = isUnassigned(classroom);
  openModal(
    `<h2>Edit class</h2>
     <p>Update the classroom details shown across the platform.</p>
     <form id="edit-class-form" class="form-card">
       <label>Class name<input name="className" required data-missing="Give the class a name so teachers and students can find it." maxlength="100" value="${escapeHtml(classroom.className || "")}" /></label>
       <label>Section<input name="section" maxlength="40" value="${escapeHtml(classroom.section || "")}" placeholder="e.g. Rizal" /></label>
       <label>Teacher
         <select name="teacherId">
           ${unassigned ? `<option value="" selected>Unassigned: choose a teacher…</option>` : ""}
           ${teacherOptions(classroom.teacherId)}
         </select>
         <small class="assign-teacher__hint">Changing the teacher moves the whole class: students, lesson plan and progress.</small>
       </label>
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
          const teacherChanged = values.teacherId && values.teacherId !== classroom.teacherId;
          try {
            await updateDoc(doc(db, "classes", classroom.id), {
              className: values.className.trim(),
              section: values.section.trim(),
              description: values.description.trim(),
              ...(teacherChanged ? { teacherId: values.teacherId } : {}),
              updatedAt: serverTimestamp(),
            });
            close();
            if (teacherChanged) {
              const teacher = state.teachers.find((t) => t.id === values.teacherId);
              const name = teacherLabel(teacher);
              notify({
                tone: "success",
                avatar: initials(name),
                title: "Class updated",
                message: `${values.className.trim()} is now led by ${name}.`,
              });
            } else {
              toast("Class updated.");
            }
            await renderClasses();
          } catch (error) {
            toast(error.message);
          }
        });
    },
  );
}

// Same full cleanup as approving a request; the admin types "delete" to confirm.
function openDeleteClassModal(classroom) {
  openDeleteConfirm(classroom, renderClasses);
}
