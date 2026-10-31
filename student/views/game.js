import { increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, $$, escapeHtml, navigate, toast } from "../../js/helpers.js";
import { buildCrossword } from "../../admin/views/gameLevels.js";
import {
  student,
  availability,
  clearResume,
  findLesson,
  loadGameLevels,
  loadLessonProgress,
  refreshSummary,
  saveProgress,
  saveResume,
} from "../data.js";
import { onLeave } from "../router.js";
import { buddy, confetti, content, icon } from "../ui.js";

// Laro (the app's CrosswordActivity): swipe across the letter wheel to spell the words
// that fill the crossword. One level at a time; each finished level is saved like the app:
// gameScore/gameTotal/gameFinished, and the Talasalitaan skill counts each word found once
// (wrong swipes don't count). The words found on the level being played are also saved online
// (resume.game.done), so they count if the deadline passes mid-level. The layout is the app's (CrosswordGridBuilder, ported in gameLevels.js).

/** One color per found word (the app's CandyTile.PALETTE). */
const PALETTE = ["#f25c54", "#4f7cec", "#14a396", "#8e5cf0", "#e46f0e", "#e8508f", "#2fa84f"];
const LIPS = ["#c9413a", "#3559c2", "#0c7c72", "#6c3fc8", "#b95606", "#be3570", "#1f8139"];

const normalize = (word) => word.trim().toUpperCase();

