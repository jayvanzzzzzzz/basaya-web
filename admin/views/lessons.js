import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { generateSpeech, saveSpeech } from "../../js/tts.js";
import { state, getAllClasses, getAllLessons } from "../../js/state.js";
import {
  $,
  $$,
  empty,
  escapeHtml,
  openModal,
  page,
  safeHttpUrl,
  toast,
} from "../../js/helpers.js";
import { paginate } from "../../js/pagination.js";
import {
  gameLevelHtml,
  readGameLevels,
  refreshLevel,
  validateGameLevels,
  wireGameLevels,
  wordsFromText,
} from "./gameLevels.js";
import { openLessonViewer, loadLessonSections as getLessonSections } from "./lessonViewer.js";
import { openDeleteLesson } from "./lessonDeletion.js";
import { confirmDuplicateTitle, findDuplicate, sameTitle } from "./duplicateTitle.js";

const DIFFICULTIES = ["madali", "masusing aralin", "malalim na aralin"];
const MAX_SENTENCES_PER_LECTURE_PAGE = 4;
const MAX_AUDIO_GENERATIONS_PER_SENTENCE = 5;
const previews = new WeakMap();

function lessonDifficultyMeta(level = "") {
  const value = String(level).trim().toLowerCase();

  if (value.includes("malalim")) {
    return {
      label: "Advanced",
      className: "difficulty--advanced",
      accent: "#7c3aed",
    };
  }

  if (value.includes("masusing")) {
    return {
      label: "Intermediate",
      className: "difficulty--intermediate",
      accent: "#f59e0b",
    };
  }

  return {
    label: "Beginner",
    className: "difficulty--beginner",
    accent: "#16a34a",
  };
}

let activeLessonFilter = "all";
let activeLessonSearch = "";
// Pagination survives the directory re-rendering on each search/filter change.
let lessonPage = 1;
let lessonPageSize = 10;

function closeLessonMenus() {
  document.querySelectorAll(".admin-lesson-menu-popup").forEach((menu) => {
    menu.hidden = true;
    menu
      .closest(".admin-lesson-menu")
      ?.querySelector(".admin-lesson-menu-toggle")
      ?.setAttribute("aria-expanded", "false");
  });
}

