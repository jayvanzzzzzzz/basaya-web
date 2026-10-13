import { $, $$, escapeHtml } from "../../js/helpers.js";

// Game level builder for the lesson studio (admin/views/lessons.js).
// A level is a key word (the wheel's letters) plus words built from those letters. It is
// saved as the same `words` list the app reads: key word first, then the rest longest
// first. The preview uses the app's crossword layout (CrosswordGridBuilder.kt).
// Styles: css/pages/game-levels.css.

export const KEY_MAX = 7;
export const WORD_MAX = 7;
export const WORD_MIN = 3;
export const WORDS_MIN = 1;
export const WORDS_MAX = 4;
const SUGGESTIONS_MAX = 6;

const LETTERS = /^[A-ZÑ]+$/;
const normalize = (value = "") => String(value).trim().toUpperCase().replace(/\s+/g, "");

const countLetters = (word) =>
  [...word].reduce((counts, letter) => counts.set(letter, (counts.get(letter) || 0) + 1), new Map());

/** Why the key word can't be used, or "". */
export function keyWordIssue(key) {
  if (!key) return "Type the key word first.";
  if (!LETTERS.test(key)) return "Use letters only (no spaces, numbers or dashes).";
  if (key.length < WORD_MIN) return `The key word needs at least ${WORD_MIN} letters.`;
  if (key.length > KEY_MAX) return `Too long for the letter wheel: the key word can have at most ${KEY_MAX} letters.`;
  return "";
}

// ───────────────────────────── Suggestions ─────────────────────────────
// When a typed word is longer than 7 letters, the builder suggests words from the
// lesson itself (pronunciation, activity, lectures, quiz), so the game reviews them.

// Function words make poor game words, so they're never suggested.
const COMMON = new Set(
  (
    "ANG MGA NANG ITO IYAN IYON DITO DIYAN DOON SIYA SILA KAMI TAYO KAYO AKO IKAW NILA NIYA " +
    "NAMIN NATIN NINYO KANYA KANILA PARA KUNG PERO DAHIL MAY MAYROON HINDI NGA LAMANG LANG RIN " +
    "DIN DAW RAW KAY KINA SINA NINA ALIN ANO SINO SAAN KAILAN BAKIT PAANO ILAN YUNG ITONG IYONG " +
    "AKING ATING AMING KANILANG ISANG MAS PAG NIYANG THE AND ARE WAS FOR WITH THIS THAT"
  ).split(" "),
);

/** Unique 3–7 letter words from free text, uppercased. */
export function wordsFromText(texts) {
  const words = texts
    .join(" ")
    .toUpperCase()
    .normalize("NFD")
    .replace(/Ñ/g, "Ñ")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-ZÑ]+/)
    .filter((word) => word.length >= WORD_MIN && word.length <= WORD_MAX && !COMMON.has(word));
  return [...new Set(words)];
}

/** Letters `a` and `b` have in common, counting repeats. */
function sharedLetters(a, b) {
  const have = countLetters(b);
  return [...a].filter((letter) => {
    const left = have.get(letter) || 0;
    if (left) have.set(letter, left - 1);
    return left > 0;
  }).length;
}

/**
 * Key words to try instead of `typed` (too long): lesson words found inside it first,
 * then the ones that give students the most words to make.
 * Returns [{ word, makes }] where `makes` counts lesson words built from its letters.
 */
export function suggestKeyWords(typed, lessonWords) {
  return lessonWords
    .filter((word) => word.length >= 4 && word !== typed)
    .map((word) => ({
      word,
      inside: typed.includes(word),
      makes: lessonWords.filter((other) => other !== word && !wordIssue(other, word)).length,
      shared: sharedLetters(word, typed),
    }))
    .filter((item) => item.inside || item.makes > 0)
    .sort((a, b) => b.inside - a.inside || b.makes - a.makes || b.shared - a.shared || b.word.length - a.word.length)
    .slice(0, SUGGESTIONS_MAX);
}

