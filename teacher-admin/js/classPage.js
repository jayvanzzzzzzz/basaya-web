import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { state } from "./state.js";
import { $, escapeHtml, toast, navigate, page, openModal } from "./helpers.js";
import { openClassModal } from "./dashboard.js";

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
        progress.reduce((sum, p) => sum + Number(p.percent || 0), 0) /
          progress.length,
      )
    : 0;
  const linkedLessons = links
    .map((link) => ({
      link,
      lesson: state.allLessons.find((l) => l.id === link.lessonId),
    }))
    .filter((x) => x.lesson);
  page(
    escapeHtml(classroom.className),
    "",
    `<div class="code-stub code-stub--on-canvas" title="Tap to copy"><span class="code-stub__label">Class code</span><code>${escapeHtml(classroom.classCode || "—")}</code><span class="code-stub__hint">Copy</span></div><button class="button secondary" id="edit-class">Edit class</button><button class="button secondary" id="view-students">View Students</button><button class="button primary" id="add-lesson">+ Add lesson</button>`,
  );
  $("#page-content").innerHTML =
    `<div class="grid stats"><div class="card stat"><b>${students.length}</b><span>Students enrolled</span></div><div class="card stat"><b>${linkedLessons.length}</b><span>Lessons assigned</span></div><div class="card stat"><b>${average}%</b><span>Average progress</span></div></div><div class="card"><div class="section-title"><h2>Class lessons</h2><button class="link-button" id="add-lesson-inline">Add lesson</button></div>${linkedLessons.length ? `<div class="list stagger-in">${linkedLessons.map(({ link, lesson }, index) => `<div class="lesson-row"><div><span class="tag">Lesson ${index + 1}</span><h3>${escapeHtml(lesson.title)}</h3><p>${escapeHtml(lesson.description || "No description")}</p></div><button class="link-button danger" data-unlink="${link.id}">Remove</button></div>`).join("")}</div>` : `<p class="muted">No lessons yet. Add one from your library or create it now.</p>`}</div>`;
  $("#edit-class").addEventListener("click", () => openClassModal(classroom));
  $("#view-students").addEventListener("click", () =>
    navigate(`/classes/${classId}/students`),
  );
  const add = () => navigate(`/classes/${classId}/add-lesson`);
  $("#add-lesson").addEventListener("click", add);
  $("#add-lesson-inline")?.addEventListener("click", add);
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
          const value = Math.min(100, Number(p.percent || 0));
          return `<div class="student-row"><div class="student-info"><div class="student-avatar">${escapeHtml((s.displayName || s.name || "S").charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(s.displayName || s.name || "Student")}</strong><p>${escapeHtml(s.email || "")}</p></div></div><div class="progress"><small>${value}%</small><div class="progress-bar"><i style="width:${value}%"></i></div></div></div>`;
        })
        .join("")}</div>`
    : `<p class="muted">Students will appear here once they join with <code>${escapeHtml(classroom.classCode || "—")}</code>.</p>`;
  openModal(
    `<h2>Students</h2><p>${students.length} enrolled in ${escapeHtml(classroom.className)}.</p>${body}`,
  );
}