document.addEventListener("click", (event) => {
  if (
    event.target instanceof Element &&
    !event.target.closest(".admin-lesson-menu")
  ) {
    closeLessonMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLessonMenus();
});

export async function renderLessons() {
  await getAllLessons();

  // A–Z by title (ignoring case and accents; "Aralin 2" before "Aralin 10"); untitled last.
  const lessons = [...state.allLessons].sort((a, b) => {
    const left = (a.title || "").trim();
    const right = (b.title || "").trim();
    if (!left || !right) return !left - !right;
    return left.localeCompare(right, "fil", { sensitivity: "base", numeric: true });
  });

  page(
    "Lessons",
    "Create and manage lesson content for every learner.",
    '<button class="button primary" id="add-lesson">+ Add lesson</button>',
  );

  const pageContent = $("#page-content");
  const renderDirectory = () => {
    const counts = {
      all: lessons.length,
      beginner: lessons.filter(
        (lesson) => lessonDifficultyMeta(lesson.difficulty).label === "Beginner",
      ).length,
      intermediate: lessons.filter(
        (lesson) => lessonDifficultyMeta(lesson.difficulty).label === "Intermediate",
      ).length,
      advanced: lessons.filter(
        (lesson) => lessonDifficultyMeta(lesson.difficulty).label === "Advanced",
      ).length,
    };
    const visibleLessons =
      activeLessonFilter === "all"
        ? lessons
        : lessons.filter(
            (lesson) =>
              lessonDifficultyMeta(lesson.difficulty).label.toLowerCase() ===
              activeLessonFilter,
          );
    const matchingLessons = visibleLessons.filter((lesson) =>
      (lesson.title || "Untitled lesson")
        .toLowerCase()
        .includes(activeLessonSearch.trim().toLowerCase()),
    );

    pageContent.innerHTML = `
      <section class="admin-lesson-directory" aria-label="Lesson library">
        <div class="admin-lesson-directory__intro">
          <div>
            <span class="admin-lesson-directory__eyebrow">Learning library</span>
            <h2>Lessons, at a glance</h2>
            <p>Browse and organize learning content by level.</p>
          </div>
          <span class="admin-lesson-directory__total"><strong>${lessons.length}</strong> ${lessons.length === 1 ? "lesson" : "lessons"}</span>
        </div>
        <label class="admin-lesson-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
          <span class="sr-only">Search lessons</span>
          <input
            type="search"
            data-lesson-search
            placeholder="Search by lesson title..."
            value="${escapeHtml(activeLessonSearch)}"
            autocomplete="off"
          />
          <kbd>/</kbd>
        </label>
        <nav class="admin-lesson-filters" aria-label="Filter lessons by difficulty">
          ${[
            ["all", "All"],
            ["beginner", "Beginner"],
            ["intermediate", "Intermediate"],
            ["advanced", "Advanced"],
          ]
            .map(
              ([filter, label]) => `
                <button
                  type="button"
                  class="admin-lesson-filter ${activeLessonFilter === filter ? "is-active" : ""}"
                  data-lesson-filter="${filter}"
                  aria-pressed="${activeLessonFilter === filter}"
                >
                  <span>${label}</span>
                  <span class="admin-lesson-filter__count">${counts[filter]}</span>
                </button>
              `,
            )
            .join("")}
        </nav>
        <div class="admin-lesson-table-wrap">
          <table class="table admin-lesson-table">
            <thead>
              <tr>
                <th scope="col">Lesson title</th>
                <th scope="col">Difficulty</th>
                <th scope="col" aria-label="Lesson actions"></th>
              </tr>
            </thead>
            <tbody>
              ${
                matchingLessons.length
                  ? matchingLessons
                      .map((lesson) => {
                        const meta = lessonDifficultyMeta(lesson.difficulty);
                        const title = lesson.title || "Untitled lesson";
                        return `
                          <tr>
                            <td>
                              <div class="admin-lesson-table__title">
                                <span class="admin-lesson-table__order" aria-hidden="true">${escapeHtml(String(lesson.order || "—").padStart(2, "0"))}</span>
                                <span>
                                  <strong>${escapeHtml(title)}</strong>
                                  <small>${escapeHtml(lesson.description || "No description yet.")}</small>
                                </span>
                              </div>
                            </td>
                            <td><span class="admin-lesson-difficulty ${meta.className}"><span aria-hidden="true"></span>${escapeHtml(meta.label)}</span></td>
                            <td>
                              <div class="admin-lesson-menu">
                                <button
                                  type="button"
                                  class="admin-lesson-menu-toggle"
                                  aria-label="Actions for ${escapeHtml(title)}"
                                  aria-haspopup="true"
                                  aria-expanded="false"
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                                </button>
                                <div class="admin-lesson-menu-popup" hidden>
                                  <button type="button" class="admin-lesson-menu-item" data-view-lesson="${escapeHtml(lesson.id)}">
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
                                    <span>View lesson</span>
                                  </button>
                                  <button type="button" class="admin-lesson-menu-item" data-edit-lesson="${escapeHtml(lesson.id)}">
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" /></svg>
                                    <span>Edit lesson</span>
                                  </button>
                                  <button type="button" class="admin-lesson-menu-item admin-lesson-menu-item--danger" data-delete-lesson="${escapeHtml(lesson.id)}">
                                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" /></svg>
                                    <span>Delete lesson</span>
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        `;
                      })
                      .join("")
                  : `<tr><td class="admin-lesson-table__empty" colspan="3">${activeLessonSearch.trim() ? `No lessons match “${escapeHtml(activeLessonSearch.trim())}”.` : `No ${escapeHtml(activeLessonFilter)} lessons yet.`}</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
    `;

    pageContent
      .querySelectorAll("[data-lesson-filter]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          activeLessonFilter = button.dataset.lessonFilter;
          lessonPage = 1;
          closeLessonMenus();
          renderDirectory();
        });
      });

    pageContent
      .querySelector("[data-lesson-search]")
      .addEventListener("input", (event) => {
        const input = event.currentTarget;
        const cursor = input.selectionStart;
        activeLessonSearch = input.value;
        lessonPage = 1;
        renderDirectory();
        const replacement = pageContent.querySelector("[data-lesson-search]");
        replacement.focus();
        replacement.setSelectionRange(cursor, cursor);
      });

    matchingLessons.forEach((lesson) => {
      const viewButton = [
        ...pageContent.querySelectorAll("[data-view-lesson]"),
      ].find((button) => button.dataset.viewLesson === lesson.id);
      const row = viewButton?.closest("tr");
      const editButton = [
        ...(row?.querySelectorAll("[data-edit-lesson]") || []),
      ].find((button) => button.dataset.editLesson === lesson.id);
      const deleteButton = [
        ...(row?.querySelectorAll("[data-delete-lesson]") || []),
      ].find((button) => button.dataset.deleteLesson === lesson.id);
      const toggle = row?.querySelector(".admin-lesson-menu-toggle");
      const popup = row?.querySelector(".admin-lesson-menu-popup");

      toggle?.addEventListener("click", () => {
        const willOpen = popup.hidden;
        closeLessonMenus();
        popup.hidden = !willOpen;
        toggle.setAttribute("aria-expanded", String(willOpen));
      });
      viewButton?.addEventListener("click", () => {
        closeLessonMenus();
        openLessonViewer(lesson, { loadSections: getLessonSections, onEdit: openLessonModal });
      });
      editButton?.addEventListener("click", () => {
        closeLessonMenus();
        openLessonModal(lesson);
      });
      deleteButton?.addEventListener("click", () => {
        closeLessonMenus();
        openDeleteLesson(lesson, renderLessons);
      });
    });

    paginate({
      rows: () =>
        [...pageContent.querySelectorAll(".admin-lesson-table tbody tr")].filter(
          (row) => !row.querySelector(".admin-lesson-table__empty"),
        ),
      after: pageContent.querySelector(".admin-lesson-table-wrap"),
      label: ["lesson", "lessons"],
      page: lessonPage,
      pageSize: lessonPageSize,
      onChange: ({ page: nextPage, pageSize }) => {
        lessonPage = nextPage;
        lessonPageSize = pageSize;
      },
    });
  };

  if (lessons.length) {
    renderDirectory();
  } else {
    pageContent.innerHTML = empty(
        "No lessons yet",
        "Create your first lesson and its learning activities.",
        "Add lesson",
        "add-lesson-empty",
      );
  }

  $("#add-lesson")?.addEventListener("click", () => openLessonModal());
  $("#add-lesson-empty")?.addEventListener("click", () => openLessonModal());
}

function options(values, selected) {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`,
    )
    .join("");
}

function studioHtml(lesson = {}, sections = {}) {
  return `
    <div class="lesson-studio">
      <div class="lesson-studio__heading">
        <div>
          <p class="eyebrow">BaSaya lesson studio</p>
          <h2>${lesson.id ? "Edit lesson" : "Create a new lesson"}</h2>
          <p>Build each learning section, preview audio, then publish everything together.</p>
        </div>
        <span class="lesson-studio__badge">Admin only</span>
      </div>
      ${lesson.id ? '<p class="lesson-usage" data-lesson-usage role="status" hidden></p>' : ""}

      <div class="lesson-studio__tabs">
        <button type="button" class="lesson-tab active" data-step="basics">1. Basics</button>
        <button type="button" class="lesson-tab" data-step="activity">2. Activity</button>
        <button type="button" class="lesson-tab" data-step="lectures">3. Lectures</button>
        <button type="button" class="lesson-tab" data-step="pronunciation">4. Pronunciation</button>
        <button type="button" class="lesson-tab" data-step="quiz">5. Quiz & game</button>
      </div>

      <div class="lecture-page-navigation" data-lecture-page-navigation hidden>
        <div class="lesson-subheading">
          <h4>Lecture pages</h4>
        </div>
        <div class="lecture-page-navigation__controls">
          <div class="lecture-page-ribbons" data-lecture-page-ribbons aria-label="Lecture pages"></div>
          <button type="button" class="button secondary small" data-add-lecture-page>+ Add page</button>
        </div>
      </div>

      <form id="lesson-form">
        <section class="lesson-step active" data-panel="basics">
          <div class="lesson-section-intro">
            <span class="lesson-section-number">01</span>
            <div>
              <h3>Lesson basics</h3>
              <p>These details appear in the lesson list and determine its order.</p>
            </div>
          </div>

          <div class="form-grid">
            <label>
              Lesson title
              <input name="title" required maxlength="120" value="${escapeHtml(lesson.title || "")}" placeholder="e.g. Pangngalan" />
            </label>
            <label>
              Difficulty
              <select name="difficulty" required>
                ${options(DIFFICULTIES, lesson.difficulty || "madali")}
              </select>
            </label>
          </div>

          <div class="form-grid">
            <label>
              Lesson order
              <input name="order" type="number" min="1" required value="${escapeHtml(lesson.order || state.allLessons.length + 1)}" />
            </label>
            <label>
              Description
              <input name="description" required maxlength="300" value="${escapeHtml(lesson.description || "")}" placeholder="What will the learner study?" />
            </label>
          </div>
        </section>

        <section class="lesson-step" data-panel="activity">
          <div class="lesson-section-intro">
            <span class="lesson-section-number">02</span>
            <div>
              <h3>Tap-the-word activity</h3>
              <p>Add a page, enter a sentence, then select the correct words.</p>
            </div>
          </div>

          <label class="game-skip-option">
            <input
              type="checkbox"
              data-skip-activity
              ${sections.activityStatus?.completion === "skipped" ? "checked" : ""}
            />
            <span>Skip Gawain for this lesson</span>
          </label>
          <p class="muted">When selected, the activity controls are disabled and no activity is saved.</p>
          <div data-activity-editor>
            <label>Activity title<input data-activity-title value="${escapeHtml(sections.activity?.title || "")}" placeholder="PAGSASANAY: HANAPIN ANG PANGNGALAN" /></label>
            <label>Instruction<textarea data-activity-instruction placeholder="Pindutin at piliin ang mga salitang pangngalan sa pangungusap.">${escapeHtml(sections.activity?.instruction || "")}</textarea></label>
            <label>General explanation<textarea data-activity-explanation placeholder="Ipaliwanag ang konsepto.">${escapeHtml(sections.activity?.explanation || "")}</textarea></label>

            <div class="lesson-subheading">
              <h4>Activity pages</h4>
              <button type="button" class="button secondary small" data-add-activity-page>+ Add page</button>
            </div>
            <div data-activity-pages></div>
          </div>
        </section>

        <section class="lesson-step" data-panel="lectures">
          <div class="lesson-section-intro">
            <span class="lesson-section-number">03</span>
            <div>
              <h3>Lecture pages</h3>
              <p>Generate and listen to each sentence before publishing the lesson.</p>
            </div>
          </div>

          <label>Lecture title<input data-lecture-title value="${escapeHtml(sections.lectures?.title || lesson.title || "")}" placeholder="PANGGALAN" /></label>

          <div class="lecture-pages" data-lecture-pages></div>
        </section>

        <section class="lesson-step" data-panel="pronunciation">
          <div class="lesson-section-intro">
            <span class="lesson-section-number">04</span>
            <div>
              <h3>Pronunciation practice</h3>
              <p>Add practice words. Each word can use packaged audio or generated cloud audio.</p>
            </div>
          </div>

          <label>Pronunciation title<input data-pronunciation-title value="${escapeHtml(sections.pronunciation?.title || "")}" placeholder="BIGKASIN ANG MGA PANGNGALAN" /></label>
          <label>Instruction<textarea data-pronunciation-instruction placeholder="Pindutin ang mikropono at bigkasin ang salita.">${escapeHtml(sections.pronunciation?.instruction || "")}</textarea></label>

          <div class="lesson-subheading">
            <h4>Words</h4>
            <button type="button" class="button secondary small" data-add-pronunciation-word>+ Add word</button>
          </div>
          <div data-pronunciation-words></div>
        </section>

        <section class="lesson-step" data-panel="quiz">
          <div class="lesson-section-intro">
            <span class="lesson-section-number">05</span>
            <div>
              <h3>Quiz and game</h3>
              <p>Every quiz question has three choices. Game-level order is automatic.</p>
            </div>
          </div>

          <label>Quiz title<input data-quiz-title value="${escapeHtml(sections.quiz?.title || "")}" placeholder="PANGGALAN - Pagsusulit" /></label>

          <div class="lesson-subheading">
            <h4>Quiz questions</h4>
            <button type="button" class="button secondary small" data-add-question>+ Add question</button>
          </div>
          <div data-quiz-questions></div>

          <label class="game-skip-option">
            <input
              type="checkbox"
              data-skip-game
              ${sections.gameStatus?.completion === "skipped" ? "checked" : ""}
            />
            <span>Skip game for this lesson</span>
          </label>
          <p class="muted">When selected, game controls are disabled and no game levels are saved.</p>
          <div data-game-editor>
            <div class="lesson-subheading lesson-subheading--spaced">
              <h4>Game levels</h4>
              <button type="button" class="button secondary small" data-add-game-level>+ Add level</button>
            </div>
            <div data-game-levels></div>
          </div>
        </section>

        <div class="lesson-studio__footer">
          <button type="button" class="button secondary" data-close>Cancel</button>
          <button type="submit" class="button primary">${lesson.id ? "Save changes" : "Publish lesson"}</button>
        </div>
      </form>
    </div>
  `;
}

function activityPageHtml(page = {}) {
  const sentence = (page.words || []).join(" ");
  const correctIndices = (page.correctIndices || [])
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0)
    .join(",");

  return `
    <article class="builder-card" data-activity-page data-correct-indices="${correctIndices}">
      <div class="builder-card__header">
        <strong>Activity page</strong>
        <button type="button" class="text-button danger" data-remove-activity-page>Remove</button>
      </div>
      <label>
        Enter the sentence here
        <input data-activity-words value="${escapeHtml(sentence)}" placeholder="The boy is happy" />
      </label>
      <div class="activity-answer-picker" data-activity-answer-picker hidden>
        <span class="activity-answer-picker__label">Click the correct answer</span>
        <div class="activity-answer-picker__words" data-activity-answer-words></div>
      </div>
    </article>
  `;
}