/** Hidden words that fit `key`, from the lesson, not yet added. Longest first. */
export function suggestWords(key, lessonWords, added = []) {
  return lessonWords
    .filter((word) => !wordIssue(word, key, added))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, SUGGESTIONS_MAX);
}

/** Why `word` can't be built from the key word's letters, or "". */
export function wordIssue(word, key, others = []) {
  if (!LETTERS.test(word)) return "Use letters only.";
  if (word.length < WORD_MIN) return `Needs at least ${WORD_MIN} letters.`;
  if (word.length > WORD_MAX) return `Too long: words can have at most ${WORD_MAX} letters.`;
  if (word === key) return "Same as the key word.";
  if (others.includes(word)) return "Already added.";
  if (!key) return "";
  if (word.length > key.length) return `Longer than the key word (${key.length} letters).`;

  const have = countLetters(key);
  const need = countLetters(word);
  const missing = [...need.keys()].filter((letter) => !have.has(letter));
  if (missing.length) {
    return `${key} has no ${missing.map((letter) => `“${letter}”`).join(" or ")}.`;
  }
  const overused = [...need].find(([letter, count]) => count > have.get(letter));
  if (overused) {
    const [letter, count] = overused;
    const times = (n) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
    return `Uses “${letter}” ${times(count)}, but ${key} has it only ${times(have.get(letter))}.`;
  }
  return "";
}

/** Which key-word tiles a word uses (indices), e.g. for highlighting. */
export function tilesFor(word, key) {
  const used = new Set();
  for (const letter of word) {
    const index = [...key].findIndex((tile, i) => tile === letter && !used.has(i));
    if (index >= 0) used.add(index);
  }
  return used;
}

// ───────────── Crossword layout: a port of the app's CrosswordGridBuilder.kt ─────────────

const ACROSS = "across";
const DOWN = "down";
const at = (placement, index) =>
  placement.direction === ACROSS
    ? { row: placement.row, column: placement.column + index }
    : { row: placement.row + index, column: placement.column };
const cellKey = ({ row, column }) => `${row},${column}`;

export function buildCrossword(words) {
  if (!words.length) return { placements: [], rows: 0, columns: 0, detached: [] };
  const occupied = new Map();
  const placements = [{ wordIndex: 0, row: 0, column: 0, direction: ACROSS }];
  const detached = [];
  const add = (word, placement) =>
    [...word].forEach((letter, index) => {
      const key = cellKey(at(placement, index));
      const existing = occupied.get(key);
      occupied.set(key, {
        letter,
        directions: new Set([...(existing?.directions || []), placement.direction]),
      });
    });
  const preferred = (index) => (index % 2 === 0 ? ACROSS : DOWN);
  add(words[0], placements[0]);

  for (let wordIndex = 1; wordIndex < words.length; wordIndex += 1) {
    const word = words[wordIndex];
    const candidates = new Map();
    for (const direction of [ACROSS, DOWN]) {
      for (const placed of placements) {
        if (placed.direction === direction) continue;
        const placedWord = words[placed.wordIndex];
        for (let newIndex = 0; newIndex < word.length; newIndex += 1) {
          for (let oldIndex = 0; oldIndex < placedWord.length; oldIndex += 1) {
            if (word[newIndex] !== placedWord[oldIndex]) continue;
            const crossing = at(placed, oldIndex);
            const candidate =
              direction === ACROSS
                ? { wordIndex, row: crossing.row, column: crossing.column - newIndex, direction }
                : { wordIndex, row: crossing.row - newIndex, column: crossing.column, direction };
            const intersections = validIntersections(word, candidate, occupied);
            if (intersections == null) continue;
            const cells = [...placements, candidate].flatMap((p) => {
              const length = p === candidate ? word.length : words[p.wordIndex].length;
              return [at(p, 0), at(p, length - 1)];
            });
            const rows = Math.max(...cells.map((c) => c.row)) - Math.min(...cells.map((c) => c.row)) + 1;
            const columns =
              Math.max(...cells.map((c) => c.column)) - Math.min(...cells.map((c) => c.column)) + 1;
            candidates.set(`${direction}:${candidate.row},${candidate.column}`, {
              placement: candidate,
              intersections,
              area: rows * columns,
            });
          }
        }
      }
    }

    const best = [...candidates.values()].sort(
      (a, b) =>
        b.intersections - a.intersections ||
        a.area - b.area ||
        (b.placement.direction === preferred(wordIndex)) - (a.placement.direction === preferred(wordIndex)),
    )[0];
    let placement = best?.placement;
    if (!placement) {
      // Like the app: a word that can't cross anything is set apart.
      detached.push(word);
      const ends = placements.map((p) => at(p, words[p.wordIndex].length - 1));
      placement =
        preferred(wordIndex) === ACROSS
          ? { wordIndex, row: Math.max(...ends.map((c) => c.row)) + 2, column: Math.min(...placements.map((p) => p.column)), direction: ACROSS }
          : { wordIndex, row: Math.min(...placements.map((p) => p.row)), column: Math.max(...ends.map((c) => c.column)) + 2, direction: DOWN };
    }
    placements.push(placement);
    add(word, placement);
  }

  const minRow = Math.min(...placements.map((p) => p.row));
  const minColumn = Math.min(...placements.map((p) => p.column));
  const normalized = placements.map((p) => ({ ...p, row: p.row - minRow, column: p.column - minColumn }));
  const ends = normalized.map((p) => at(p, words[p.wordIndex].length - 1));
  return {
    placements: normalized,
    rows: Math.max(...ends.map((c) => c.row)) + 1,
    columns: Math.max(...ends.map((c) => c.column)) + 1,
    detached,
  };
}

