import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state } from "../../js/state.js";
import { $, escapeHtml, toast, navigate, page, openModal } from "../../js/helpers.js";
import { openClassModal } from "./dashboard.js";

const progressPercent = (percent) => {
  const value = Number(percent);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
};

export async function renderClass(classId) {
  const classDoc = await getDoc(doc(db, "classes", classId));
  if (!classDoc.exists() || classDoc.data().teacherId !== state.user.uid)
    return navigate("/dashboard");
  const classroom = { id: classDoc.id, ...classDoc.data() };
  const runRead = async (label, promise) => {
    try {
      return await promise;
    } catch (err) {
      console.error(
        `renderClass: "${label}" read failed —`,
        err.code || err.message,
      );
      throw err;
    }
  };
  const [studentsSnap, linksSnap, progressSnap] = await Promise.all([
    runRead(
      "students",
      getDocs(collection(db, "classes", classId, "students")),
    ),
    runRead(
      "classLessons",
      getDocs(collection(db, "classes", classId, "classLessons")),
    ),
    runRead(
      "progress",
      getDocs(
        query(
          collection(db, "progress"),
          where("teacherId", "==", state.user.uid),
        ),
      ),
    ),
  ]);
  const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const links = linksSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const progress = progressSnap.docs
    .map((d) => d.data())
    .filter((item) => item.classId === classId);
  const average = progress.length
    ? Math.round(
        progress.reduce((sum, item) => sum + progressPercent(item.percent), 0) /
          progress.length,
      )
    : 0;
  const linkedLessons = links
    .map((link) => ({
      link,
      lesson: state.allLessons.find((l) => l.id === link.lessonId),
    }))
    .filter((x) => x.lesson);
  const subtitle =
    classroom.description ||
    "A clear view of your students, lessons, and classroom progress.";
  page(
    classroom.className,
    subtitle,
    `<button class="button secondary class-back-button" id="all-classrooms" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>All classrooms</button><button class="button secondary" id="edit-class">Edit class</button><button class="button secondary" id="view-students">View students</button><button class="button primary" id="add-lesson">+ Add lesson</button>`,
  );
  $("#page-header").classList.add("teacher-class-header");
  $("#page-content").classList.add("teacher-class-page");
  $("#page-content").innerHTML = `
    <section class="class-overview" aria-label="Class overview">
      <div class="class-overview__identity">
        <span class="class-overview__eyebrow">Classroom overview</span>
        <div class="class-overview__code code-stub code-stub--on-canvas" title="Tap to copy">
          <span class="code-stub__label">Class code</span>
          <code>${escapeHtml(classroom.classCode || "—")}</code>
          <span class="code-stub__hint">Copy</span>
        </div>
      </div>
      <div class="grid stats class-overview__stats" aria-label="Class statistics">
        <div class="card stat class-overview__stat">
          <span class="class-overview__stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19v-1.2a5.5 5.5 0 0 1 11 0V19M16 5.3a3.2 3.2 0 0 1 0 6.1m1.2 2.2a4.7 4.7 0 0 1 3.3 4.5V19"/></svg></span>
          <b>${students.length}</b><span>Students enrolled</span>
        </div>
        <div class="card stat class-overview__stat">
          <span class="class-overview__stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M5 4.5v17M9 6h7m-7 4h7"/></svg></span>
          <b>${linkedLessons.length}</b><span>Lessons assigned</span>
        </div>
        <div class="card stat class-overview__stat class-overview__stat--progress">
          <span class="class-overview__stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 18V9m5 9V5m5 13v-6m5 6V3"/></svg></span>
          <b>${average}%</b><span>Average progress</span>
          <span class="class-overview__progress-track" aria-hidden="true"><i style="width:${average}%"></i></span>
        </div>
      </div>
    </section>
    <section class="class-lessons" aria-labelledby="class-lessons-title">
      <div class="class-lessons__header">
        <div>
          <span class="class-lessons__eyebrow">Learning plan</span>
          <h2 id="class-lessons-title">Assigned lessons</h2>
          <p>Keep the class moving, one lesson at a time.</p>
        </div>
        <button class="button secondary" id="add-lesson-inline" type="button">+ Add lesson</button>
      </div>
      ${
        linkedLessons.length
          ? `<div class="class-lessons__list stagger-in">${linkedLessons
              .map(
                ({ link, lesson }, index) => `
                  <article class="class-lesson">
                    <span class="class-lesson__number">${String(index + 1).padStart(2, "0")}</span>
                    <div class="class-lesson__content">
                      <span class="class-lesson__label">Lesson ${index + 1}</span>
                      <h3>${escapeHtml(lesson.title)}</h3>
                      <p>${escapeHtml(lesson.description || "No description provided.")}</p>
                    </div>
                    <button class="class-lesson__remove" type="button" data-unlink="${escapeHtml(link.id)}" aria-label="Remove ${escapeHtml(lesson.title)} from class">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
                      <span>Remove</span>
                    </button>
                  </article>`,
              )
              .join("")}</div>`
          : `<div class="class-lessons__empty">
              <div class="class-lessons__empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M5 4.5v17M9 6h7m-7 4h7"/></svg></div>
              <h3>No lessons assigned yet</h3>
              <p>Add a lesson from your library to start building this class’s learning plan.</p>
              <button class="button primary" id="add-lesson-empty" type="button">Choose a lesson</button>
            </div>`
      }
    </section>
  `;
  $("#all-classrooms").addEventListener("click", () => navigate("/dashboard"));
  $("#edit-class").addEventListener("click", () => openClassModal(classroom));
  $("#view-students").addEventListener("click", () =>
    navigate(`/classes/${encodeURIComponent(classId)}/students`),
  );
  const add = () =>
    navigate(`/classes/${encodeURIComponent(classId)}/add-lesson`);
  $("#add-lesson").addEventListener("click", add);
  $("#add-lesson-inline")?.addEventListener("click", add);
  $("#add-lesson-empty")?.addEventListener("click", add);
  document.querySelectorAll("[data-unlink]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Remove this lesson from the class?")) return;
      await deleteDoc(
        doc(db, "classes", classId, "classLessons", b.dataset.unlink),
      );
      toast("Lesson removed from class.");
      renderClass(classId);
    }),
  );
}

export function openStudentsModal(classroom, students, progress) {
  const body = students.length
    ? `<div class="list stagger-in">${students
        .map((s) => {
          const p = progress.find((x) => x.studentId === s.id) || {};
          const value = progressPercent(p.percent);
          return `<div class="student-row"><div class="student-info"><div class="student-avatar">${escapeHtml((s.displayName || s.name || "S").charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(s.displayName || s.name || "Student")}</strong><p>${escapeHtml(s.email || "")}</p></div></div><div class="progress"><small>${value}%</small><div class="progress-bar"><i style="width:${value}%"></i></div></div></div>`;
        })
        .join("")}</div>`
    : `<p class="muted">Students will appear here once they join with <code>${escapeHtml(classroom.classCode || "—")}</code>.</p>`;
  openModal(
    `<h2>Students</h2><p>${students.length} enrolled in ${escapeHtml(classroom.className)}.</p>${body}`,
  );
}