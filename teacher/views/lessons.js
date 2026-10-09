import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state, getTeacherLessons } from "../../js/state.js";
import { $, $$, escapeHtml, toast, page, empty, openModal } from "../../js/helpers.js";
import { renderRoute } from "../router.js";

const DIFFICULTIES = ["madali", "masusing aralin", "malalim na aralin"];
const MAX_PAGES = 10;
const MAX_QUESTIONS = 20;
const MAX_LEVELS = 10;

export async function renderLibrary() {
  await getTeacherLessons();
  page(
    "Lesson library",
    "Create reusable activities, then add them to any class.",
    `<button class="button primary" id="new-lesson">+ New lesson</button>`,
  );
  $("#page-content").innerHTML = state.lessons.length
    ? `<div class="card list">${state.lessons.map((l) => `<div class="lesson-row"><div><h3>${escapeHtml(l.title)}</h3><p>${escapeHtml(l.description || "No description")}</p><div class="lesson-meta"><span class="tag">${escapeHtml(l.difficulty || "Any level")}</span></div></div><button class="button secondary small" data-edit-lesson="${escapeHtml(l.id)}">Edit</button></div>`).join("")}</div>`
    : empty(
        "Build a reusable lesson",
        "Lessons you create here can be linked to one or more of your classes.",
        "Create a lesson",
        "new-lesson",
      );
  $("#new-lesson")?.addEventListener("click", () => openLessonModal());
  $("#page-content .empty .button")?.addEventListener("click", () =>
    openLessonModal(),
  );
  document
    .querySelectorAll("[data-edit-lesson]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        openLessonModal(
          state.lessons.find((l) => l.id === b.dataset.editLesson),
        ),
      ),
    );
}

function difficultyOptions(selected) {
  return DIFFICULTIES.map(
    (d) =>
      `<option value="${d}" ${d === selected ? "selected" : ""}>${d}</option>`,
  ).join("");
}

// ---------- simple edit form (base fields only) ----------
function editForm(lesson) {
  return `<h2>Edit lesson</h2><p>Update the basic details for this lesson.</p><form id="lesson-form"><label>Lesson title<input name="title" required maxlength="120" value="${escapeHtml(lesson.title)}" /></label><label>Difficulty<select name="difficulty" required>${difficultyOptions(lesson.difficulty)}</select></label><label>Overview<textarea name="description" required>${escapeHtml(lesson.description)}</textarea></label><div class="modal-actions"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary">Save lesson</button></div></form>`;
}

// ---------- full create-lesson builder ----------
function pageBlock(index) {
  return `<div class="card lecture-page" data-page>
    <div class="section-title"><h4>Page ${index + 1}</h4>${index > 0 ? `<button type="button" class="link-button danger" data-remove-page>Remove page</button>` : ""}</div>
    <div class="sentence-list">
      <div class="sentence-row" data-sentence><input type="text" required placeholder="Sentence" /><button type="button" class="link-button danger" data-remove-sentence>✕</button></div>
    </div>
    <button type="button" class="link-button" data-add-sentence>+ Add sentence</button>
  </div>`;
}

function questionBlock(index) {
  return `<div class="card quiz-question" data-question>
    <div class="section-title"><h4>Question ${index + 1}</h4>${index > 0 ? `<button type="button" class="link-button danger" data-remove-question>Remove question</button>` : ""}</div>
    <label>Question<input type="text" required data-question-text placeholder="e.g. Ano ang pangngalan?" /></label>
    <div class="choice-list">
      ${[0, 1, 2]
        .map(
          (i) =>
            `<label class="choice-row"><input type="radio" name="q${index}-answer" value="${i}" ${i === 0 ? "checked" : ""} /><input type="text" required data-choice placeholder="Choice ${i + 1}" /></label>`,
        )
        .join("")}
    </div>
  </div>`;
}

function levelBlock(index) {
  return `<div class="card game-level" data-level>
    <h4>Level ${index + 1}</h4>
    <label>Words (one per line)<textarea required data-level-words rows="4" placeholder="LAMESA&#10;SALA&#10;LASA"></textarea></label>
  </div>`;
}

function createForm() {
  return `<h2>Create a lesson</h2><p>Keep the core activity structured. Rich game builders can sit on top of this model later.</p>
  <form id="lesson-form">
    <label>Lesson title<input name="title" required maxlength="120" placeholder="e.g. Pangngalan" /></label>
    <label>Difficulty<select name="difficulty" required>${difficultyOptions()}</select></label>
    <label>Description<textarea name="description" required placeholder="What will students learn?"></textarea></label>

    <div class="section-title"><h3>Lecture pages</h3></div>
    <div id="lecture-pages">${pageBlock(0)}</div>
    <button type="button" class="link-button" id="add-page">+ Add page</button>

    <div class="section-title"><h3>Quiz</h3></div>
    <div id="quiz-questions">${questionBlock(0)}</div>
    <button type="button" class="link-button" id="add-question">+ Add question</button>

    <div class="section-title"><h3>Game</h3></div>
    <label>Number of levels
      <select id="level-count">${Array.from({ length: MAX_LEVELS }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select>
    </label>
    <div id="game-levels">${levelBlock(0)}</div>

    <div class="modal-actions"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary">Create lesson</button></div>
  </form>`;
}