function validIntersections(word, candidate, occupied) {
  let intersections = 0;
  for (let index = 0; index < word.length; index += 1) {
    const position = at(candidate, index);
    const existing = occupied.get(cellKey(position));
    if (existing) {
      if (existing.letter !== word[index] || existing.directions.has(candidate.direction)) return null;
      intersections += 1;
    } else {
      const neighbors =
        candidate.direction === ACROSS
          ? [{ ...position, row: position.row - 1 }, { ...position, row: position.row + 1 }]
          : [{ ...position, column: position.column - 1 }, { ...position, column: position.column + 1 }];
      if (neighbors.some((cell) => occupied.has(cellKey(cell)))) return null;
    }
  }
  if (!intersections) return null;
  const first = at(candidate, 0);
  const last = at(candidate, word.length - 1);
  const before =
    candidate.direction === ACROSS ? { ...first, column: first.column - 1 } : { ...first, row: first.row - 1 };
  const after =
    candidate.direction === ACROSS ? { ...last, column: last.column + 1 } : { ...last, row: last.row + 1 };
  if (occupied.has(cellKey(before)) || occupied.has(cellKey(after))) return null;
  return intersections;
}

// ───────────────────────────── Markup ─────────────────────────────

/** Old levels were a plain list: the longest word becomes the key word. */
export function splitLevel(level = {}) {
  const words = (level.words || []).map(normalize).filter(Boolean);
  if (!words.length) return { key: "", words: [] };
  const keyIndex = words.reduce((best, word, index) => (word.length > words[best].length ? index : best), 0);
  return { key: words[keyIndex], words: words.filter((_, index) => index !== keyIndex) };
}

const chipHtml = (word) =>
  `<span class="word-chip" data-word-chip="${escapeHtml(word)}" tabindex="0">
    <span class="word-chip__text">${escapeHtml(word)}</span>
    <span class="word-chip__state" aria-hidden="true"></span>
    <button type="button" class="word-chip__remove" data-remove-word aria-label="Remove ${escapeHtml(word)}">×</button>
  </span>`;