function activityWords(page) {
  return $("[data-activity-words]", page)
    .value.trim()
    .split(/\s+/)
    .filter(Boolean);
}

function activityCorrectIndices(page) {
  return [...new Set(
    (page.dataset.correctIndices || "")
      .split(",")
      .map(Number)
      .filter((index) => Number.isInteger(index) && index >= 0),
  )].sort((a, b) => a - b);
}

function renderActivityAnswerPicker(page) {
  const words = activityWords(page);
  const picker = $("[data-activity-answer-picker]", page);
  const wordButtons = $("[data-activity-answer-words]", page);

  if (!words.length) {
    picker.hidden = true;
    return;
  }

  const selected = new Set(activityCorrectIndices(page));
  wordButtons.innerHTML = words
    .map(
      (word, index) => `
        <button
          type="button"
          class="activity-answer-word ${selected.has(index) ? "selected" : ""}"
          data-activity-answer-word="${index}"
          aria-pressed="${selected.has(index)}"
        >${escapeHtml(word)}</button>
      `,
    )
    .join("");
  picker.hidden = false;
}

function lecturePageHtml(page = {}) {
  const sentences = page.sentences?.length ? page.sentences : [""];
  const cloudAudio = page.cloudAudio || [];

  return `
    <article class="builder-card" data-lecture-page>
      <div class="builder-card__header">
        <strong data-lecture-page-title>Lecture page</strong>
        <button type="button" class="text-button danger" data-remove-lecture-page>Remove</button>
      </div>
      <div class="sentence-builder" data-sentences>
        ${sentences
          .map((sentence, index) =>
            lectureSentenceHtml(
              sentence,
              page.audioResNames?.[index] || "",
              cloudAudio[index] || null,
            ),
          )
          .join("")}
      </div>
      <button type="button" class="link-button" data-add-lecture-sentence>+ Add sentence</button>
    </article>
  `;
}

