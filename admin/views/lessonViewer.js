import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { $, $$, escapeHtml, openModal, safeHttpUrl } from "../../js/helpers.js";
import { crosswordHtml, splitLevel } from "./gameLevels.js";

// "View lesson": the whole lesson as the editor shows it, but read-only.
// Audio plays (one clip at a time, or a lecture page in sequence), the quiz shows
// its answers and each game level shows its crossword. "Edit lesson" hands over to
// the lesson studio. Also the teacher's lesson Preview (teacher/views/addLesson.js),
// without the Edit button. Styles: css/pages/lesson-viewer.css, plus the difficulty
// pill (admin-lessons.css) and crossword (game-levels.css).

const SINGLE_SECTIONS = ["activity", "lectures", "pronunciation", "quiz"];

/** Every section of a lesson, read from its subcollections. */
export async function loadLessonSections(lessonId) {
  const entries = await Promise.all(
    [...SINGLE_SECTIONS, "game"].map(async (section) => {
      const snapshot = await getDocs(collection(db, "lessons", lessonId, section));
      return [
        section,
        snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
      ];
    }),
  );

  const data = Object.fromEntries(entries);

  const status = (docs) => docs.find((item) => item.id === "status") || null;
  return {
    // activity/status (and game/status) say the admin skipped that part.
    activity: data.activity.find((item) => item.id === "content") ||
      data.activity.find((item) => item.id !== "status") ||
      null,
    activityStatus: status(data.activity),
    lectures: data.lectures[0] || null,
    pronunciation: data.pronunciation[0] || null,
    quiz: data.quiz[0] || null,
    game: (data.game || []).filter((item) => item.id !== "status"),
    gameStatus: status(data.game || []),
  };
}