export function gameLevelHtml(level = {}) {
  const { key, words } = splitLevel(level);
  return `
    <article class="builder-card game-builder" data-game-level>
      <header class="game-builder__header">
        <div class="game-builder__title">
          <strong>Level <span data-level-number></span></strong>
          <span class="game-builder__status" data-level-status></span>
        </div>
        <button type="button" class="text-button danger" data-remove-game-level>Remove</button>
      </header>

      <div class="game-builder__body">
        <div class="game-builder__editor">
          <label class="game-builder__field">
            <span class="game-builder__label">Key word <small>${WORD_MIN}–${KEY_MAX} letters · the student's letter wheel</small></span>
            <input class="game-builder__key" data-key-word value="${escapeHtml(key)}" maxlength="24"
              placeholder="LAMESA" autocomplete="off" spellcheck="false" autocapitalize="characters" />
          </label>
          <div class="letter-tiles" data-letter-tiles aria-hidden="true"></div>
          <div class="word-suggest" data-key-suggest aria-live="polite" hidden></div>

          <div class="game-builder__field">
            <span class="game-builder__label">Words from these letters <small data-word-count></small></span>
            <div class="word-field" data-word-field>
              ${words.map(chipHtml).join("")}
              <input class="word-field__input" data-word-input autocomplete="off" spellcheck="false"
                autocapitalize="characters" aria-label="Add a word" />
            </div>
            <p class="game-builder__hint" data-word-hint>Press Enter to add · ${WORDS_MIN}–${WORDS_MAX} words · ${WORD_MIN}–${WORD_MAX} letters each</p>
            <div class="word-suggest" data-word-suggest aria-live="polite" hidden></div>
          </div>

          <ul class="game-builder__issues" data-level-issues hidden></ul>
          <div class="game-builder__skip-tip" data-skip-tip hidden>
            <span>Having a hard time finding words? You can skip the game for this lesson.</span>
            <button type="button" class="button secondary small" data-skip-game-tip>Skip game</button>
          </div>
        </div>

        <figure class="crossword-preview" data-crossword-preview>
          <figcaption>Preview <small>as it looks in the app</small></figcaption>
          <div class="crossword-preview__stage" data-crossword-stage></div>
        </figure>
      </div>
    </article>`;
}

// ───────────────────────────── State per level ─────────────────────────────

const chipWords = (level) => $$("[data-word-chip]", level).map((chip) => chip.dataset.wordChip);
const keyOf = (level) => normalize($("[data-key-word]", level).value);

/** Checks a level; returns { ok, empty, issues: [text], wordIssues: Map(word → text) }. */
export function checkLevel(level) {
  const key = keyOf(level);
  const words = chipWords(level);
  const issues = [];
  const wordIssues = new Map();
  const empty = !key && !words.length;

  const keyProblem = keyWordIssue(key);
  if (keyProblem) issues.push(keyProblem);
  words.forEach((word, index) => {
    const problem = wordIssue(word, keyProblem ? "" : key, words.slice(0, index));
    if (problem) wordIssues.set(word, problem);
  });
  wordIssues.forEach((problem, word) => issues.push(`${word}: ${problem}`));
  if (words.length < WORDS_MIN) issues.push(`Add at least ${WORDS_MIN} word from the key word's letters.`);
  if (words.length > WORDS_MAX) issues.push(`Use at most ${WORDS_MAX} words (remove ${words.length - WORDS_MAX}).`);

  return { ok: !issues.length, empty, issues, wordIssues, key, words };
}

/** Words to save: key word first, then the rest longest first. */
export function levelWords(level) {
  const words = [...chipWords(level)].sort((a, b) => b.length - a.length);
  return [keyOf(level), ...words];
}

function renderTiles(level, key, highlight = new Set(), missing = false) {
  const tiles = $("[data-letter-tiles]", level);
  const letters = [...key].filter((letter) => LETTERS.test(letter));
  if (tiles.dataset.key !== key) {
    tiles.dataset.key = key;
    tiles.innerHTML = letters.length
      ? letters.map((letter, index) => `<span class="letter-tile" style="--i:${index}">${escapeHtml(letter)}</span>`).join("")
      : '<span class="letter-tiles__empty">Letters appear here</span>';
  }
  $$(".letter-tile", tiles).forEach((tile, index) => tile.classList.toggle("is-used", highlight.has(index)));
  tiles.classList.toggle("is-missing", missing);
}