function lectureSentenceHtml(sentence = "", audioResName = "", cloudAudio = null) {
  const audioUrl = safeHttpUrl(cloudAudio?.audioUrl);
  return `
    <div class="sentence-editor" data-lecture-sentence data-cloud-audio="${escapeHtml(JSON.stringify(cloudAudio))}" data-audio-res-name="${escapeHtml(audioResName)}">
      <label>
        Sentence
        <textarea data-sentence-text placeholder="Write the sentence for this page.">${escapeHtml(sentence)}</textarea>
      </label>
      <div class="audio-actions">
        <button type="button" class="button secondary small" data-generate-sentence-audio>Generate audio</button>
        <button type="button" class="text-button danger" data-remove-lecture-sentence>Remove</button>
      </div>
      <div class="audio-preview" data-audio-preview>
        ${audioUrl ? `<audio controls src="${escapeHtml(audioUrl)}"></audio><small class="muted">Existing cloud audio</small>` : ""}
      </div>
    </div>
  `;
}

function pronunciationWordHtml(word = "", audioRef = "", cloudAudio = null) {
  const audioUrl = safeHttpUrl(cloudAudio?.audioUrl);
  return `
    <div class="pronunciation-editor" data-pronunciation-word data-cloud-audio="${escapeHtml(JSON.stringify(cloudAudio))}" data-audio-ref="${escapeHtml(audioRef)}">
      <label>
        Word
        <input data-pronunciation-text value="${escapeHtml(word)}" placeholder="Arkipelago" />
      </label>
      <div class="audio-actions">
        <button type="button" class="button secondary small" data-generate-pronunciation-audio>Generate audio</button>
        <button type="button" class="text-button danger" data-remove-pronunciation-word>Remove</button>
      </div>
      <div class="audio-preview" data-audio-preview>
        ${audioUrl ? `<audio controls src="${escapeHtml(audioUrl)}"></audio><small class="muted">Existing cloud audio</small>` : ""}
      </div>
    </div>
  `;
}

// Each question needs its own radio-group names so checking one answer unchecks the others.
let questionSeq = 0;

const ANSWER_HINTS = {
  single: "Pumili ng isang tamang sagot.",
  multiple: "Lagyan ng check ang lahat ng tamang sagot.",
};

/** Correct answer indices: `answers` (multiple-answer quizzes) or the older single `answer`. */
function questionAnswers(question) {
  if (Array.isArray(question.answers) && question.answers.length) {
    return question.answers.map(Number).filter((index) => Number.isInteger(index));
  }
  return Number.isInteger(question.answer) ? [question.answer] : [];
}

function questionHtml(question = {}) {
  const id = `quiz-q${++questionSeq}`;
  const choices = question.choices?.length === 3 ? question.choices : ["", "", ""];
  const multiple = question.multiple === true;
  const answers = new Set(questionAnswers(question));
  const answerType = multiple ? "checkbox" : "radio";

  return `
    <article class="builder-card" data-question>
      <div class="builder-card__header">
        <strong>Quiz question</strong>
        <button type="button" class="text-button danger" data-remove-question>Remove</button>
      </div>
      <label>Question<textarea data-question-text placeholder="Write a question.">${escapeHtml(question.question || "")}</textarea></label>

      <div class="quiz-answer-mode" role="radiogroup" aria-label="Answer type">
        <label>
          <input type="radio" name="${id}-mode" value="single" data-answer-mode ${multiple ? "" : "checked"} />
          Isang tamang sagot
        </label>
        <label>
          <input type="radio" name="${id}-mode" value="multiple" data-answer-mode ${multiple ? "checked" : ""} />
          Maraming tamang sagot
        </label>
      </div>
      <p class="quiz-answer-hint" data-answer-hint>${ANSWER_HINTS[multiple ? "multiple" : "single"]}</p>

      <div class="choice-grid">
        ${choices
          .map(
            (choice, index) => `
              <div class="choice-editor">
                <label class="choice-answer">
                  <input
                    type="${answerType}"
                    name="${id}-answer"
                    data-answer-choice
                    value="${index}"
                    ${answers.has(index) ? "checked" : ""}
                  />
                  Correct answer
                </label>
                <input
                  data-choice-text
                  value="${escapeHtml(choice)}"
                  placeholder="Choice ${index + 1}"
                  aria-label="Choice ${index + 1}"
                />
              </div>
            `,
          )
          .join("")}
      </div>
      <p class="quiz-question-error" data-question-error hidden>Pumili ng tamang sagot para sa tanong na ito.</p>
    </article>
  `;
}

/** Switch a question between one correct answer (radio group) and several (checkboxes). */
function setQuestionAnswerMode(question, multiple) {
  const inputs = $$("[data-answer-choice]", question);
  const checked = inputs.map((input) => input.checked);
  let keptOne = false;

  inputs.forEach((input, index) => {
    input.type = multiple ? "checkbox" : "radio";
    // Going back to one answer keeps only the first checked choice.
    const keep = multiple ? checked[index] : checked[index] && !keptOne;
    if (keep) keptOne = true;
    input.checked = keep;
  });

  $("[data-answer-hint]", question).textContent = ANSWER_HINTS[multiple ? "multiple" : "single"];
}

function clearQuestionError(question) {
  question.classList.remove("is-invalid");
  $("[data-question-error]", question).hidden = true;
}

/**
 * Every question that will be saved (text and all three choices filled) needs at least one
 * correct answer. Returns the first invalid question, or null.
 */
function validateQuiz(container) {
  let firstInvalid = null;

  $$("[data-question]", container).forEach((question) => {
    const text = $("[data-question-text]", question).value.trim();
    const choicesFilled = $$("[data-choice-text]", question).every((input) => input.value.trim());
    const hasAnswer = $$("[data-answer-choice]", question).some((input) => input.checked);
    const invalid = Boolean(text && choicesFilled && !hasAnswer);

    question.classList.toggle("is-invalid", invalid);
    $("[data-question-error]", question).hidden = !invalid;
    if (invalid && !firstInvalid) firstInvalid = question;
  });

  return firstInvalid;
}

