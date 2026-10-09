import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state, getAllLessons } from "../../js/state.js";
import { $, escapeHtml, toast, navigate, page } from "../../js/helpers.js";
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
    "Build your lesson plan",
    `Choose lessons from your collection to shape learning in ${classroom.className}.`,
    `<button class="button secondary" id="back-to-class">← Back to class</button>`,
  );
  $("#page-header").classList.add("teacher-add-lesson-header");
  $("#page-content").classList.add("teacher-add-lesson-page");

  $("#page-content").innerHTML = state.allLessons.length
    ? `<form id="link-form" class="lesson-picker">
        <div class="lesson-picker__toolbar">
          <div>
            <span class="lesson-picker__eyebrow">Your collection</span>
            <h2>Choose what to teach</h2>
            <p>Select one or more lessons to add to this class.</p>
          </div>
          <span class="lesson-picker__count"><strong>${state.allLessons.length}</strong> ${state.allLessons.length === 1 ? "lesson" : "lessons"}</span>
        </div>
        <label class="lesson-picker__search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
          <span class="sr-only">Search lessons</span>
          <input type="search" id="lesson-search" placeholder="Search by lesson, activity, or level..." autocomplete="off" />
        </label>
        <div class="lesson-picker__list">${state.allLessons
          .map((l) => {
            const already = linkedIds.has(l.id);
            const activity = l.activityType || "Aralin";
            const difficulty = l.difficulty || "Any level";
            const searchable = `${l.title || ""} ${activity} ${difficulty} ${l.description || ""}`.toLowerCase();
            return `<article class="lesson-picker__row${already ? " is-assigned" : ""}" data-lesson-row data-search="${escapeHtml(searchable)}">
              <label class="lesson-picker__choice">
                <input type="checkbox" name="lesson" value="${escapeHtml(l.id)}" ${already ? "checked disabled" : ""} />
                <span class="lesson-picker__check" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-8"/></svg></span>
                <span class="lesson-picker__details">
                  <strong>${escapeHtml(l.title)}</strong>
                  <span class="lesson-picker__meta">${escapeHtml(activity)} <i></i> ${escapeHtml(difficulty)}</span>
                  ${l.description ? `<span class="lesson-picker__description">${escapeHtml(l.description)}</span>` : ""}
                </span>
              </label>
              <div class="lesson-picker__actions">
                ${already ? `<span class="lesson-picker__assigned"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>In this class</span>` : ""}
                <button type="button" class="lesson-picker__preview" data-view="${escapeHtml(l.id)}">Preview <span aria-hidden="true">↗</span></button>
              </div>
            </article>`;
          })
          .join("")}
          <p class="lesson-picker__no-results" id="lesson-no-results" hidden>No lessons match your search.</p>
        </div>
        <div class="lesson-picker__footer">
          <span><strong id="lesson-selected-count">0</strong> selected</span>
          <button class="button primary" type="submit" id="add-selected-lessons" disabled>Add selected lessons</button>
        </div>
      </form>`
    : `<section class="lesson-picker__empty">
        <div class="lesson-picker__empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M5 4.5v17M9 6h7m-7 4h7"/></svg></div>
        <span class="lesson-picker__eyebrow">Your collection is ready</span>
        <h2>No lessons to add yet</h2>
        <p>Create your first lesson, then return here to add it to ${escapeHtml(classroom.className)}.</p>
        <button class="button primary" id="create-lesson-empty" type="button">Create a lesson</button>
      </section>`;

  $("#back-to-class").addEventListener("click", () =>
    navigate(`/classes/${encodeURIComponent(classId)}`),
  );
  $("#create-lesson-empty")?.addEventListener("click", () =>
    openLessonModal(),
  );

  $("#lesson-search")?.addEventListener("input", (event) => {
    const term = event.currentTarget.value.trim().toLowerCase();
    const rows = [...document.querySelectorAll("[data-lesson-row]")];
    let visible = 0;
    rows.forEach((row) => {
      const matches = row.dataset.search.includes(term);
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    $("#lesson-no-results").hidden = visible !== 0;
  });

  const updateSelection = () => {
    const selected = [...document.querySelectorAll('#link-form input[name="lesson"]:checked:not(:disabled)')].length;
    $("#lesson-selected-count").textContent = selected;
    $("#add-selected-lessons").disabled = selected === 0;
    $("#add-selected-lessons").textContent = selected
      ? `Add ${selected} selected ${selected === 1 ? "lesson" : "lessons"}`
      : "Add selected lessons";
  };
  $("#link-form")?.addEventListener("change", (event) => {
    if (event.target.matches('input[name="lesson"]')) updateSelection();
  });

  // "View" button per lesson row — opens the same lesson modal,
  // pre-filled with that lesson's details.
  document.querySelectorAll("[data-view]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const lesson = state.allLessons.find((l) => l.id === btn.dataset.view);
      if (lesson) openLessonModal(lesson);
    }),
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
      navigate(`/classes/${encodeURIComponent(classId)}`);
    } catch (err) {
      toast(err.message);
    }
  });
}