/** Every letter needed to spell every word (max count per letter across words), shuffled. */
function wheelLetters(words) {
  const counts = new Map();
  words.forEach((word) => {
    const own = new Map();
    [...normalize(word)].forEach((letter) => own.set(letter, (own.get(letter) || 0) + 1));
    own.forEach((count, letter) => counts.set(letter, Math.max(counts.get(letter) || 0, count)));
  });
  return shuffle([...counts].flatMap(([letter, count]) => Array(count).fill(letter)));
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Words found mid-level stay on this device, like the app keeps them on the phone.
const foundKey = (lessonId, level) => `basaya.crossword.${student.uid}.${lessonId}.${level}`;
function loadFound(lessonId, level) {
  try {
    return JSON.parse(localStorage.getItem(foundKey(lessonId, level)) || "[]");
  } catch {
    return [];
  }
}
function saveFound(lessonId, level, words) {
  try {
    if (words.length) localStorage.setItem(foundKey(lessonId, level), JSON.stringify(words));
    else localStorage.removeItem(foundKey(lessonId, level));
  } catch {
    // Private mode: found words are only kept while the page is open.
  }
}

export async function renderGame(lessonId) {
  const lesson = await findLesson(lessonId);
  const pathUrl = `/lesson/${encodeURIComponent(lessonId)}`;
  if (!lesson) return navigate("/home");
  if (availability(lesson) !== "open" || lesson.gameFinished || lesson.gameSkipped) return navigate(pathUrl);

  content().innerHTML = `<div class="st-focus-loading st-focus-loading--sky"><div class="st-loading"><span></span><span></span><span></span></div></div>`;
  const [levels, progress] = await Promise.all([loadGameLevels(lessonId), loadLessonProgress(lessonId)]);
  if (!levels.length) {
    toast("Walang laro para sa araling ito.");
    return navigate(pathUrl);
  }
  if (progress.gameFinished) return navigate(pathUrl);

  const maxLevel = Math.max(...levels.map((item) => item.level));
  const levelNumber = Math.min((Number(progress.gameScore) || 0) + 1, maxLevel);
  const level = levels.find((item) => item.level === levelNumber);
  if (!level) {
    toast("May problema sa pag-load ng laro.");
    return navigate(pathUrl);
  }
  playLevel({ lessonId, pathUrl, level, levels, lessonTitle: lesson.title });
}

function playLevel({ lessonId, pathUrl, level, levels, lessonTitle }) {
  const words = level.words.map(normalize);
  const grid = buildCrossword(words);
  const found = new Set(loadFound(lessonId, level.level).map(normalize).filter((word) => words.includes(word)));
  let completed = false;

  content().innerHTML = `
    <section class="st-game">
      <span class="st-game__sun" aria-hidden="true"></span>
      <span class="st-game__cloud st-game__cloud--one" aria-hidden="true"></span>
      <span class="st-game__cloud st-game__cloud--two" aria-hidden="true"></span>
      <header class="st-focus-bar st-game__bar">
        <a class="st-icon-button" href="#${pathUrl}" aria-label="Bumalik">${icon("back")}</a>
        <span class="st-game__level">Antas ${level.level}</span>
        <span class="st-game__progress" id="game-progress" role="status"></span>
      </header>
      <div class="st-game__board" id="game-board">
        <div class="st-game__grid" id="game-grid" style="--rows:${grid.rows};--columns:${grid.columns}"></div>
      </div>
      <div class="st-game__preview-row"><span class="st-game__preview" id="game-preview" aria-live="polite"></span></div>
      <div class="st-game__wheel-wrap">
        <div class="st-game__wheel" id="game-wheel" role="group" aria-label="Mga titik: idaan ang daliri sa mga titik para bumuo ng salita">
          <svg class="st-game__line" id="game-line" aria-hidden="true"><polyline points="" /></svg>
          <button class="st-game__shuffle" type="button" id="game-shuffle" aria-label="Haluin ang mga titik">${icon("refresh")}</button>
        </div>
      </div>
    </section>`;

  // Board
  const gridEl = $("#game-grid");
  const cells = new Map(); // "row,column" -> { el, color }
  const wordCells = words.map(() => []);
  grid.placements.forEach((placement) => {
    const word = words[placement.wordIndex];
    [...word].forEach((letter, i) => {
      const down = placement.direction === "down";
      const row = down ? placement.row + i : placement.row;
      const column = down ? placement.column : placement.column + i;
      const key = `${row},${column}`;
      if (!cells.has(key)) {
        const el = document.createElement("span");
        el.className = "st-cell";
        el.style.gridRow = String(row + 1);
        el.style.gridColumn = String(column + 1);
        el.style.setProperty("--i", String(row + column));
        gridEl.append(el);
        cells.set(key, { el, color: null, letter });
      }
      wordCells[placement.wordIndex].push(cells.get(key));
    });
  });

  const fillWord = (wordIndex, animate) => {
    wordCells[wordIndex].forEach((cell, i) => {
      const paint = () => {
        cell.el.textContent = words[wordIndex][i];
        // A crossing cell keeps the color of the word that filled it first.
        if (cell.color == null) {
          cell.color = wordIndex % PALETTE.length;
          cell.el.style.setProperty("--fill", PALETTE[cell.color]);
          cell.el.style.setProperty("--lip-color", LIPS[cell.color]);
          cell.el.classList.add("is-found");
        }
        if (animate) {
          cell.el.classList.remove("is-pop");
          void cell.el.offsetWidth;
          cell.el.classList.add("is-pop");
        }
      };
      if (animate) setTimeout(paint, i * 80);
      else paint();
    });
  };
  words.forEach((word, wordIndex) => found.has(word) && fillWord(wordIndex, false));

  const board = $("#game-board");
  const fitBoard = () => {
    // Fit the whole grid on screen when possible; scroll only for very large grids.
    const gap = 4;
    const width = board.clientWidth - 16;
    const height = board.clientHeight - 16;
    const size = Math.max(26, Math.min(46, (width - (grid.columns - 1) * gap) / grid.columns, (height - (grid.rows - 1) * gap) / grid.rows));
    gridEl.style.setProperty("--cell", `${Math.floor(size)}px`);
  };

  const updateProgress = (animate) => {
    const chip = $("#game-progress");
    chip.textContent = `${found.size}/${words.length}`;
    chip.setAttribute("aria-label", `${found.size} sa ${words.length} na salita ang nahanap`);
    if (animate) {
      chip.classList.remove("is-bump");
      void chip.offsetWidth;
      chip.classList.add("is-bump");
    }
  };
  updateProgress(false);

  // Wheel
  const wheel = $("#game-wheel");
  const line = $("#game-line polyline");
  const preview = $("#game-preview");
  let letters = wheelLetters(words);
  let letterEls = [];

  const layoutWheel = () => {
    const size = wheel.clientWidth;
    const letterSize = letters.length <= 5 ? 60 : letters.length <= 7 ? 52 : 46;
    const radius = size / 2 - letterSize / 2 - 14;
    letterEls.forEach((el, i) => {
      const angle = ((i * 360) / letters.length - 90) * (Math.PI / 180);
      el.style.setProperty("--size", `${letterSize}px`);
      el.style.left = `${size / 2 + radius * Math.cos(angle) - letterSize / 2}px`;
      el.style.top = `${size / 2 + radius * Math.sin(angle) - letterSize / 2}px`;
    });
    $("#game-line").setAttribute("viewBox", `0 0 ${size} ${size}`);
  };

  const buildWheel = () => {
    letterEls.forEach((el) => el.remove());
    letterEls = letters.map((letter, i) => {
      const el = document.createElement("span");
      el.className = "st-wheel-letter";
      el.textContent = letter;
      el.style.setProperty("--i", String(i));
      wheel.append(el);
      return el;
    });
    layoutWheel();
  };
  buildWheel();

  // Swiping
  let selecting = false;
  let selected = [];
  let pointer = null;

  const centerOf = (el) => ({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });
  const drawLine = () => {
    const points = selected.map((el) => centerOf(el));
    if (pointer && selecting) points.push(pointer);
    line.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
  };
  const letterAt = (x, y) =>
    letterEls.find((el) => {
      const c = centerOf(el);
      // Slightly generous hit area so small fingers don't miss letters.
      return Math.hypot(x - c.x, y - c.y) <= (el.offsetWidth / 2) * 1.1;
    });
  const localPoint = (event) => {
    const box = wheel.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const showPreview = (text, state = "") => {
    preview.textContent = text;
    preview.className = `st-game__preview${text ? " is-shown" : ""}${state ? ` is-${state}` : ""}`;
  };
  const pick = (el) => {
    selected.push(el);
    el.classList.add("is-selected");
    showPreview(selected.map((item) => item.textContent).join(""));
    navigator.vibrate?.(8);
  };

  wheel.addEventListener("pointerdown", (event) => {
    if (completed || shuffling) return;
    const point = localPoint(event);
    const el = letterAt(point.x, point.y);
    if (!el) return;
    event.preventDefault();
    try {
      wheel.setPointerCapture(event.pointerId); // keep the swipe even if the finger leaves the wheel
    } catch {
      // Some browsers refuse capture for synthetic or already-ended pointers; the swipe still works.
    }
    selecting = true;
    selected = [];
    pointer = point;
    pick(el);
    drawLine();
  });
  wheel.addEventListener("pointermove", (event) => {
    if (!selecting) return;
    pointer = localPoint(event);
    const el = letterAt(pointer.x, pointer.y);
    if (el && !selected.includes(el)) pick(el);
    drawLine();
  });

  const endSelection = (submit) => {
    if (!selecting) return;
    selecting = false;
    const word = selected.map((el) => el.textContent).join("");
    selected.forEach((el) => el.classList.remove("is-selected"));
    selected = [];
    pointer = null;
    drawLine();
    const wordIndex = words.indexOf(word);
    if (!submit || word.length < 2) {
      // A single tapped letter is just a cancel, not a wrong answer.
      showPreview("");
    } else if (wordIndex === -1) {
      showPreview(word, "error");
      setTimeout(() => showPreview(""), 600);
    } else if (found.has(word)) {
      showPreview("");
      wordCells[wordIndex].forEach((cell, i) => {
        cell.el.classList.remove("is-pop");
        void cell.el.offsetWidth;
        setTimeout(() => cell.el.classList.add("is-pop"), i * 40);
      });
    } else {
      onWordFound(word, wordIndex);
    }
  };
  wheel.addEventListener("pointerup", () => endSelection(true));
  wheel.addEventListener("pointercancel", () => endSelection(false));
  wheel.addEventListener("lostpointercapture", () => endSelection(true));

  // Shuffle
  let shuffling = false;
  // The same letter tiles glide around the wheel to their new places (no fade out and in).
  $("#game-shuffle").addEventListener("click", (event) => {
    if (shuffling || selecting || letterEls.length < 2) return;
    shuffling = true;
    const button = event.currentTarget;
    button.classList.add("is-spinning-once");
    const spelled = (list) => list.map((el) => el.textContent).join("");
    let next = shuffle(letterEls);
    // Make sure something moves: fall back to turning the wheel one step.
    if (spelled(next) === spelled(letterEls)) next = [...letterEls.slice(1), letterEls[0]];
    letterEls = next;
    letters = next.map((el) => el.textContent);
    wheel.classList.add("is-shuffling", "is-dipping");
    layoutWheel();
    setTimeout(() => wheel.classList.remove("is-dipping"), 270);
    setTimeout(() => {
      wheel.classList.remove("is-shuffling");
      button.classList.remove("is-spinning-once");
      shuffling = false;
    }, 560);
  });

  // Finding words
  const onWordFound = async (word, wordIndex) => {
    found.add(word);
    saveFound(lessonId, level.level, [...found]);
    if (found.size < words.length)
      saveResume(lessonId, "game", { done: found.size, total: words.length, level: level.level });
    showPreview(word, "success");
    setTimeout(() => showPreview(""), 700);
    const box = preview.getBoundingClientRect();
    confetti({ count: 24, x: box.left + box.width / 2, y: box.top + box.height / 2 });
    fillWord(wordIndex, true);
    updateProgress(true);

    if (completed || !words.every((item) => found.has(item))) return;
    completed = true;
    setTimeout(() => {
      $$(".st-cell", gridEl).forEach((cell) => cell.classList.add("is-cheer"));
      confetti({ count: 140 });
    }, 500);

    const total = levels.length;
    try {
      await saveProgress(lessonId, {
        gameScore: level.level,
        gameTotal: total,
        gameFinished: level.level >= total,
        gameCompletedAt: serverTimestamp(),
        ...clearResume("game"),
        // Talasalitaan: levels add up (the app's SkillProgressRepository.addCrosswordLevel).
        skills: {
          talasalitaan: {
            correct: increment(words.length),
            attempts: increment(words.length),
            items: increment(words.length),
            levels: increment(1),
            completedAt: serverTimestamp(),
          },
        },
      });
      saveFound(lessonId, level.level, []);
      refreshSummary();
    } catch (error) {
      console.error("Failed to save game progress", error);
      toast(
        error?.code === "permission-denied"
          ? "Sarado na ang aralin. Hindi na-save ang laro."
          : "Hindi na-save ang laro. Subukan muli.",
      );
      completed = false;
      return;
    }
    setTimeout(() => {
      if ($("#game-grid")) showLevelComplete({ lessonId, pathUrl, levelNumber: level.level, total, lessonTitle });
    }, 2000);
  };

  // Fit to the screen
  const onResize = () => {
    fitBoard();
    layoutWheel();
    drawLine();
  };
  window.addEventListener("resize", onResize);
  onLeave(() => window.removeEventListener("resize", onResize));
  requestAnimationFrame(onResize);
  fitBoard();
}

/** The app's CrosswordCompleteScreen: "Antas X / N", then the next level or back to the lesson. */
function showLevelComplete({ lessonId, pathUrl, levelNumber, total, lessonTitle }) {
  const last = levelNumber >= total;
  // A Practice lesson can be played again from level 1 (nothing was saved).
  const replay = last && student.lessons.some((lesson) => lesson.id === lessonId && lesson.practice);
  content().innerHTML = `
    <section class="st-results st-level-done">
      ${buddy("happy", "st-results__buddy")}
      <p class="st-results__title">${escapeHtml(lessonTitle || "BaSaya")}</p>
      <h1>${last ? "Natapos mo ang Laro!" : `Natapos mo ang Antas ${levelNumber}!`}</h1>
      <div class="st-card st-results__card">
        <span class="st-results__label">Antas</span>
        <strong class="st-results__score">${levelNumber} / ${total}</strong>
        <span class="st-bar st-level-done__bar"><i style="width:${Math.round((levelNumber * 100) / total)}%"></i></span>
      </div>
      <button class="button primary st-wide st-big" type="button" id="level-next">${last ? "TAPOS NA" : "SUSUNOD NA ANTAS"}</button>
      ${last ? "" : `<a class="button secondary st-wide" href="#${pathUrl}">Bumalik sa aralin</a>`}
      ${replay ? `<p class="st-results__practice">${icon("refresh")}Pagsasanay lang ito. Hindi naitatala ang iyong iskor.</p><button class="button secondary st-wide" type="button" id="level-replay">Maglaro muli</button>` : ""}
    </section>`;
  if (last) confetti({ count: 140 });
  $("#level-next").addEventListener("click", () => {
    if (last) navigate(pathUrl);
    else renderGame(lessonId);
  });
  $("#level-replay")?.addEventListener("click", () => renderGame(lessonId));
}
