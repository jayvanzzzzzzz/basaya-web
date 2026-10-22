import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state, getAllLessons } from "../../js/state.js";
import { $, escapeHtml, toast, navigate, page, openModal } from "../../js/helpers.js";
import {
  readSchedule,
  notifyStudents,
  linkLessonId,
  linkMode,
  practiceLinkId,
} from "../../js/schedule.js";
import { paginate } from "../../js/pagination.js";
import { openLessonModal, DIFFICULTY_LABELS } from "./lessons.js";
import { openLessonViewer } from "../../admin/views/lessonViewer.js";

const MODE_LABEL = { assessment: "Assessment", practice: "Practice" };
const CHECK_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>';
const EYE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const lessonsLabel = (n) => `${n} ${n === 1 ? "lesson" : "lessons"}`;

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
  // A lesson can be in the class once as an Assessment and once as Practice.
  const inClass = { assessment: new Set(), practice: new Set() };
  links.forEach((link) => inClass[linkMode(link)].add(linkLessonId(link)));
  /** "In this class" chips under the title: which type(s) the lesson is already in. */
  const assignedChips = (lessonId) => {
    const modes = ["assessment", "practice"].filter((mode) => inClass[mode].has(lessonId));
    if (!modes.length) return "";
    return `<span class="lesson-picker__in-class" aria-label="Already in this class as ${modes.map((m) => MODE_LABEL[m]).join(" and ")}">${modes
      .map((mode) => `<span class="lesson-picker__assigned">${CHECK_ICON}${MODE_LABEL[mode]}</span>`)
      .join("")}</span>`;
  };

  // Level ribbons: All, then each level (lessons with no level only show under All).
  const levels = [
    { id: "all", label: "All", count: state.allLessons.length },
    ...Object.entries(DIFFICULTY_LABELS).map(([key, label]) => ({
      id: key,
      label,
      count: state.allLessons.filter((l) => l.difficulty === key).length,
    })),
  ];
  let selectedLevel = "all";

  page(
    "Add lessons",
    `Pick lessons from your collection for ${classroom.className}`,
    "",
    {
      crumbs: [
        { label: "Classrooms", href: "#/dashboard" },
        { label: classroom.className, href: `#/classes/${encodeURIComponent(classId)}` },
      ],
    },
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
        <div class="lesson-picker__ribbons" role="group" aria-label="Show lessons by level">
          ${levels
            .map(
              (level) => `<button type="button" class="lesson-picker__ribbon" data-level="${escapeHtml(level.id)}" aria-pressed="${level.id === selectedLevel}">
                <span>${escapeHtml(level.label)}</span>
                <span class="lesson-picker__ribbon-count" aria-label="${lessonsLabel(level.count)}">${level.count}</span>
              </button>`,
            )
            .join("")}
        </div>
        <div class="lesson-picker__list">${[...state.allLessons]
          // A–Z by title ("aralin 2" before "aralin 10"); a copy, so the shared list keeps its order.
          .sort((a, b) =>
            (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base", numeric: true }),
          )
          .map((l) => {
            // Both types already in: nothing left to add.
            const already = inClass.assessment.has(l.id) && inClass.practice.has(l.id);
            const activity = l.activityType || "Aralin";
            const difficulty = DIFFICULTY_LABELS[l.difficulty] || l.difficulty || "Any level";
            const searchable = `${l.title || ""} ${activity} ${difficulty} ${l.description || ""}`.toLowerCase();
            return `<article class="lesson-picker__row${already ? " is-assigned" : ""}" data-lesson-row data-level="${escapeHtml(l.difficulty || "")}" data-search="${escapeHtml(searchable)}">
              <label class="lesson-picker__choice">
                <input type="checkbox" name="lesson" value="${escapeHtml(l.id)}" ${already ? "checked disabled" : ""} />
                <span class="lesson-picker__check" aria-hidden="true">${CHECK_ICON}</span>
                <span class="lesson-picker__details">
                  <strong>${escapeHtml(l.title)}</strong>
                  <span class="lesson-picker__meta">${escapeHtml(activity)} <i></i> ${escapeHtml(difficulty)}</span>
                  ${l.description ? `<span class="lesson-picker__description">${escapeHtml(l.description)}</span>` : ""}
                  ${assignedChips(l.id)}
                </span>
              </label>
              <button type="button" class="lesson-picker__preview" data-view="${escapeHtml(l.id)}" aria-label="Preview ${escapeHtml(l.title)}">${EYE_ICON}Preview</button>
            </article>`;
          })
          .join("")}
          <p class="lesson-picker__no-results" id="lesson-no-results" hidden>No lessons match your search.</p>
        </div>
        <div class="lesson-picker__footer">
          <span class="lesson-picker__selected"><strong id="lesson-selected-count">0</strong> selected</span>
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

  $("#create-lesson-empty")?.addEventListener("click", () =>
    openLessonModal(),
  );
  if (!state.allLessons.length) return;

  // Rows show when they're in the selected level and match the search.
  const applyFilters = () => {
    const term = $("#lesson-search").value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll("[data-lesson-row]").forEach((row) => {
      const matches =
        row.dataset.search.includes(term) &&
        (selectedLevel === "all" || row.dataset.level === selectedLevel);
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    const noResults = $("#lesson-no-results");
    noResults.hidden = visible !== 0;
    noResults.textContent = term
      ? "No lessons match your search."
      : `No ${levels.find((level) => level.id === selectedLevel).label} lessons in your collection yet.`;
  };
  // Registered before paginate(), so rows are already hidden when it counts.
  $("#lesson-search").addEventListener("input", applyFilters);

  const pager = paginate({
    rows: () => [...document.querySelectorAll("[data-lesson-row]")],
    after: $(".lesson-picker__list"),
    search: $("#lesson-search"),
    label: ["lesson", "lessons"],
  });

  // Picking a level keeps the search text and goes back to page 1.
  $(".lesson-picker__ribbons").addEventListener("click", (event) => {
    const button = event.target.closest(".lesson-picker__ribbon");
    if (!button || button.dataset.level === selectedLevel) return;
    selectedLevel = button.dataset.level;
    document.querySelectorAll(".lesson-picker__ribbon").forEach((ribbon) =>
      ribbon.setAttribute("aria-pressed", String(ribbon.dataset.level === selectedLevel)),
    );
    applyFilters();
    pager.reset();
  });

  /** Lessons the teacher ticked (not the ones already in the class as both types). */
  const pickedIds = () =>
    [...document.querySelectorAll('#link-form input[name="lesson"]:checked:not(:disabled)')].map((box) => box.value);
  const updateSelection = () => {
    const selected = pickedIds().length;
    $("#lesson-selected-count").textContent = selected;
    $("#add-selected-lessons").disabled = selected === 0;
    $("#add-selected-lessons").textContent = selected
      ? `Add ${selected} selected ${selected === 1 ? "lesson" : "lessons"}…`
      : "Add selected lessons";
  };
  $("#link-form").addEventListener("change", (event) => {
    if (event.target.matches('input[name="lesson"]')) updateSelection();
  });
  updateSelection();

  // "Preview" per lesson row: the admin's read-only lesson viewer, without its Edit button.
  document.querySelectorAll("[data-view]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const lesson = state.allLessons.find((l) => l.id === btn.dataset.view);
      if (lesson) openLessonViewer(lesson);
    }),
  );

  // Lesson type and schedule are picked in a pop-up after "Add selected lessons…".
  // What was picked there is kept for the next time it opens.
  const settings = { mode: "assessment", openAt: "", dueAt: "" };
  $("#link-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const ids = pickedIds();
    if (!ids.length) return toast("Select at least one new lesson.");
    openAddModal(ids);
  });

  function openAddModal(ids) {
    const toAdd = (mode) => ids.filter((id) => !inClass[mode].has(id));
    // If every picked lesson is already in as the remembered type, start on the other one.
    if (!toAdd(settings.mode).length) settings.mode = settings.mode === "practice" ? "assessment" : "practice";

    openModal(
      `<h2>Add ${lessonsLabel(ids.length)}</h2>
       <p>Choose how ${ids.length === 1 ? "it counts" : "they count"} and when students can open ${ids.length === 1 ? "it" : "them"}.</p>
       <form id="add-lessons-form" class="lesson-add-form">
         <fieldset class="lesson-mode">
           <legend>Lesson type</legend>
           <div class="lesson-mode__options">
             ${["assessment", "practice"]
               .map(
                 (mode) => `<label class="lesson-mode__option">
                   <input type="radio" name="mode" value="${mode}" ${mode === settings.mode ? "checked" : ""} />
                   <span><strong>${MODE_LABEL[mode]}</strong><small>${
                     mode === "assessment"
                       ? "Scores are saved and count in reports"
                       : "Students can retry anytime; nothing is saved"
                   }</small></span>
                 </label>`,
               )
               .join("")}
           </div>
           <p class="lesson-schedule__hint">This can't be changed after the lesson is added. A lesson already in this class can be added again as the other type.</p>
           <p class="lesson-add-form__skipped" id="add-lessons-skipped" hidden></p>
         </fieldset>
         <fieldset class="lesson-schedule">
           <legend>Schedule <span>optional</span></legend>
           <label>Opens on
             <input type="datetime-local" name="openAt" value="${escapeHtml(settings.openAt)}" />
           </label>
           <label>Due on
             <input type="datetime-local" name="dueAt" value="${escapeHtml(settings.dueAt)}" />
           </label>
           <p class="lesson-schedule__hint">Leave empty to open right away with no deadline. Students are notified when you add the lesson.</p>
         </fieldset>
         <div class="modal-actions">
           <button class="button secondary" type="button" data-cancel>Cancel</button>
           <button class="button primary" type="submit" data-confirm>Add</button>
         </div>
       </form>`,
      (backdrop, close) => {
        const form = backdrop.querySelector("#add-lessons-form");
        const submit = form.querySelector("[data-confirm]");
        const selectedMode = () => (form.elements.mode.value === "practice" ? "practice" : "assessment");

        // Lessons already in the class as the chosen type are skipped; say which.
        const sync = () => {
          const mode = selectedMode();
          settings.mode = mode;
          settings.openAt = form.elements.openAt.value;
          settings.dueAt = form.elements.dueAt.value;
          const adding = toAdd(mode).length;
          const skipped = ids.filter((id) => inClass[mode].has(id));
          const note = form.querySelector("#add-lessons-skipped");
          note.hidden = !skipped.length;
          if (skipped.length) {
            const titles = skipped
              .map((id) => `“${escapeHtml(state.allLessons.find((l) => l.id === id)?.title || "Untitled")}”`)
              .join(", ");
            note.innerHTML = `${titles} ${skipped.length === 1 ? "is" : "are"} already in this class as ${MODE_LABEL[mode]} and will be skipped.`;
          }
          submit.disabled = adding === 0;
          submit.textContent = adding ? `Add ${lessonsLabel(adding)}` : "Nothing to add";
        };
        form.addEventListener("change", sync);
        form.addEventListener("input", sync);
        sync();
        backdrop.querySelector("[data-cancel]").addEventListener("click", close);

        // While saving: the Add button spins with what it's doing, and nothing else can be
        // changed or closed. setBusy(null) puts the form back after a failed save.
        const setBusy = (label) => {
          const busy = Boolean(label);
          submit.setAttribute("aria-busy", String(busy));
          form.querySelectorAll("input, button").forEach((field) => (field.disabled = busy));
          backdrop.querySelector(".modal-close").disabled = busy;
          if (busy) submit.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${escapeHtml(label)}`;
          else sync();
        };

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          // Practice: students can redo it, nothing is saved, and reports leave it out.
          const mode = selectedMode();
          const adding = toAdd(mode);
          if (!adding.length) return;
          const schedule = readSchedule(form);
          if (schedule.error) return toast(schedule.error);

          setBusy(`Adding ${lessonsLabel(adding.length)}…`);
          const linkIds = [];
          try {
            // An Assessment link's id is the lesson id, so Firestore rules can look up its
            // schedule; a Practice link is "{lessonId}__practice" so both can be in the class.
            const batch = writeBatch(db);
            adding.forEach((lessonId, index) => {
              const linkId = mode === "practice" ? practiceLinkId(lessonId) : lessonId;
              // A Practice link saved under the lesson id (before both could be added) moves aside.
              const occupant = links.find((link) => link.id === lessonId && linkMode(link) === "practice");
              if (mode === "assessment" && occupant) {
                const { id, ...data } = occupant;
                batch.set(doc(db, "classes", classId, "classLessons", practiceLinkId(lessonId)), { ...data, lessonId });
              }
              linkIds.push(linkId);
              batch.set(doc(db, "classes", classId, "classLessons", linkId), {
                lessonId,
                teacherId: state.user.uid,
                order: links.length + index + 1,
                createdAt: serverTimestamp(),
                openAt: schedule.openAt,
                dueAt: schedule.dueAt,
                mode,
                notifyPending: true,
              });
            });
            await batch.commit();
          } catch (err) {
            setBusy(null);
            return toast(err.message);
          }

          // Saved; the button keeps spinning until the students are notified.
          const added = `${adding.length} lesson${adding.length > 1 ? "s" : ""} added`;
          setBusy("Notifying students…");
          try {
            await notifyStudents(classId, linkIds);
            toast(`${added}. Students were notified.`);
          } catch (err) {
            console.error("notifyStudents failed —", err);
            toast(`${added}, but students were not notified (${err.message}).`);
          }
          close();
          navigate(`/classes/${encodeURIComponent(classId)}`);
        });
      },
      // The picks stay on the page and the settings are remembered, so closing loses nothing.
      { closeOnBackdrop: false },
    );
  }
}