function wireCreateForm(modal, close, title) {
  const pagesEl = $("#lecture-pages", modal);
  const questionsEl = $("#quiz-questions", modal);
  const levelsEl = $("#game-levels", modal);
  const levelCount = $("#level-count", modal);

  const renumberPages = () =>
    $$(".lecture-page", pagesEl).forEach((el, i) => {
      $("h4", el).textContent = `Page ${i + 1}`;
    });
  const renumberQuestions = () =>
    $$(".quiz-question", questionsEl).forEach((el, i) => {
      $("h4", el).textContent = `Question ${i + 1}`;
    });

  $("#add-page", modal).addEventListener("click", () => {
    if ($$(".lecture-page", pagesEl).length >= MAX_PAGES)
      return toast(`Max ${MAX_PAGES} pages.`);
    pagesEl.insertAdjacentHTML(
      "beforeend",
      pageBlock($$(".lecture-page", pagesEl).length),
    );
  });

  $("#add-question", modal).addEventListener("click", () => {
    if ($$(".quiz-question", questionsEl).length >= MAX_QUESTIONS)
      return toast(`Max ${MAX_QUESTIONS} questions.`);
    const idx = $$(".quiz-question", questionsEl).length;
    questionsEl.insertAdjacentHTML("beforeend", questionBlock(idx));
    // fix radio group name to match its new index
    const added = questionsEl.lastElementChild;
    $$("input[type=radio]", added).forEach(
      (r) => (r.name = `q${idx}-answer`),
    );
  });

  levelCount.addEventListener("change", () => {
    const n = Number(levelCount.value);
    levelsEl.innerHTML = Array.from({ length: n }, (_, i) => levelBlock(i)).join(
      "",
    );
  });

  modal.addEventListener("click", (e) => {
    if (e.target.matches("[data-add-sentence]")) {
      const page = e.target.closest("[data-page]");
      page
        .querySelector(".sentence-list")
        .insertAdjacentHTML(
          "beforeend",
          `<div class="sentence-row" data-sentence><input type="text" required placeholder="Sentence" /><button type="button" class="link-button danger" data-remove-sentence>✕</button></div>`,
        );
    }
    if (e.target.matches("[data-remove-sentence]")) {
      const list = e.target.closest(".sentence-list");
      if (list.querySelectorAll("[data-sentence]").length > 1)
        e.target.closest("[data-sentence]").remove();
      else toast("A page needs at least one sentence.");
    }
    if (e.target.matches("[data-remove-page]")) {
      e.target.closest("[data-page]").remove();
      renumberPages();
    }
    if (e.target.matches("[data-remove-question]")) {
      e.target.closest("[data-question]").remove();
      renumberQuestions();
    }
  });

  $("[data-close]", modal).onclick = close;

  $("#lesson-form", modal).onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));

    // ---- collect + validate lecture pages ----
    const pages = [];
    for (const [i, pageEl] of $$(".lecture-page", pagesEl).entries()) {
      const sentences = $$("[data-sentence] input", pageEl)
        .map((inp) => inp.value.trim())
        .filter(Boolean);
      if (!sentences.length) return toast(`Page ${i + 1} needs at least one sentence.`);
      const audioResNames = sentences.map(
        (_, sIdx) => `page${i + 1}_sentence${sIdx + 1}`,
      );
      pages.push({ pageNumber: i + 1, sentences, audioResNames });
    }

    // ---- collect + validate quiz questions ----
    const questions = [];
    for (const [i, qEl] of $$(".quiz-question", questionsEl).entries()) {
      const questionText = $("[data-question-text]", qEl).value.trim();
      const choices = $$("[data-choice]", qEl).map((inp) => inp.value.trim());
      if (!questionText || choices.some((c) => !c))
        return toast(`Question ${i + 1} is incomplete.`);
      const checked = $(`input[name="q${i}-answer"]:checked`, qEl);
      questions.push({
        question: questionText,
        choices,
        answer: Number(checked.value),
      });
    }

    // ---- collect + validate game levels ----
    const levels = [];
    for (const [i, lvlEl] of $$(".game-level", levelsEl).entries()) {
      const words = $("[data-level-words]", lvlEl)
        .value.split("\n")
        .map((w) => w.trim())
        .filter(Boolean);
      if (!words.length) return toast(`Level ${i + 1} needs at least one word.`);
      levels.push({ level: i + 1, order: i + 1, words });
    }

    try {
      const lessonRef = await addDoc(collection(db, "lessons"), {
        title: values.title,
        description: values.description,
        difficulty: values.difficulty,
        teacherId: state.user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, "lessons", lessonRef.id, "lecture"), {
        title: values.title,
        pages,
      });

      await addDoc(collection(db, "lessons", lessonRef.id, "quiz"), {
        title: `${values.title} - Pagsusulit`,
        questions,
      });

      await Promise.all(
        levels.map((lvl) =>
          addDoc(collection(db, "lessons", lessonRef.id, "game"), lvl),
        ),
      );

      close();
      toast("Lesson saved to your library.");
      await renderRoute();
    } catch (err) {
      toast(err.message);
    }
  };
}

function wireEditForm(modal, close, existing) {
  $("[data-close]", modal).onclick = close;
  $("#lesson-form", modal).onsubmit = async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await updateDoc(doc(db, "lessons", existing.id), {
        ...values,
        updatedAt: serverTimestamp(),
      });
      close();
      toast("Lesson updated.");
      await renderRoute();
    } catch (err) {
      toast(err.message);
    }
  };
}

export function openLessonModal(existing) {
  if (existing) {
    openModal(editForm(existing), (modal, close) =>
      wireEditForm(modal, close, existing),
    );
  } else {
    openModal(createForm(), (modal, close) => wireCreateForm(modal, close));
  }
}