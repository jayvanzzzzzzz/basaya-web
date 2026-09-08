import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { state, getAllLessons } from "./state.js";
import { $, escapeHtml, toast, navigate, page, empty } from "./helpers.js";
import { openLessonModal } from "./lessons.js";

export async function renderAddLessonPage(classId) {
  if (!state.user) return navigate("/login");

  const classDoc = await getDoc(doc(db, "classes", classId));
  if (!classDoc.exists() || classDoc.data().teacherId !== state.user.uid)
    return navigate("/dashboard");
  const classroom = { id: classDoc.id, ...classDoc.data() };

  const [linksSnap] = await Promise.all([
    getDocs(collection(db, "classes", classId, "classLessons")),
    getAllLessons(),
  ]);
  const links = linksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const linkedIds = new Set(links.map((l) => l.lessonId));

  page(
    "Add lessons",
    `Choose from every lesson in the collection to add to ${escapeHtml(classroom.className)}.`,
    `<button class="button secondary" id="back-to-class">← Back to class</button>`,
  );

  $("#page-content").innerHTML = state.allLessons.length
    ? `<form id="link-form" class="card">
        <div class="section-title"><h2>All lessons</h2></div>
        <div class="check-list">${state.allLessons
          .map((l) => {
            const already = linkedIds.has(l.id);
            return `<label${already ? ' style="opacity:.55;pointer-events:none;cursor:not-allowed"' : ""}><input type="checkbox" name="lesson" value="${l.id}" ${already ? "checked disabled" : ""} /><span><strong>${escapeHtml(l.title)}</strong><br><small class="muted">${escapeHtml(l.activityType || "Aralin")} · Antas: ${escapeHtml(l.difficulty || "Any level")}${already ? " · Already in this class" : ""}</small></span></label>`;
          })
          .join("")}</div>
        <div class="modal-actions"><button class="button primary" type="submit">Add selected</button></div>
      </form>`
    : empty(
        "No lessons yet",
        "Create a lesson first, then come back to add it to this class.",
        "Create a lesson",
        "create-lesson-empty",
      );

  $("#back-to-class").addEventListener("click", () =>
    navigate(`/classes/${classId}`),
  );
  $("#page-content .empty .button")?.addEventListener("click", () =>
    openLessonModal(),
  );
  $("#link-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ids = new FormData(e.currentTarget)
      .getAll("lesson")
      .filter((id) => !linkedIds.has(id));
    if (!ids.length) return toast("Select at least one new lesson.");
    try {
      await Promise.all(
        ids.map((lessonId, index) =>
          addDoc(collection(db, "classes", classId, "classLessons"), {
            lessonId,
            teacherId: state.user.uid,
            order: links.length + index + 1,
            createdAt: serverTimestamp(),
          }),
        ),
      );
      toast(`${ids.length} lesson${ids.length > 1 ? "s" : ""} added.`);
      navigate(`/classes/${classId}`);
    } catch (err) {
      toast(err.message);
    }
  });
}