/** Key word first, the rest longest first, laid out like the app; one entry per grid cell. */
function layoutCells(list) {
  const ordered = [list[0], ...list.slice(1).sort((a, b) => b.length - a.length)];
  const grid = buildCrossword(ordered);
  const cells = new Map();
  grid.placements.forEach((placement) => {
    const word = ordered[placement.wordIndex];
    [...word].forEach((letter, index) => {
      const position = at(placement, index);
      const id = cellKey(position);
      const cell = cells.get(id) || { ...position, letter, key: false, words: 0 };
      cell.words += 1;
      if (placement.wordIndex === 0) cell.key = true;
      cells.set(id, cell);
    });
  });
  return { grid, cells };
}

/** A finished crossword for read-only views: [keyWord, ...words]. */
export function crosswordHtml(list) {
  if (list.length < 2) return "";
  const { grid, cells } = layoutCells(list);
  return `<div class="crossword-grid" style="--rows:${grid.rows};--columns:${grid.columns}">${[...cells.values()]
    .map(
      (cell, index) =>
        `<span class="crossword-cell is-new${cell.key ? " is-key" : ""}${cell.words > 1 ? " is-cross" : ""}" style="grid-row:${cell.row + 1};grid-column:${cell.column + 1};--i:${index}">${escapeHtml(cell.letter)}</span>`,
    )
    .join("")}</div>`;
}

function renderPreview(level, key, words, valid) {
  const stage = $("[data-crossword-stage]", level);
  const list = [key, ...words.filter((word) => valid.has(word))].filter(Boolean);
  if (keyWordIssue(key) || list.length < 2) {
    stage.innerHTML = `<p class="crossword-preview__empty">${
      keyWordIssue(key) ? "Type a key word to start." : "Add a word to see the crossword."
    }</p>`;
    stage.dataset.cells = "";
    return [];
  }
  const { grid, cells } = layoutCells(list);
  const previous = new Set((stage.dataset.cells || "").split("|"));
  const ids = [...cells.values()].map((cell) => `${cellKey(cell)}${cell.letter}`);
  stage.dataset.cells = ids.join("|");
  stage.innerHTML = `<div class="crossword-grid" style="--rows:${grid.rows};--columns:${grid.columns}">${[...cells.values()]
    .map(
      (cell, index) =>
        `<span class="crossword-cell${cell.key ? " is-key" : ""}${cell.words > 1 ? " is-cross" : ""}${
          previous.has(ids[index]) ? "" : " is-new"
        }" style="grid-row:${cell.row + 1};grid-column:${cell.column + 1};--i:${index}">${escapeHtml(cell.letter)}</span>`,
    )
    .join("")}</div>`;
  return grid.detached;
}

// Where suggestions come from; set by wireGameLevels (one lesson studio is open at a time).
let lessonWordsOf = () => [];

const ICON_SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9 12 3.5Z" /></svg>';

function suggestBoxHtml(title, lead, buttons, fallback) {
  return `<p class="word-suggest__title">${ICON_SPARK}<span>${escapeHtml(title)}</span></p>
    ${
      buttons.length
        ? `<p class="word-suggest__lead">${escapeHtml(lead)}</p><div class="word-suggest__list">${buttons.join("")}</div>`
        : `<p class="word-suggest__lead">${escapeHtml(fallback)}</p>`
    }`;
}

/** Fills (or hides) a suggestion box; only re-renders when its content changes. */
function setSuggestBox(box, html) {
  if (box.dataset.html !== html) {
    box.dataset.html = html;
    box.innerHTML = html;
  }
  box.hidden = !html;
}

function renderSuggestions(level, key, words, typing) {
  const lessonWords = lessonWordsOf();

  // Key word longer than the wheel holds
  let keyHtml = "";
  if (key.length > KEY_MAX && LETTERS.test(key)) {
    const picks = suggestKeyWords(key, lessonWords);
    keyHtml = suggestBoxHtml(
      `${key} has ${key.length} letters, but the wheel holds ${KEY_MAX}.`,
      "Try a key word from this lesson:",
      picks.map(
        ({ word, makes, inside }) =>
          `<button type="button" class="suggest-chip" data-use-key="${escapeHtml(word)}">
            <strong>${escapeHtml(word)}</strong>
            <small>${inside ? "in your word" : `makes ${makes} word${makes === 1 ? "" : "s"}`}</small>
          </button>`,
      ),
      "Try a shorter word. One part of a compound word often works, like SILID from SILID-AKLATAN.",
    );
  }
  setSuggestBox($("[data-key-suggest]", level), keyHtml);

  // A hidden word longer than 7 letters
  let wordHtml = "";
  if (typing.length > WORD_MAX && LETTERS.test(typing)) {
    const keyReady = !keyWordIssue(key);
    const picks = keyReady && words.length < WORDS_MAX ? suggestWords(key, lessonWords, words) : [];
    wordHtml = suggestBoxHtml(
      `${typing} has ${typing.length} letters; game words can have up to ${WORD_MAX}.`,
      `Words from this lesson that fit ${key}:`,
      picks.map(
        (word) =>
          `<button type="button" class="suggest-chip" data-use-word="${escapeHtml(word)}">
            <strong>${escapeHtml(word)}</strong><small>${word.length} letters</small>
          </button>`,
      ),
      keyReady
        ? `No lesson words fit ${key}'s letters yet. Try a shorter word using only ${[...new Set(key)].join(", ")}.`
        : "Set a key word of 3 to 7 letters first, then add shorter words made from its letters.",
    );
  }
  setSuggestBox($("[data-word-suggest]", level), wordHtml);
}