export const SECTIONS = [
  { id: "lectures", label: "Lecture", icon: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />' },
  { id: "quiz", label: "Quiz", icon: '<circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01" />' },
  { id: "activity", label: "Activity", icon: '<path d="M9 11.5 11.5 14 16 9.5" /><rect x="3.5" y="3.5" width="17" height="17" rx="4" />' },
  { id: "pronunciation", label: "Pronunciation", icon: '<rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />' },
  { id: "game", label: "Game", icon: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><path d="M17.25 13.5v7.5M13.5 17.25H21" />' },
];

export const icon = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const ICON_PLAY = '<path class="lv-play__play" d="M8 5.5v13l10.5-6.5L8 5.5Z" /><path class="lv-play__pause" d="M8.5 5.5v13M15.5 5.5v13" />';
const ICON_CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5" />';
const ICON_EYE = '<path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" />';
const ICON_EDIT = '<path d="m15 5 4 4M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" />';

export function difficulty(level = "") {
  const value = String(level).toLowerCase();
  if (value.includes("malalim")) return { label: "Advanced", className: "difficulty--advanced" };
  if (value.includes("masusing")) return { label: "Intermediate", className: "difficulty--intermediate" };
  return { label: "Beginner", className: "difficulty--beginner" };
}

/**
 * Lesson text can carry simple formatting from the Android app (e.g. `<u><b>paaralan</b></u>`).
 * Escape everything, then restore only bare b/i/u/strong/em/br tags (no attributes).
 */
const richText = (value = "") =>
  escapeHtml(value).replace(/&lt;(\/?)(b|i|u|strong|em|br)\s*\/?&gt;/gi, (_, close, tag) =>
    tag.toLowerCase() === "br" ? "<br>" : `<${close}${tag.toLowerCase()}>`,
  );

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Correct answer indices: `answers` (multiple-answer quizzes) or the older single `answer`. */
const answersOf = (question) =>
  Array.isArray(question.answers) && question.answers.length
    ? question.answers.map(Number)
    : Number.isInteger(question.answer)
      ? [question.answer]
      : [];

/** A play button for a saved clip, or a quiet "no audio" tag. */
function playButton(cloudAudio, label, legacyName = "") {
  const url = safeHttpUrl(cloudAudio?.audioUrl);
  if (url) {
    return `<button type="button" class="lv-play" data-audio="${escapeHtml(url)}" aria-label="Play ${escapeHtml(label)}">
      ${icon(ICON_PLAY)}<span class="lv-play__ring" aria-hidden="true"></span>
    </button>`;
  }
  return legacyName
    ? `<span class="lv-noaudio" title="Plays from audio built into the Android app">App audio</span>`
    : `<span class="lv-noaudio">No audio</span>`;
}

function emptyState(text) {
  return `<div class="lv-empty">${icon('<circle cx="12" cy="12" r="9" /><path d="M8 12h8" />')}<p>${escapeHtml(text)}</p></div>`;
}

function sectionHead(title, instruction) {
  return `<header class="lv-section-head">
    <h3>${escapeHtml(title)}</h3>
    ${instruction ? `<p>${richText(instruction)}</p>` : ""}
  </header>`;
}

// Sections

function activityHtml(activity, status) {
  if (status?.completion === "skipped") {
    return emptyState("The Gawain is skipped for this lesson, so it has no activity pages.");
  }
  const pages = activity?.pages || [];
  if (!pages.length) return emptyState("This lesson has no activity yet.");
  return `
    ${sectionHead(activity.title || "Activity", activity.instruction)}
    ${activity.explanation ? `<aside class="lv-callout"><strong>Explanation</strong><p>${richText(activity.explanation)}</p></aside>` : ""}
    <div class="lv-legend"><span class="lv-word is-correct">${icon(ICON_CHECK)}Correct answer</span><span class="lv-word">Other word</span></div>
    <ol class="lv-cards">
      ${pages
        .map((page, index) => {
          const correct = new Set((page.correctIndices || []).map(Number));
          return `<li class="lv-card" style="--i:${index}">
            <span class="lv-card__label">Page ${index + 1}</span>
            <p class="lv-sentence">${(page.words || [])
              .map(
                (word, wordIndex) =>
                  `<span class="lv-word${correct.has(wordIndex) ? " is-correct" : ""}">${correct.has(wordIndex) ? icon(ICON_CHECK) : ""}${escapeHtml(word)}</span>`,
              )
              .join("")}</p>
            <span class="lv-card__meta">${plural(correct.size, "correct word")}</span>
          </li>`;
        })
        .join("")}
    </ol>`;
}

function lecturesHtml(lectures) {
  const pages = lectures?.pages || [];
  if (!pages.length) return emptyState("This lesson has no lecture pages yet.");
  return `
    ${sectionHead(lectures.title || "Lecture", `${plural(pages.length, "page")} · press play to listen to a sentence, or play a whole page.`)}
    <ol class="lv-cards">
      ${pages
        .map((page, pageIndex) => {
          const playable = (page.sentences || []).some((_, i) => safeHttpUrl(page.cloudAudio?.[i]?.audioUrl));
          return `<li class="lv-card lv-lecture" style="--i:${pageIndex}" data-lecture-page>
            <div class="lv-card__top">
              <span class="lv-card__label">Page ${pageIndex + 1}</span>
              ${playable ? `<button type="button" class="lv-playall" data-play-page>${icon(ICON_PLAY)}<span>Play page</span></button>` : ""}
            </div>
            <ol class="lv-lines">
              ${(page.sentences || [])
                .map(
                  (sentence, index) => `<li class="lv-line">
                    ${playButton(page.cloudAudio?.[index], `sentence ${index + 1}`, page.audioResNames?.[index])}
                    <p>${richText(sentence)}</p>
                  </li>`,
                )
                .join("")}
            </ol>
          </li>`;
        })
        .join("")}
    </ol>`;
}

function pronunciationHtml(pronunciation) {
  const words = pronunciation?.words || [];
  if (!words.length) return emptyState("This lesson has no pronunciation words yet.");
  return `
    ${sectionHead(pronunciation.title || "Pronunciation", pronunciation.instruction)}
    <ul class="lv-words">
      ${words
        .map(
          (word, index) => `<li class="lv-wordcard" style="--i:${index}">
            <span class="lv-wordcard__n">${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeHtml(word)}</strong>
            ${playButton(pronunciation.cloudAudio?.[index], word, pronunciation.audioRefs?.[index])}
          </li>`,
        )
        .join("")}
    </ul>`;
}

function quizHtml(quiz) {
  const questions = quiz?.questions || [];
  if (!questions.length) return emptyState("This lesson has no quiz questions yet.");
  return `
    ${sectionHead(quiz.title || "Quiz", plural(questions.length, "question"))}
    <ol class="lv-cards">
      ${questions
        .map((question, index) => {
          const answers = new Set(answersOf(question));
          const multiple = question.multiple === true || answers.size > 1;
          return `<li class="lv-card lv-question" style="--i:${index}">
            <div class="lv-card__top">
              <span class="lv-card__label">Question ${index + 1}</span>
              <span class="lv-tag">${multiple ? "Multiple answers" : "One answer"}</span>
            </div>
            <p class="lv-question__text">${richText(question.question || "")}</p>
            <ul class="lv-choices">
              ${(question.choices || [])
                .map(
                  (choice, choiceIndex) => `<li class="lv-choice${answers.has(choiceIndex) ? " is-correct" : ""}">
                    <span class="lv-choice__key">${answers.has(choiceIndex) ? icon(ICON_CHECK) : "ABC"[choiceIndex] || choiceIndex + 1}</span>
                    <span>${richText(choice)}</span>
                    ${answers.has(choiceIndex) ? '<span class="lv-choice__tag">Correct</span>' : ""}
                  </li>`,
                )
                .join("")}
            </ul>
          </li>`;
        })
        .join("")}
    </ol>`;
}

function gameHtml(levels, status) {
  if (status?.completion === "skipped") {
    return emptyState("The game is skipped for this lesson, so it has no game levels.");
  }
  if (!levels.length) return emptyState("This lesson has no game levels yet.");
  const sorted = [...levels].sort((a, b) => (a.level ?? a.order ?? 0) - (b.level ?? b.order ?? 0));
  return `
    ${sectionHead("Word game", `${plural(sorted.length, "level")} · students spin the letter wheel to fill in the crossword.`)}
    <ol class="lv-levels">
      ${sorted
        .map((level, index) => {
          const { key, words } = splitLevel(level);
          const grid = crosswordHtml([key, ...words]);
          return `<li class="lv-card lv-level" style="--i:${index}">
            <div class="lv-level__info">
              <span class="lv-card__label">Level ${index + 1}</span>
              <span class="lv-level__caption">Letter wheel</span>
              <div class="lv-wheel" aria-label="Key word ${escapeHtml(key)}">
                ${[...key].map((letter, i) => `<span style="--n:${key.length};--k:${i}">${escapeHtml(letter)}</span>`).join("")}
                <b>${escapeHtml(key)}</b>
              </div>
              <span class="lv-level__caption">${plural(words.length, "hidden word")}</span>
              <div class="lv-chips">${words.map((word) => `<span>${escapeHtml(word)}</span>`).join("")}</div>
            </div>
            <figure class="lv-level__grid">
              ${grid || '<p class="lv-muted">Not enough words for a crossword.</p>'}
              <figcaption>As it looks in the app</figcaption>
            </figure>
          </li>`;
        })
        .join("")}
    </ol>`;
}

// Frame

function counts(sections) {
  const lectureSentences = (sections.lectures?.pages || []).flatMap((page) =>
    (page.sentences || []).map((_, i) => page.cloudAudio?.[i]),
  );
  const words = sections.pronunciation?.words || [];
  const clips = [...lectureSentences, ...words.map((_, i) => sections.pronunciation?.cloudAudio?.[i])];
  return {
    activity: sections.activityStatus?.completion === "skipped" ? 0 : sections.activity?.pages?.length || 0,
    lectures: sections.lectures?.pages?.length || 0,
    pronunciation: words.length,
    quiz: sections.quiz?.questions?.length || 0,
    game: sections.gameStatus?.completion === "skipped" ? 0 : sections.game?.length || 0,
    audio: clips.filter((clip) => safeHttpUrl(clip?.audioUrl)).length,
    audioTotal: clips.length,
  };
}

function frameHtml(lesson, editable) {
  const meta = difficulty(lesson.difficulty);
  return `
    <div class="lesson-viewer">
      <header class="lv-hero">
        <div class="lv-hero__text">
          <div class="lv-hero__tags">
            <span class="admin-lesson-difficulty ${meta.className}"><span aria-hidden="true"></span>${meta.label}</span>
            <span class="lv-readonly">${icon(ICON_EYE)}Read only</span>
          </div>
          <h2>${escapeHtml(lesson.title || "Untitled lesson")}</h2>
          <p>${escapeHtml(lesson.description || "No description yet.")}</p>
        </div>
        <dl class="lv-stats" data-stats>
          ${["Lecture Pages", "Questions", "Activity pages", "Words", "Game levels"].map((label) => `<div><dt>${label}</dt><dd class="lv-skeleton"></dd></div>`).join("")}
        </dl>
      </header>

      <nav class="lv-tabs" role="tablist" aria-label="Lesson sections">
        ${SECTIONS.map(
          (section, index) => `<button type="button" role="tab" class="lv-tab" data-tab="${section.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">
            ${icon(section.icon)}<span>${section.label}</span><b class="lv-tab__count" data-count="${section.id}"></b>
          </button>`,
        ).join("")}
      </nav>

      <div class="lv-body" data-body>
        <div class="lv-loading"><span class="lv-skeleton"></span><span class="lv-skeleton"></span><span class="lv-skeleton"></span></div>
      </div>

      <footer class="lv-footer">
        <span class="lv-footer__note" data-audio-note>${icon(ICON_EYE)}Viewing only. Nothing here can be changed.</span>
        <div class="lv-footer__actions">
          <button type="button" class="button secondary" data-close-viewer>Close</button>
          ${editable ? `<button type="button" class="button primary" data-edit-lesson>${icon(ICON_EDIT)}Edit lesson</button>` : ""}
        </div>
      </footer>
    </div>`;
}

/**
 * @param {object} lesson
 * @param {{ loadSections?: (id: string) => Promise<object>, onEdit?: (lesson) => void }} options
 *   Without `onEdit` there is no "Edit lesson" button.
 */
export function openLessonViewer(lesson, { loadSections = loadLessonSections, onEdit } = {}) {
  openModal(frameHtml(lesson, Boolean(onEdit)), (backdrop, close) => {
    const modal = backdrop.querySelector(".modal");
    modal.classList.add("lesson-viewer-modal");
    const body = $("[data-body]", modal);
    const player = new Audio();
    let playing = null; // the button whose clip is playing
    let queue = [];

    // ── Audio: one clip at a time; "Play page" queues a page's sentences ──
    const setPlaying = (button) => {
      playing?.classList.remove("is-playing");
      playing?.closest(".lv-line, .lv-wordcard")?.classList.remove("is-playing");
      playing = button;
      button?.classList.add("is-playing");
      button?.closest(".lv-line, .lv-wordcard")?.classList.add("is-playing");
    };
    const stop = () => {
      player.pause();
      queue = [];
      setPlaying(null);
      $$("[data-play-page].is-playing", modal).forEach((b) => b.classList.remove("is-playing"));
    };
    const play = (button) => {
      setPlaying(button);
      player.src = button.dataset.audio;
      player.play().catch(() => {
        button.classList.add("is-error");
        setPlaying(null);
      });
    };
    player.addEventListener("timeupdate", () => {
      if (playing && player.duration) playing.style.setProperty("--progress", player.currentTime / player.duration);
    });
    player.addEventListener("ended", () => {
      playing?.style.removeProperty("--progress");
      const next = queue.shift();
      if (next) play(next);
      else stop();
    });

    // Stop the audio when the modal goes away, however it's closed.
    const watcher = new MutationObserver(() => {
      if (!backdrop.isConnected) {
        stop();
        watcher.disconnect();
      }
    });
    watcher.observe(document.body, { childList: true });

    // ── Tabs ──
    const tabs = $$(".lv-tab", modal);
    let sections = null;
    const render = {
      activity: () => activityHtml(sections.activity, sections.activityStatus),
      lectures: () => lecturesHtml(sections.lectures),
      pronunciation: () => pronunciationHtml(sections.pronunciation),
      quiz: () => quizHtml(sections.quiz),
      game: () => gameHtml(sections.game || [], sections.gameStatus),
    };
    const select = (id, focus = false) => {
      stop();
      tabs.forEach((tab) => {
        const active = tab.dataset.tab === id;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && focus) tab.focus();
      });
      if (!sections) return;
      body.innerHTML = `<section class="lv-section" role="tabpanel">${render[id]()}</section>`;
      body.scrollTop = 0;
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tab.dataset.tab));
      tab.addEventListener("keydown", (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        select(tabs[(index + step + tabs.length) % tabs.length].dataset.tab, true);
      });
    });

    modal.addEventListener("click", (event) => {
      const clip = event.target.closest("[data-audio]");
      if (clip) {
        if (clip === playing) stop();
        else {
          stop();
          play(clip);
        }
        return;
      }
      const pageButton = event.target.closest("[data-play-page]");
      if (pageButton) {
        const wasPlaying = pageButton.classList.contains("is-playing");
        stop();
        if (wasPlaying) return;
        const clips = $$("[data-audio]", pageButton.closest("[data-lecture-page]"));
        pageButton.classList.add("is-playing");
        queue = clips.slice(1);
        play(clips[0]);
      }
    });

    $("[data-close-viewer]", modal).addEventListener("click", close);
    $("[data-edit-lesson]", modal)?.addEventListener("click", () => {
      close();
      onEdit(lesson);
    });

    // ── Load the content ──
    loadSections(lesson.id)
      .then((loaded) => {
        sections = loaded;
        const c = counts(sections);
        $("[data-stats]", modal).innerHTML = [
          ["Lecture Pages", c.lectures],
          ["Questions", c.quiz],
          ["Activity pages", sections.activityStatus?.completion === "skipped" ? "Skipped" : c.activity],
          ["Words", c.pronunciation],
          ["Game levels", sections.gameStatus?.completion === "skipped" ? "Skipped" : c.game],
        ]
          .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
          .join("");
        SECTIONS.forEach(({ id }) => {
          const value = c[id];
          const badge = $(`[data-count="${id}"]`, modal);
          badge.textContent = value || "";
          badge.hidden = !value;
        });
        if (c.audioTotal) {
          $("[data-audio-note]", modal).innerHTML =
            `${icon(ICON_EYE)}Viewing only · ${c.audio} of ${plural(c.audioTotal, "audio clip")} ready`;
        }
        select(tabs.find((tab) => tab.getAttribute("aria-selected") === "true").dataset.tab);
      })
      .catch((error) => {
        console.error(error);
        body.innerHTML = emptyState("We couldn't load this lesson's content. Close and try again.");
      });
  });
}