async function openLessonModal(existing = null) {
  const sections = existing ? await getLessonSections(existing.id) : {};

  openModal(studioHtml(existing || {}, sections), (modal, close) => {
    if (existing) showLessonUsage($("[data-lesson-usage]", modal), existing.id);
    const activityPages = $("[data-activity-pages]", modal);
    const lecturePages = $("[data-lecture-pages]", modal);
    const lecturePageRibbons = $("[data-lecture-page-ribbons]", modal);
    const lecturePageNavigation = $("[data-lecture-page-navigation]", modal);

    // One clip at a time: replaying (or starting another clip) stops the one already
    // playing, so the same audio never overlaps itself and sounds like an echo.
    const previewPlayer = new Audio();
    const stopOtherAudio = (current) => {
      if (previewPlayer !== current) previewPlayer.pause();
      $$("audio", modal).forEach((audio) => {
        if (audio !== current) audio.pause();
      });
    };
    modal.addEventListener("play", (event) => stopOtherAudio(event.target), true);
    // Closing the editor stops whatever is still playing.
    new MutationObserver((_, observer) => {
      if (modal.isConnected) return;
      stopOtherAudio(null);
      observer.disconnect();
    }).observe(document.body, { childList: true, subtree: true });
    const pronunciationWords = $("[data-pronunciation-words]", modal);
    const quizQuestions = $("[data-quiz-questions]", modal);
    const gameLevels = $("[data-game-levels]", modal);
    const skipGame = $("[data-skip-game]", modal);
    const gameEditor = $("[data-game-editor]", modal);
    const skipActivity = $("[data-skip-activity]", modal);
    const activityEditor = $("[data-activity-editor]", modal);

    const initialActivity = sections.activity?.pages?.length
      ? sections.activity.pages
      : sections.activityStatus?.completion === "skipped"
        ? []
        : [{}];
    const initialLectures = sections.lectures?.pages?.length
      ? sections.lectures.pages
      : [{}];
    const initialWords = sections.pronunciation?.words?.length
      ? sections.pronunciation.words.map((word, index) => ({
          word,
          audioRef: sections.pronunciation.audioRefs?.[index] || "",
          cloudAudio: sections.pronunciation.cloudAudio?.[index] || null,
        }))
      : [{}];
    const initialQuestions = sections.quiz?.questions?.length
      ? sections.quiz.questions
      : [{}];
    const initialLevels = sections.game?.length
      ? [...sections.game].sort((a, b) => (a.level ?? a.order ?? 0) - (b.level ?? b.order ?? 0))
      : sections.gameStatus?.completion === "skipped"
        ? []
        : [{}];

    activityPages.innerHTML = initialActivity.map(activityPageHtml).join("");
    $$("[data-activity-page]", activityPages).forEach(renderActivityAnswerPicker);
    lecturePages.innerHTML = initialLectures.map(lecturePageHtml).join("");
    pronunciationWords.innerHTML = initialWords
      .map((item) => pronunciationWordHtml(item.word, item.audioRef, item.cloudAudio))
      .join("");
    quizQuestions.innerHTML = initialQuestions.map(questionHtml).join("");
    gameLevels.innerHTML = initialLevels.map(gameLevelHtml).join("");

    let activeLecturePage = 0;
    const renderLecturePageRibbons = () => {
      const pages = $$("[data-lecture-page]", lecturePages);
      activeLecturePage = Math.min(activeLecturePage, Math.max(pages.length - 1, 0));

      lecturePageRibbons.innerHTML = pages
        .map(
          (_, index) => `
            <button
              type="button"
              class="lecture-page-ribbon ${index === activeLecturePage ? "active" : ""}"
              data-lecture-page-ribbon="${index}"
              aria-current="${index === activeLecturePage ? "page" : "false"}"
            >Page ${index + 1}</button>
          `,
        )
        .join("");

      pages.forEach((page, index) => {
        page.hidden = index !== activeLecturePage;
        $("[data-lecture-page-title]", page).textContent = `Page ${index + 1}`;
      });
    };

    renderLecturePageRibbons();

    const renumberLevels = () => {
      $$("[data-game-level]", gameLevels).forEach((element, index) => {
        $("[data-level-number]", element).textContent = index + 1;
      });
    };

    // A ticked "Skip …" box keeps its builder on screen but inactive.
    const updateSkipped = (editor, checkbox) => {
      editor.classList.toggle("is-skipped", checkbox.checked);
      editor
        .querySelectorAll("button, input, textarea, select")
        .forEach((control) => {
          control.disabled = checkbox.checked;
        });
    };
    const updateGameEditor = () => updateSkipped(gameEditor, skipGame);
    const updateActivityEditor = () => updateSkipped(activityEditor, skipActivity);

    $$("[data-game-level]", gameLevels).forEach(refreshLevel);
    wireGameLevels(gameLevels, {
      // Suggestions for over-long game words come from what this lesson already teaches.
      lessonWords: () =>
        wordsFromText(
          $$(
            "[data-pronunciation-text], [data-activity-words], [data-sentence-text]",
            modal,
          ).map((field) => field.value),
        ),
      onSkipGame: () => {
        skipGame.checked = true;
        updateGameEditor();
        skipGame.closest(".game-skip-option").scrollIntoView({ behavior: "smooth", block: "center" });
        toast("The game is skipped for this lesson.");
      },
    });
    renumberLevels();
    updateGameEditor();
    skipGame.addEventListener("change", updateGameEditor);
    updateActivityEditor();
    skipActivity.addEventListener("change", updateActivityEditor);

    const showStep = (step) => {
      $$(".lesson-tab", modal).forEach((button) =>
        button.classList.toggle("active", button.dataset.step === step),
      );
      $$("[data-panel]", modal).forEach((panel) =>
        panel.classList.toggle("active", panel.dataset.panel === step),
      );
      lecturePageNavigation.hidden = step !== "lectures";
    };

    $$(".lesson-tab", modal).forEach((button) => {
      button.addEventListener("click", () => showStep(button.dataset.step));
    });

    modal.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;

      if (button.matches("[data-play-preview]")) {
        const row = button.closest(
          "[data-lecture-sentence], [data-pronunciation-word]",
        );
        const preview = previews.get(row);

        if (!preview?.objectUrl) {
          toast("Generate audio first.");
          return;
        }

        stopOtherAudio(previewPlayer);
        previewPlayer.src = preview.objectUrl;
        previewPlayer.currentTime = 0;
        previewPlayer
          .play()
          .catch((error) => {
            if (error.name !== "AbortError") toast("Could not play the audio preview.");
          });
        return;
      }

      if (button.matches("[data-close]")) {
        close();
        return;
      }

      if (button.matches("[data-add-activity-page]")) {
        activityPages.insertAdjacentHTML("beforeend", activityPageHtml({}));
      }

      if (button.matches("[data-remove-activity-page]")) {
        button.closest("[data-activity-page]").remove();
      }

      if (button.matches("[data-activity-answer-word]")) {
        const activityPage = button.closest("[data-activity-page]");
        const index = Number(button.dataset.activityAnswerWord);
        const selected = new Set(activityCorrectIndices(activityPage));

        if (selected.has(index)) {
          selected.delete(index);
        } else {
          selected.add(index);
        }

        activityPage.dataset.correctIndices = [...selected]
          .sort((first, second) => first - second)
          .join(",");
        renderActivityAnswerPicker(activityPage);
      }

      if (button.matches("[data-add-lecture-page]")) {
        lecturePages.insertAdjacentHTML("beforeend", lecturePageHtml({}));
        activeLecturePage = $$("[data-lecture-page]", lecturePages).length - 1;
        renderLecturePageRibbons();
      }

      if (button.matches("[data-remove-lecture-page]")) {
        button.closest("[data-lecture-page]").remove();
        renderLecturePageRibbons();
      }

      if (button.matches("[data-add-lecture-sentence]")) {
        const lecturePage = button.closest("[data-lecture-page]");
        const sentenceRows = $$("[data-lecture-sentence]", lecturePage);
        if (sentenceRows.length >= MAX_SENTENCES_PER_LECTURE_PAGE) {
          toast(`A lecture page can contain at most ${MAX_SENTENCES_PER_LECTURE_PAGE} sentences.`);
          return;
        }

        lecturePage
          .querySelector("[data-sentences]")
          .insertAdjacentHTML("beforeend", lectureSentenceHtml());
      }

      if (button.matches("[data-remove-lecture-sentence]")) {
        button.closest("[data-lecture-sentence]").remove();
      }

      if (button.matches("[data-lecture-page-ribbon]")) {
        activeLecturePage = Number(button.dataset.lecturePageRibbon);
        renderLecturePageRibbons();
      }

      if (button.matches("[data-add-pronunciation-word]")) {
        pronunciationWords.insertAdjacentHTML("beforeend", pronunciationWordHtml());
      }

      if (button.matches("[data-remove-pronunciation-word]")) {
        button.closest("[data-pronunciation-word]").remove();
      }

      if (button.matches("[data-add-question]")) {
        quizQuestions.insertAdjacentHTML("beforeend", questionHtml({}));
      }

      if (button.matches("[data-remove-question]")) {
        button.closest("[data-question]").remove();
      }

      if (button.matches("[data-add-game-level]")) {
        gameLevels.insertAdjacentHTML("beforeend", gameLevelHtml({}));
        const added = gameLevels.lastElementChild;
        refreshLevel(added);
        renumberLevels();
        $("[data-key-word]", added).focus();
      }

      if (button.matches("[data-remove-game-level]")) {
        button.closest("[data-game-level]").remove();
        renumberLevels();
      }

      if (button.matches("[data-generate-sentence-audio]")) {
        const row = button.closest("[data-lecture-sentence]");
        const text = $("[data-sentence-text]", row).value.trim();

        if (!text) {
          toast("Write the sentence before generating audio.");
          return;
        }

        await createPreview(button, row, text);
      }

      if (button.matches("[data-generate-pronunciation-audio]")) {
        const row = button.closest("[data-pronunciation-word]");
        const text = $("[data-pronunciation-text]", row).value.trim();

        if (!text) {
          toast("Write the word before generating audio.");
          return;
        }

        await createPreview(button, row, text);
      }
    });

    modal.addEventListener("input", (event) => {
      if (!event.target.matches("[data-activity-words]")) return;

      const activityPage = event.target.closest("[data-activity-page]");
      activityPage.dataset.correctIndices = "";
      renderActivityAnswerPicker(activityPage);
    });

    modal.addEventListener("change", (event) => {
      const question = event.target.closest("[data-question]");
      if (!question) return;

      if (event.target.matches("[data-answer-mode]")) {
        setQuestionAnswerMode(question, event.target.value === "multiple");
      }
      if (event.target.matches("[data-answer-mode], [data-answer-choice]")) {
        clearQuestionError(question);
      }
    });

    $("#lesson-form", modal).addEventListener("submit", async (event) => {
      event.preventDefault();

      // Block saving a quiz question that has no correct answer selected.
      const invalidQuestion = validateQuiz(quizQuestions);
      if (invalidQuestion) {
        const number = $$("[data-question]", quizQuestions).indexOf(invalidQuestion) + 1;
        showStep("quiz");
        invalidQuestion.scrollIntoView({ behavior: "smooth", block: "center" });
        toast(`Pumili ng tamang sagot para sa Tanong ${number}.`);
        return;
      }

      // Every game level must be a key word plus 1–4 words made from its letters.
      if (!skipGame.checked) {
        if (!$$("[data-game-level]", gameLevels).length) {
          showStep("quiz");
          toast("Add a game level, or tick “Skip game for this lesson”.");
          return;
        }
        const invalidLevel = validateGameLevels(gameLevels);
        if (invalidLevel) {
          const number = $$("[data-game-level]", gameLevels).indexOf(invalidLevel) + 1;
          showStep("quiz");
          invalidLevel.scrollIntoView({ behavior: "smooth", block: "center" });
          toast(`Game level ${number} needs fixing before saving.`);
          return;
        }
      }

      // Another lesson already has this title? Ask before saving (edits that keep their
      // own title aren't asked again).
      const form = event.currentTarget;
      const submit = event.submitter;
      const titleInput = form.elements.title;
      const duplicate = findDuplicate(titleInput.value, state.allLessons, existing?.id);
      if (duplicate && !(existing && sameTitle(existing.title, titleInput.value))) {
        submit.disabled = true;
        const choice = await confirmDuplicateTitle(
          {
            title: titleInput.value.trim(),
            difficulty: form.elements.difficulty.value,
            order: form.elements.order.value,
          },
          duplicate,
          state.allLessons,
          Boolean(existing),
        );
        submit.disabled = false;
        if (!choice) return;
        if (choice.action === "rename") {
          showStep("basics");
          titleInput.focus();
          titleInput.select();
          return;
        }
        if (choice.action === "save-as") titleInput.value = choice.title;
      }

      // Skipping the Gawain or the game deletes what this lesson already has saved for
      // it, so ask first.
      const savedPages = skipActivity.checked ? sections.activity?.pages?.length || 0 : 0;
      const savedLevels = skipGame.checked ? sections.game?.length || 0 : 0;
      if (savedPages || savedLevels) {
        submit.disabled = true;
        const confirmed = await confirmDeleteSkipped({ pages: savedPages, levels: savedLevels });
        submit.disabled = false;
        if (!confirmed) {
          const [step, checkbox] = savedPages ? ["activity", skipActivity] : ["quiz", skipGame];
          showStep(step);
          checkbox.closest(".game-skip-option").scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      }

      submit.disabled = true;
      submit.textContent = "Saving…";

      try {
        const values = Object.fromEntries(new FormData(form));
        const lessonId = await saveLesson(existing, values, {
          activityPages,
          lecturePages,
          pronunciationWords,
          quizQuestions,
          gameLevels,
          skipGame,
          skipActivity,
        });

        toast(existing ? "Lesson updated." : "Lesson published.");
        close();
        await renderLessons();

        console.info("Saved lesson:", lessonId);
      } catch (error) {
        console.error(error);
        toast(error.message || "Could not save the lesson.");
      } finally {
        submit.disabled = false;
        submit.textContent = existing ? "Save changes" : "Publish lesson";
      }
    });
  });
}