/** Re-checks a level and updates its tiles, chips, issues, status and preview. */
export function refreshLevel(level) {
  const result = checkLevel(level);
  const { key, words, wordIssues } = result;
  const keyProblem = keyWordIssue(key);

  // Chips
  $$("[data-word-chip]", level).forEach((chip) => {
    const problem = wordIssues.get(chip.dataset.wordChip);
    chip.classList.toggle("is-invalid", Boolean(problem));
    chip.classList.toggle("is-valid", !problem && !keyProblem);
    chip.title = problem || "";
  });

  // Typing feedback: which tiles the word in progress uses
  const input = $("[data-word-input]", level);
  const typing = normalize(input.value);
  const typingProblem = typing && !keyProblem ? wordIssue(typing, key, words) : "";
  // Short, unfinished words aren't errors yet: only after Enter.
  const showTypingProblem =
    typingProblem && (input.dataset.force === "1" || !/at least|Already|Same as/.test(typingProblem));
  input.classList.toggle("is-invalid", Boolean(showTypingProblem));
  renderTiles(level, keyProblem && key.length > KEY_MAX ? key.slice(0, KEY_MAX) : key, typing ? tilesFor(typing, key) : new Set(), Boolean(showTypingProblem));

  const hint = $("[data-word-hint]", level);
  hint.classList.toggle("is-error", Boolean(showTypingProblem));
  hint.textContent = showTypingProblem
    ? typingProblem
    : words.length >= WORDS_MAX
      ? `That's the maximum of ${WORDS_MAX} words for a level.`
      : `Press Enter to add · ${WORDS_MIN}–${WORDS_MAX} words · ${WORD_MIN}–${WORD_MAX} letters each`;
  input.hidden = words.length >= WORDS_MAX && !typing;
  input.placeholder = words.length ? "Add another word…" : key ? `A word from ${key}…` : "Type a word, press Enter";
  $("[data-word-count]", level).textContent = `${words.length} of ${WORDS_MAX}`;
  renderSuggestions(level, key, words, typing);

  // Preview (valid words only)
  const valid = new Set(words.filter((word) => !wordIssues.has(word)));
  const detached = renderPreview(level, key, words, valid);

  // Issues are shown once the level has been checked on save, or for words already added.
  const shown = level.classList.contains("was-checked")
    ? result.issues
    : [...wordIssues].map(([word, problem]) => `${word}: ${problem}`);
  const notes = detached.map((word) => `${word} doesn't cross another word, so it will sit apart.`);
  const issueList = $("[data-level-issues]", level);
  issueList.innerHTML =
    shown.map((text) => `<li>${escapeHtml(text)}</li>`).join("") +
    notes.map((text) => `<li class="is-note">${escapeHtml(text)}</li>`).join("");
  issueList.hidden = !shown.length && !notes.length;
  $("[data-skip-tip]", level).hidden = !level.classList.contains("was-checked") || result.ok;

  // Status
  const status = $("[data-level-status]", level);
  const state = result.ok ? "ready" : result.empty ? "empty" : "issues";
  status.dataset.state = state;
  status.textContent =
    state === "ready" ? "Ready" : state === "empty" ? "Empty" : `${result.issues.length} to fix`;
  level.classList.toggle("is-invalid", level.classList.contains("was-checked") && !result.ok);
  return result;
}

