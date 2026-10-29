import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state } from "../../js/state.js";
import { $, escapeHtml, navigate, page, openModal, toast } from "../../js/helpers.js";
import { paginate } from "../../js/pagination.js";
import { removeStudent } from "../../js/api.js";
import { leaveChip, leaveRequestsPanel, wireLeaveRequests } from "./leaveRequests.js";

export async function renderStudentsPage(classId) {
  const classDoc = await getDoc(doc(db, "classes", classId));
  if (!classDoc.exists() || classDoc.data().teacherId !== state.user.uid) {
    return navigate("/dashboard");
  }

  const classroom = { id: classDoc.id, ...classDoc.data() };
  const studentsSnap = await getDocs(
    collection(db, "classes", classId, "students"),
  );
  const students = studentsSnap.docs
    .map((studentDoc) => ({
      id: studentDoc.id,
      ...studentDoc.data(),
    }))
    .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

  page(
    "Students",
    `${students.length} enrolled in ${classroom.className}`,
    "",
    {
      crumbs: [
        { label: "Classrooms", href: "#/dashboard" },
        { label: classroom.className, href: `#/classes/${encodeURIComponent(classId)}` },
      ],
    },
  );

  const rows = students
    .map((student) => {
      const name = student.fullName || "Student";
      const initial = name.trim().charAt(0).toUpperCase() || "S";

      return `
        <article class="student-directory__row" data-student="${escapeHtml(name.toLowerCase())}">
          <div class="student-directory__identity">
            <div class="student-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
            <div>
              <h3>${escapeHtml(name)}${leaveChip(student)}</h3>
            </div>
          </div>
          <div class="student-directory__actions">
            <button class="icon-button--menu" type="button" data-student-menu-toggle aria-label="Actions for ${escapeHtml(name)}" aria-haspopup="true" aria-expanded="false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
            </button>
            <div class="class-card-menu-popup" data-student-menu hidden>
              <button type="button" data-view-progress="${escapeHtml(student.id)}">View progress</button>
              <button class="danger" type="button" data-remove-student="${escapeHtml(student.id)}">Remove from class</button>
            </div>
          </div>
        </article>`;
    })
    .join("");

  $("#page-content").innerHTML = leaveRequestsPanel(students) + (students.length
    ? `
      <section class="student-directory card">
        <div class="student-directory__toolbar">
          <div>
            <p class="eyebrow">Class roster</p>
            <h2>Everyone in this class</h2>
          </div>
          <label class="student-search">
            <span class="sr-only">Search students</span>
            <span aria-hidden="true">⌕</span>
            <input id="student-search" type="search" placeholder="Search by name" autocomplete="off" />
          </label>
        </div>
        <div class="student-directory__list stagger-in">${rows}</div>
        <p id="student-no-results" class="student-directory__empty" hidden>No students match that search.</p>
      </section>`
    : `
      <section class="card empty student-empty">
        <p class="eyebrow">Class roster</p>
        <h3>No students yet</h3>
        <p>Students will appear here after they join this class using the class code.</p>
        <code>${escapeHtml(classroom.classCode || "—")}</code>
      </section>`);

  wireLeaveRequests(classroom, students, () => renderStudentsPage(classId));

  $("#student-search")?.addEventListener("input", (event) => {
    const term = event.currentTarget.value.trim().toLowerCase();
    const rows = [...document.querySelectorAll("[data-student]")];
    let visible = 0;

    rows.forEach((row) => {
      const matches = row.dataset.student.includes(term);
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    $("#student-no-results").hidden = visible !== 0;
  });

  if (students.length) {
    paginate({
      rows: () => [...document.querySelectorAll("[data-student]")],
      after: $(".student-directory__list"),
      search: $("#student-search"),
      label: ["student", "students"],
    });
  }

  document.querySelectorAll("[data-student-menu-toggle]").forEach((button) =>
    button.addEventListener("click", () => {
      const popup = button.nextElementSibling;
      document.querySelectorAll("[data-student-menu]").forEach((menu) => {
        if (menu !== popup) {
          menu.hidden = true;
          menu.previousElementSibling.setAttribute("aria-expanded", "false");
        }
      });
      popup.hidden = !popup.hidden;
      button.setAttribute("aria-expanded", String(!popup.hidden));
    }),
  );

  document.querySelectorAll("[data-view-progress]").forEach((button) =>
    button.addEventListener("click", () =>
      navigate(
        `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(button.dataset.viewProgress)}`,
      ),
    ),
  );

  document.querySelectorAll("[data-remove-student]").forEach((button) =>
    button.addEventListener("click", () => {
      const student = students.find((item) => item.id === button.dataset.removeStudent);
      if (student) openRemoveStudentModal(classroom, student);
    }),
  );
}

function openRemoveStudentModal(classroom, student) {
  const name = student.fullName || "this student";
  openModal(
    `<h2>Remove ${escapeHtml(name)}?</h2>
     <p>They'll be taken out of <strong>${escapeHtml(classroom.className)}</strong>, and their progress in this class will be deleted:</p>
     <ul class="remove-student__list">
       <li>Lesson progress and scores for this class's lessons</li>
       <li>Their skill summary and class link in the app</li>
     </ul>
     <p class="muted">Their account stays. They can join again with the class code, starting fresh. This can't be undone.</p>
     <p class="form-error" id="remove-student-error" role="alert"></p>
     <div class="modal-actions">
       <button type="button" class="button secondary" data-cancel>Keep student</button>
       <button type="button" class="button danger" data-confirm-remove>Remove student</button>
     </div>`,
    (modal, close) => {
      $("[data-cancel]", modal).addEventListener("click", close);
      const confirmButton = $("[data-confirm-remove]", modal);
      confirmButton.addEventListener("click", async () => {
        confirmButton.disabled = true;
        confirmButton.textContent = "Removing…";
        try {
          await removeStudent(classroom.id, student.id);
          close();
          toast(`${name} was removed from the class.`);
          await renderStudentsPage(classroom.id);
        } catch (error) {
          $("#remove-student-error", modal).textContent = `Couldn't remove the student: ${error.message}.`;
          confirmButton.disabled = false;
          confirmButton.textContent = "Remove student";
        }
      });
    },
  );
}
