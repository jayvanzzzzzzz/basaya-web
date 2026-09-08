import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { state } from "./state.js";
import { $, escapeHtml, navigate, page } from "./helpers.js";

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

  students.sort((a, b) => a.displayName.localeCompare(b.displayName));

  page(
    "Students",
    `${students.length} enrolled in ${escapeHtml(classroom.className)}.`,
    `<button class="button secondary" id="back-to-class">← Back to class</button>`,
  );

  const rows = students
    .map((student) => {
      const name = student.fullName || "Student";
      const email = student.email || "No email available";
      const searchable = `${name} ${email}`.toLowerCase();
      const initial = name.trim().charAt(0).toUpperCase() || "S";

      return `
        <article class="student-directory__row" data-student="${escapeHtml(searchable)}">
          <div class="student-directory__identity">
            <div class="student-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
            <div>
              <h3>${escapeHtml(name)}</h3>
              <p>${escapeHtml(email)}</p>
            </div>
          </div>
          <div class="student-directory__actions" aria-label="Student actions">
            <button class="button secondary small" type="button" title="Progress details will be available soon">
              View progress
            </button>
            <button class="icon-button icon-button--danger" type="button" title="Removing students will be available soon" aria-label="Delete ${escapeHtml(name)}">
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </article>`;
    })
    .join("");

  $("#page-content").innerHTML = students.length
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
            <input id="student-search" type="search" placeholder="Search by name or email" autocomplete="off" />
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
      </section>`;

  $("#back-to-class").addEventListener("click", () =>
    navigate(`/classes/${classId}`),
  );

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
}