// ───────────────────────────── Events ─────────────────────────────

function addWords(level, raw) {
  const input = $("[data-word-input]", level);
  const parts = String(raw).split(/[\s,;]+/).map(normalize).filter(Boolean);
  let added = 0;
  for (const word of parts) {
    if (chipWords(level).length >= WORDS_MAX) break;
    if (chipWords(level).includes(word)) {
      flash($(`[data-word-chip="${CSS.escape(word)}"]`, level));
      continue;
    }
    input.insertAdjacentHTML("beforebegin", chipHtml(word));
    added += 1;
  }
  return added;
}

function flash(element) {
  if (!element) return;
  element.classList.remove("is-shaking");
  void element.offsetWidth;
  element.classList.add("is-shaking");
}

/**
 * Wires every level inside `container` (works for levels added later too).
 * `lessonWords()` returns the lesson's 3–7 letter words, used for suggestions.
 */
export function wireGameLevels(container, { onSkipGame, lessonWords } = {}) {
  if (lessonWords) lessonWordsOf = lessonWords;
  container.addEventListener("input", (event) => {
    const level = event.target.closest("[data-game-level]");
    if (!level) return;
    if (event.target.matches("[data-key-word]")) {
      const clean = event.target.value.toUpperCase().replace(/[^A-ZÑ]/g, "");
      if (clean !== event.target.value) event.target.value = clean;
    }
    if (event.target.matches("[data-word-input]")) {
      delete event.target.dataset.force;
      const value = event.target.value;
      if (/[\s,;]/.test(value)) {
        // Space or comma works like Enter; a word that fails stays in the box.
        const key = keyOf(level);
        const parts = value.split(/[\s,;]+/).map(normalize).filter(Boolean);
        if (keyWordIssue(key)) {
          event.target.value = parts.join("");
          flash($("[data-key-word]", level));
          refreshLevel(level);
          return;
        }
        const rejected = parts.find((word) => wordIssue(word, key, chipWords(level)));
        addWords(level, parts.filter((word) => word !== rejected && !wordIssue(word, key, chipWords(level))).join(" "));
        event.target.value = rejected || "";
        if (rejected) {
          event.target.dataset.force = "1";
          flash(event.target);
        }
      } else {
        event.target.value = value.toUpperCase().replace(/[^A-ZÑ]/g, "");
      }
    }
    refreshLevel(level);
  });

  container.addEventListener("keydown", (event) => {
    const level = event.target.closest("[data-game-level]");
    if (!level) return;
    const input = event.target.closest("[data-word-input]");
    if (event.target.matches("[data-key-word]") && event.key === "Enter") {
      event.preventDefault();
      $("[data-word-input]", level).focus();
      return;
    }
    if (input && event.key === "Enter") {
      event.preventDefault(); // Never submits the lesson form.
      const word = normalize(input.value);
      if (!word) return;
      const key = keyOf(level);
      if (keyWordIssue(key)) {
        const keyInput = $("[data-key-word]", level);
        flash(keyInput);
        keyInput.focus();
        return;
      }
      if (wordIssue(word, key, chipWords(level))) {
        // Keep the word in the box and show why it can't be added.
        input.dataset.force = "1";
        refreshLevel(level);
        flash(input);
        return;
      }
      addWords(level, word);
      input.value = "";
      refreshLevel(level);
      input.focus();
    }
    if (input && event.key === "Backspace" && !input.value) {
      // Pull the last word back into the box to edit it.
      const last = $$("[data-word-chip]", level).pop();
      if (!last) return;
      event.preventDefault();
      input.value = last.dataset.wordChip;
      last.remove();
      refreshLevel(level);
    }
    const chip = event.target.closest("[data-word-chip]");
    if (chip && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      chip.remove();
      refreshLevel(level);
      $("[data-word-input]", level).focus();
    }
  });

  container.addEventListener("paste", (event) => {
    const input = event.target.closest("[data-word-input]");
    if (!input) return;
    const text = event.clipboardData?.getData("text") || "";
    if (!/[\s,;]/.test(text.trim())) return;
    event.preventDefault();
    addWords(input.closest("[data-game-level]"), text);
    refreshLevel(input.closest("[data-game-level]"));
  });

  container.addEventListener("click", (event) => {
    const level = event.target.closest("[data-game-level]");
    if (!level) return;
    if (event.target.closest("[data-remove-word]")) {
      const chip = event.target.closest("[data-word-chip]");
      chip.classList.add("is-leaving");
      setTimeout(() => {
        chip.remove();
        refreshLevel(level);
      }, 160);
      return;
    }
    if (event.target.closest("[data-skip-game-tip]")) {
      onSkipGame?.();
      return;
    }
    const useKey = event.target.closest("[data-use-key]");
    if (useKey) {
      $("[data-key-word]", level).value = useKey.dataset.useKey;
      refreshLevel(level);
      $("[data-word-input]", level).focus();
      return;
    }
    const useWord = event.target.closest("[data-use-word]");
    if (useWord) {
      const input = $("[data-word-input]", level);
      addWords(level, useWord.dataset.useWord);
      input.value = "";
      delete input.dataset.force;
      refreshLevel(level);
      input.focus();
      return;
    }
    if (event.target.closest("[data-word-field]") && !event.target.closest("[data-word-chip]")) {
      $("[data-word-input]", level).focus();
    }
  });

  // Hovering or focusing a word lights up the tiles it uses.
  const showChipTiles = (event) => {
    const chip = event.target.closest?.("[data-word-chip]");
    const level = chip?.closest("[data-game-level]");
    if (!level) return;
    const key = keyOf(level);
    renderTiles(level, key, tilesFor(chip.dataset.wordChip, key), chip.classList.contains("is-invalid"));
  };
  const resetTiles = (event) => {
    const level = event.target.closest?.("[data-word-chip]")?.closest("[data-game-level]");
    if (level) refreshLevel(level);
  };
  container.addEventListener("mouseover", showChipTiles);
  container.addEventListener("focusin", showChipTiles);
  container.addEventListener("mouseout", resetTiles);
  container.addEventListener("focusout", resetTiles);
}

/** Commits any half-typed words, then checks every level. Returns the first bad level or null. */
export function validateGameLevels(container) {
  const levels = $$("[data-game-level]", container);
  let firstInvalid = null;
  levels.forEach((level) => {
    const input = $("[data-word-input]", level);
    if (normalize(input.value)) {
      addWords(level, input.value);
      input.value = "";
    }
    level.classList.add("was-checked");
    const result = refreshLevel(level);
    if (!result.ok && !firstInvalid) firstInvalid = level;
  });
  return firstInvalid;
}

export function readGameLevels(container) {
  return $$("[data-game-level]", container).map((level, index) => ({
    level: index + 1,
    order: index + 1,
    words: levelWords(level),
  }));
}