async function createPreview(button, row, text) {
  const previousPreview = previews.get(row);
  const generationCount = previousPreview?.generationCount || 0;

  if (generationCount >= MAX_AUDIO_GENERATIONS_PER_SENTENCE) {
    toast(`Audio can be generated at most ${MAX_AUDIO_GENERATIONS_PER_SENTENCE} times for each sentence.`);
    return;
  }

  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = "Generating…";

  try {
    const blob = await generateSpeech(text);
    const previous = previews.get(row);

    if (previous?.objectUrl) {
      URL.revokeObjectURL(previous.objectUrl);
    }

    const objectUrl = URL.createObjectURL(blob);
    const nextGenerationCount = generationCount + 1;
    previews.set(row, {
      blob,
      objectUrl,
      text,
      generationCount: nextGenerationCount,
    });

    $("[data-audio-preview]", row).innerHTML = `
      <button
        type="button"
        class="audio-listen-button"
        data-play-preview
        aria-label="Play generated audio"
        title="Listen to generated audio"
      >🔊</button>
      <small class="muted">Preview ready</small>
    `;

    const remainingGenerations = MAX_AUDIO_GENERATIONS_PER_SENTENCE - nextGenerationCount;
    button.textContent = remainingGenerations
      ? `Generate again (${remainingGenerations} left)`
      : "Generation limit reached";
  } catch (error) {
    console.error(error);
    toast(error.message || "Audio could not be generated.");
    button.textContent = originalLabel;
  } finally {
    button.disabled = (previews.get(row)?.generationCount || 0) >= MAX_AUDIO_GENERATIONS_PER_SENTENCE;
  }
}

/** Classes whose lesson plan has this lesson, each with how many students it has. */
async function lessonUsage(lessonId) {
  if (!state.allClasses.length) await getAllClasses();
  const using = (
    await Promise.all(
      state.allClasses.map(async (classroom) => {
        const links = await getDocs(collection(db, "classes", classroom.id, "classLessons"));
        // Older links have auto-generated ids and keep the lesson id in a field.
        const hasLesson = links.docs.some((link) => (link.get("lessonId")?.trim() || link.id) === lessonId);
        return hasLesson ? classroom : null;
      }),
    )
  ).filter(Boolean);
  const students = await Promise.all(
    using.map((classroom) =>
      getCountFromServer(collection(db, "classes", classroom.id, "students"))
        .then((snap) => snap.data().count)
        .catch(() => 0),
    ),
  );
  return using.map((classroom, index) => ({
    name: [classroom.className, classroom.section].filter(Boolean).join(" · ") || "Untitled class",
    students: students[index],
  }));
}

/**
 * Edits reach every class using the lesson right away (classes only link to it), so the
 * editor says which ones. Stays hidden when no class uses it or the classes can't be read.
 */
async function showLessonUsage(banner, lessonId) {
  let usage;
  try {
    usage = await lessonUsage(lessonId);
  } catch (error) {
    console.warn("Could not read which classes use this lesson", error);
    return;
  }
  if (!banner?.isConnected || !usage.length) return;

  const plural = (count, word, words = `${word}s`) => `${count} ${count === 1 ? word : words}`;
  const students = usage.reduce((sum, item) => sum + item.students, 0);
  banner.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>
    <span>
      <strong>Used by ${plural(usage.length, "class", "classes")} · ${plural(students, "student")}.</strong>
      Changes reach them right away.
      <small>${usage.map((item) => escapeHtml(item.name)).join(", ")}</small>
    </span>`;
  banner.hidden = false;
}

async function saveLesson(existing, values, elements) {
  const rootData = {
    title: values.title.trim(),
    description: values.description.trim(),
    difficulty: values.difficulty,
    order: Number(values.order),
    updatedAt: serverTimestamp(),
  };

  let lessonRef;

  if (existing) {
    lessonRef = doc(db, "lessons", existing.id);
    await updateDoc(lessonRef, rootData);
  } else {
    lessonRef = await addDoc(collection(db, "lessons"), {
      ...rootData,
      createdAt: serverTimestamp(),
    });
  }

  const activity = elements.skipActivity.checked ? null : readActivity(elements.activityPages);
  const lectures = await readLectures(elements.lecturePages, lessonRef.id);
  const pronunciation = await readPronunciation(
    elements.pronunciationWords,
    lessonRef.id,
  );
  const quiz = readQuiz(elements.quizQuestions);
  const game = elements.skipGame.checked ? [] : readGameLevels(elements.gameLevels);

  await replaceActivity(lessonRef.id, activity);
  await setDoc(doc(db, "lessons", lessonRef.id, "lectures", "content"), {
    title: $("[data-lecture-title]", document.body).value.trim() || values.title.trim(),
    pages: lectures,
  });
  await setDoc(
    doc(db, "lessons", lessonRef.id, "pronunciation", "content"),
    {
      title: $("[data-pronunciation-title]", document.body).value.trim(),
      instruction: $("[data-pronunciation-instruction]", document.body).value.trim(),
      words: pronunciation.words,
      audioRefs: pronunciation.audioRefs,
      cloudAudio: pronunciation.cloudAudio,
    },
  );
  await setDoc(doc(db, "lessons", lessonRef.id, "quiz", "content"), {
    title: $("[data-quiz-title]", document.body).value.trim(),
    questions: quiz,
  });

  await replaceGameLevels(lessonRef.id, game, elements.skipGame.checked);

  return lessonRef.id;
}

function readActivity(container) {
  return {
    title: $("[data-activity-title]", document.body).value.trim(),
    instruction: $("[data-activity-instruction]", document.body).value.trim(),
    explanation: $("[data-activity-explanation]", document.body).value.trim(),
    pages: $$("[data-activity-page]", container)
      .map((page) => {
        const words = activityWords(page);
        const correctIndices = activityCorrectIndices(page)
          .filter((index) => index < words.length);

        return {
          words,
          correctIndices,
        };
      })
      .filter((item) => item.words.length),
  };
}

// Keeps audio that was saved earlier when the row has no newly generated preview,
// but only if the text it was generated from is unchanged.
function existingCloudAudio(row, text) {
  try {
    const saved = JSON.parse(row.dataset.cloudAudio || "null");
    return saved?.audioUrl && saved.text === text ? saved : null;
  } catch {
    return null;
  }
}

async function readLectures(container, lessonId) {
  const pages = [];

  for (const [pageIndex, page] of $$("[data-lecture-page]", container).entries()) {
    const sentenceRows = $$("[data-lecture-sentence]", page);
    if (sentenceRows.length > MAX_SENTENCES_PER_LECTURE_PAGE) {
      throw new Error(`Lecture page ${pageIndex + 1} can contain at most ${MAX_SENTENCES_PER_LECTURE_PAGE} sentences.`);
    }
    const sentences = [];
    const audioResNames = [];
    const cloudAudio = [];

    for (const [sentenceIndex, row] of sentenceRows.entries()) {
      const text = $("[data-sentence-text]", row).value.trim();
      if (!text) continue;
      sentences.push(text);
      // Legacy bundled-audio name; no longer editable, kept so older lessons still play.
      audioResNames.push(row.dataset.audioResName || "");

      const preview = previews.get(row);
      if (preview?.blob) {
        const uploaded = await saveSpeech({
          audio: preview.blob,
          lessonId,
          section: "lectures",
          pageNumber: pageIndex + 1,
          sentenceIndex: sentenceIndex + 1,
        });

        cloudAudio.push({
          audioUrl: uploaded.audioUrl,
          storageKey: uploaded.storageKey,
          text,
        });

        URL.revokeObjectURL(preview.objectUrl);
      } else {
        cloudAudio.push(existingCloudAudio(row, text));
      }
    }

    if (sentences.length) {
      pages.push({
        pageNumber: pageIndex + 1,
        sentences,
        audioResNames,
        cloudAudio,
      });
    }
  }

  return pages;
}

async function readPronunciation(container, lessonId) {
  const words = [];
  const audioRefs = [];
  const cloudAudio = [];

  for (const [index, row] of $$("[data-pronunciation-word]", container).entries()) {
    const word = $("[data-pronunciation-text]", row).value.trim();
    if (!word) continue;

    words.push(word);
    // Legacy bundled-audio name; no longer editable, kept so older lessons still play.
    audioRefs.push(row.dataset.audioRef || "");

    const preview = previews.get(row);
    if (preview?.blob) {
      const uploaded = await saveSpeech({
        audio: preview.blob,
        lessonId,
        section: "pronunciation",
        pageNumber: 0,
        sentenceIndex: index + 1,
      });

      cloudAudio.push({
        audioUrl: uploaded.audioUrl,
        storageKey: uploaded.storageKey,
        text: word,
      });

      URL.revokeObjectURL(preview.objectUrl);
    } else {
      cloudAudio.push(existingCloudAudio(row, word));
    }
  }

  return { words, audioRefs, cloudAudio };
}

function readQuiz(container) {
  return $$("[data-question]", container)
    .map((question) => {
      const choices = $$("[data-choice-text]", question).map((input) =>
        input.value.trim(),
      );

      const multiple = $("[data-answer-mode]:checked", question)?.value === "multiple";
      const answers = $$("[data-answer-choice]", question)
        .filter((input) => input.checked)
        .map((input) => Number(input.value));

      return {
        question: $("[data-question-text]", question).value.trim(),
        choices,
        multiple,
        answers,
        // Kept for older app versions, which only read a single answer.
        answer: answers[0] ?? 0,
      };
    })
    .filter((item) => item.question && item.choices.every(Boolean));
}

/** Resolves true to delete the saved Gawain pages / game levels and skip them, false to go back. */
function confirmDeleteSkipped({ pages = 0, levels = 0 }) {
  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const what = [pages && plural(pages, "Gawain page"), levels && plural(levels, "game level")]
    .filter(Boolean)
    .join(" and ");
  const skipping = [pages && "Gawain", levels && "game"].filter(Boolean).join(" and ");
  const one = pages + levels === 1;
  return new Promise((resolve) => {
    openModal(
      `<h2>Delete ${what}?</h2>
       <p>This lesson already has <strong>${what}</strong>. Skipping the ${skipping} deletes ${one ? "it" : "them"} when you save, and ${one ? "it" : "they"} can't be brought back.</p>
       <p class="muted">Students keep their progress. The skipped ${pages && levels ? "parts just won't show" : "part just won't show"} in this lesson anymore.</p>
       <div class="modal-actions">
         <button type="button" class="button secondary" data-cancel>Keep ${one ? "it" : "them"}</button>
         <button type="button" class="button danger" data-confirm>Delete &amp; skip</button>
       </div>`,
      (backdrop, close) => {
        let settled = false;
        const finish = (choice) => {
          if (settled) return;
          settled = true;
          watcher.disconnect();
          close();
          resolve(choice);
        };
        // Closing with × or the backdrop counts as "go back".
        const watcher = new MutationObserver(() => {
          if (!backdrop.isConnected) finish(false);
        });
        watcher.observe(document.body, { childList: true });

        $("[data-cancel]", backdrop).addEventListener("click", () => finish(false));
        $("[data-confirm]", backdrop).addEventListener("click", () => finish(true));
        setTimeout(() => $("[data-cancel]", backdrop).focus(), 50);
      },
    );
  });
}

/**
 * Saves activity/content, or with activity = null deletes the Gawain and saves
 * activity/status = { completion: "skipped" }, as the game does (see replaceGameLevels).
 */
async function replaceActivity(lessonId, activity) {
  const statusRef = doc(db, "lessons", lessonId, "activity", "status");
  if (activity) {
    const batch = writeBatch(db);
    batch.set(doc(db, "lessons", lessonId, "activity", "content"), activity);
    batch.delete(statusRef);
    await batch.commit();
    return;
  }

  const existing = await getDocs(collection(db, "lessons", lessonId, "activity"));
  const batch = writeBatch(db);
  existing.docs.forEach((item) => {
    if (item.id !== "status") batch.delete(item.ref);
  });
  batch.set(statusRef, { completion: "skipped" });
  await batch.commit();
}

async function replaceGameLevels(lessonId, levels, skipGame) {
  const gameCollection = collection(db, "lessons", lessonId, "game");
  const existing = await getDocs(gameCollection);

  const batch = writeBatch(db);
  existing.docs.forEach((gameDoc) => {
    if (!skipGame || gameDoc.id !== "status") {
      batch.delete(gameDoc.ref);
    }
  });
  if (skipGame) {
    batch.set(doc(db, "lessons", lessonId, "game", "status"), {
      completion: "skipped",
    });
  }
  if (existing.size || skipGame) {
    await batch.commit();
  }

  await Promise.all(
    levels.map((level) => addDoc(gameCollection, level)),
  );
}
