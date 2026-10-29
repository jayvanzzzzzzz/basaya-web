import { state } from "../../js/state.js";
import { $, $$, escapeHtml, toast, page, openModal, displayName } from "../../js/helpers.js";
import {
  MAX_SENSES,
  MAX_WORD,
  PARTS_OF_SPEECH,
  allWords,
  deleteWord,
  lookupWord,
  normalizeWord,
  renameWord,
  restoreWord,
  saveWord,
  syllablesOf,
} from "../../js/dictionary.js";
import { syllabify, withoutDots } from "../../js/syllables.js";
import { fieldError } from "../../js/field-errors.js";
import { speakWord } from "../../js/tts.js";
import { paginate } from "../../js/pagination.js";

// Dictionary: the Tagalog words students look up on the student side (#/diksiyonaryo).
// Most come from Tagalog Wiktionary (data/dictionary/tl-seed.json); teachers and admins
// add missing words, fix wrong ones (an edited copy replaces the original), fix the
// syllable split, and delete words they added (admins delete any word). Every word is listed A to Z, and opening one shows
// its meanings and examples like the student page. Definitions are typed in Filipino;
// the page itself is in English. Admins reach it at admin #/dictionary.

const LETTERS = "a b k d e g h i l m n ng o p r s t u w y".split(" ");
const MAX_DEFINITIONS = 8;
const MAX_TEXT = 500;
const MAX_SYLLABLES = 120;
const PAGE_SIZE = 10;
const SEARCH_DELAY = 200;
const SPEAKER_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10H4Z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></svg>';
const ACTION_ICONS = {
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>',
  restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v5h5" /><path d="M5.1 15a7.5 7.5 0 1 0 1.2-7.6L4 9" /></svg>',
  delete:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>',
};

let timer = null;

const who = () => ({ user: state.user, name: displayName() });
const isAdmin = () => state.profile?.role === "admin";
const lines = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function tagsHtml(entry) {
  const mine = entry.createdBy === state.user.uid;
  return [
    entry.source === "teacher"
      ? `<span class="tag">${entry.replaces ? "Edited" : "Added"} by ${escapeHtml(mine ? "you" : entry.updatedByName || entry.createdByName || "a teacher")}</span>`
      : `<span class="tag tag--muted">Wiktionary</span>`,
    entry.syllables ? `<span class="tag tag--muted">Syllables fixed</span>` : "",
  ].join("");
}

// Icon-only; the label shows as a tooltip on hover/focus.
const actionButton = (act, label, word) =>
  `<button type="button" class="dict-action${act === "delete" ? " dict-action--danger" : ""}" data-act="${act}" aria-label="${escapeHtml(`${label}: ${word}`)}">${ACTION_ICONS[act]}<span aria-hidden="true">${label}</span></button>`;

// Admins delete any word. Teachers delete or restore only words they added or changed.
function actionsHtml(entry, includeEdit = true, includeDelete = true) {
  const mine = entry.createdBy === state.user.uid;
  const word = entry.accent || entry.word;
  let actions = includeEdit ? actionButton("edit", "Edit", word) : "";
  if (entry.replaces && (isAdmin() || mine)) actions += actionButton("restore", "Restore original", word);
  if (includeDelete && (isAdmin() || (mine && entry.source === "teacher" && !entry.replaces))) {
    actions += actionButton("delete", "Delete", word);
  }
  return actions;
}

function rowHtml(entry) {
  const first = [entry.senses[0]?.pos, entry.senses[0]?.definitions[0]].filter(Boolean).join(" · ");
  const actions = actionsHtml(entry, false, !isAdmin());
  return `
    <div class="lesson-row dict-row" data-key="${escapeHtml(entry.key)}">
      <button type="button" class="dict-row__text" data-act="open">
        <h3>${escapeHtml(entry.accent || entry.word)} <span class="dict-syllables">${escapeHtml(syllablesOf(entry))}</span></h3>
        <p>${escapeHtml(first)}</p>
        <div class="lesson-meta">${tagsHtml(entry)}</div>
      </button>
      ${actions ? `<div class="dict-row__actions">${actions}</div>` : ""}
    </div>`;
}

/** One word in full, like the student page: meanings, examples and synonyms. */
function entryHtml(entry) {
  return `
    <article class="dict-entry" data-key="${escapeHtml(entry.key)}">
      <button type="button" class="text-button dict-back" data-act="back">← Back to the list</button>
      <header class="dict-entry__head">
        <div>
          <div class="dict-entry__word">
            <h2 tabindex="-1">${escapeHtml(entry.accent || entry.word)}</h2>
            <button type="button" class="icon-button dict-speak" data-act="speak" aria-label="Play “${escapeHtml(entry.accent || entry.word)}”">${SPEAKER_ICON}</button>
          </div>
          <p class="dict-entry__syllables">${escapeHtml(syllablesOf(entry))}</p>
          <div class="lesson-meta">${tagsHtml(entry)}</div>
        </div>
        <div class="dict-row__actions">${actionsHtml(entry)}</div>
      </header>
      ${entry.senses
        .map(
          (sense) => `
        <section class="dict-entry__sense">
          ${sense.pos ? `<h3>${escapeHtml(sense.pos)}</h3>` : ""}
          <ol>${sense.definitions.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ol>
          ${sense.examples.length ? `<ul class="dict-entry__examples">${sense.examples.map((e) => `<li>“${escapeHtml(e)}”</li>`).join("")}</ul>` : ""}
        </section>`,
        )
        .join("")}
      ${
        entry.synonyms.length
          ? `<p class="dict-entry__syn"><strong>Synonyms:</strong> ${entry.synonyms
              .map((s) => `<button type="button" class="tag dict-entry__chip" data-word="${escapeHtml(s)}">${escapeHtml(s)}</button>`)
              .join(" ")}</p>`
          : ""
      }
    </article>`;
}

// A new group starts with no part of speech; students then see the meanings without a heading.
function senseHtml(sense = { pos: "", definitions: [], examples: [] }, index = 0) {
  return `
    <fieldset class="dict-sense" data-sense>
      <legend>Meaning group ${index + 1}</legend>
      <label>Part of speech
        <select name="pos"><option value="">— Not specified —</option>${PARTS_OF_SPEECH.map((p) => `<option value="${p}" ${p === sense.pos ? "selected" : ""}>${p}</option>`).join("")}</select>
      </label>
      <label>Meanings in Filipino <small>(one per line)</small>
        <textarea name="definitions" rows="3" placeholder="Hal. Gusali na tirahan ng tao.">${escapeHtml(sense.definitions.join("\n"))}</textarea>
      </label>
      <label>Example sentences <small>(optional, one per line)</small>
        <textarea name="examples" rows="2" placeholder="Hal. Malaki ang bahay nila.">${escapeHtml(sense.examples.join("\n"))}</textarea>
      </label>
      <button type="button" class="button secondary small" data-remove-sense ${index === 0 ? "hidden" : ""}>Remove this group</button>
    </fieldset>`;
}

/** Add or edit a word. `typed` prefills a new word (the admin lesson editor's "Add it now"). */
export function openWordModal(entry = null, onSaved, typed = "") {
  const editing = !!entry;
  const senses = entry?.senses.length ? entry.senses : [undefined];
  let mayLeave = () => Promise.resolve(true);
  openModal(
    `<h2>${editing ? `Edit “${escapeHtml(entry.word)}”` : "Add a word"}</h2>
     <p>${
       editing && entry.source === "wiktionary"
         ? "This word comes from Wiktionary. Saving keeps your corrected copy, and students see yours instead."
         : "Write the meanings in Filipino so students can understand them."
     }</p>
     <form id="dict-word-form" class="dict-form" novalidate>
       <label>Word ${editing && isAdmin() ? "<small>(changing the spelling moves the word to the new spelling)</small>" : ""}
         <input name="word" required maxlength="${MAX_WORD}" value="${escapeHtml(entry?.word || typed)}" ${editing && !isAdmin() ? "readonly" : ""} placeholder="bahay" />
       </label>
       <label>Spelling with accent marks <small>(optional)</small>
         <input name="accent" maxlength="${MAX_WORD}" value="${escapeHtml(entry?.accent || "")}" placeholder="báhay" />
       </label>
       <label>Syllables <small>(optional, only if the automatic split is wrong)</small>
         <input name="syllables" maxlength="${MAX_SYLLABLES}" value="${escapeHtml(entry?.syllables || "")}" placeholder="ba·hay" autocomplete="off" />
         <span class="dict-hint" id="dict-syllable-hint"></span>
       </label>
       <div id="dict-senses">${senses.map(senseHtml).join("")}</div>
       <button type="button" class="button secondary small" id="dict-add-sense">+ Another part of speech</button>
       <label>Synonyms <small>(optional, separated by commas)</small>
         <input name="synonyms" maxlength="300" value="${escapeHtml(entry?.synonyms.join(", ") || "")}" placeholder="tahanan, tirahan" />
       </label>
       <p class="form-error" id="dict-error" role="alert" hidden></p>
       <div class="modal-actions">
         <button type="button" class="button secondary" data-close>Cancel</button>
         <button class="button primary" id="dict-save">Save word</button>
       </div>
     </form>`,
    (backdrop, close) => {
      const form = $("#dict-word-form", backdrop);
      const list = $("#dict-senses", backdrop);
      const error = $("#dict-error", backdrop);
      const renumber = () =>
        $$("[data-sense]", list).forEach((fieldset, i) => {
          fieldset.querySelector("legend").textContent = `Meaning group ${i + 1}`;
          fieldset.querySelector("[data-remove-sense]").hidden = i === 0;
        });
      const addButton = $("#dict-add-sense", backdrop);
      const syncAdd = () => (addButton.hidden = $$("[data-sense]", list).length >= MAX_SENSES);
      syncAdd();

      // Shows the automatic split, so the box only needs filling when it's wrong.
      const hint = $("#dict-syllable-hint", backdrop);
      const syncSyllables = () => {
        const auto = syllabify(form.accent.value.trim() || form.word.value.trim());
        form.syllables.placeholder = auto || "ba·hay";
        hint.textContent = auto
          ? `Automatic: ${auto}. Leave empty to use it, or type the fix with dots or periods (trak.tor).`
          : "Type the word first.";
      };
      syncSyllables();
      form.word.addEventListener("input", syncSyllables);
      form.accent.addEventListener("input", syncSyllables);

      // × and Cancel ask first when anything differs from how the modal opened.
      const initialSnapshot = formSnapshot(form);
      mayLeave = () =>
        formSnapshot(form) === initialSnapshot
          ? Promise.resolve(true)
          : askFirst(
              editing
                ? { title: "Discard unsaved changes?", text: `Your changes to “${entry.word}” will be lost.`, yes: "Discard changes" }
                : { title: "Discard this word?", text: "The word you've entered won't be added.", yes: "Discard word" },
            );
      $("[data-close]", backdrop).addEventListener("click", async () => {
        if (await mayLeave()) close();
      });
      addButton.addEventListener("click", () => {
        list.insertAdjacentHTML("beforeend", senseHtml(undefined, $$("[data-sense]", list).length));
        syncAdd();
      });
      list.addEventListener("click", (event) => {
        const remove = event.target.closest("[data-remove-sense]");
        if (!remove) return;
        remove.closest("[data-sense]").remove();
        renumber();
        syncAdd();
      });

      // A problem with one box shows under it; anything else above the buttons.
      const fail = (message, field) => {
        if (field) {
          fieldError(field, message);
          field.focus();
          return;
        }
        error.textContent = message;
        error.hidden = false;
      };

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.hidden = true;
        const word = form.word.value.trim();
        const syllables = form.syllables.value.trim();
        const senses = $$("[data-sense]", list)
          .map((fieldset) => ({
            pos: fieldset.querySelector("[name=pos]").value,
            definitions: lines(fieldset.querySelector("[name=definitions]").value),
            examples: lines(fieldset.querySelector("[name=examples]").value),
          }))
          .filter((sense) => sense.definitions.length);
        const synonyms = form.synonyms.value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        if (!word) return fail("Type the word you're adding, like bahay.", form.word);
        if (word.includes("/")) return fail("A word can't contain “/”.", form.word);
        if (form.accent.value.trim() && normalizeWord(form.accent.value) !== normalizeWord(word))
          return fail("The accented spelling must be the same word, only with accent marks (bahay → báhay).", form.accent);
        if (syllables && normalizeWord(withoutDots(syllables)) !== normalizeWord(word))
          return fail("The syllables must spell the same word, split with dots (bahay → ba·hay or ba.hay).", form.syllables);
        if (!senses.length)
          return fail("Add at least one meaning in Filipino, one per line.", $("[name=definitions]", list));
        const tooMany = senses.find((s) => s.definitions.length > MAX_DEFINITIONS || s.examples.length > MAX_DEFINITIONS);
        if (tooMany) return fail(`Keep it to ${MAX_DEFINITIONS} meanings and ${MAX_DEFINITIONS} examples per group.`);
        if (senses.some((s) => [...s.definitions, ...s.examples].some((t) => t.length > MAX_TEXT)))
          return fail(`Each meaning or example must be ${MAX_TEXT} characters or fewer.`);
        if (synonyms.length > 10) return fail(`Keep it to 10 synonyms. You have ${synonyms.length}.`, form.synonyms);

        // Only admins can type a new spelling (the word box is read-only for teachers).
        const renaming = editing && normalizeWord(word) !== entry.key;
        const save = $("#dict-save", backdrop);
        save.disabled = true;
        try {
          if (!editing || renaming) {
            const existing = await lookupWord(word);
            if (existing && renaming)
              return fail(`“${existing.word}” is already in the dictionary. Edit that word instead, or delete it first.`, form.word);
            if (existing) {
              close();
              toast(`“${existing.word}” is already in the dictionary. You can edit it here.`);
              openWordModal(existing, onSaved);
              return;
            }
          }
          if (
            renaming &&
            !confirm(
              `Change “${entry.word}” to “${word}”? Students will only find it under the new spelling, and Bigkas lessons that still use “${entry.word}” won't show its meaning.`,
            )
          )
            return;
          // The automatic split typed back in isn't a fix, so it isn't saved.
          const fixed = syllables && syllables !== syllabify(form.accent.value.trim() || word) ? syllables : "";
          const fields = { word, accent: form.accent.value, syllables: fixed, senses, synonyms };
          if (renaming) await renameWord(entry, fields, who());
          else await saveWord(fields, who());
          close();
          toast(renaming ? `Word moved to “${word}”.` : editing ? "Word updated." : "Word added. Students can look it up now.");
          onSaved?.(word);
        } catch (err) {
          console.error(err);
          fail("Couldn't save the word. Check your connection and try again.");
        } finally {
          save.disabled = false;
        }
      });
      form.querySelector(editing || typed ? "textarea" : "input").focus();
    },
    { closeOnBackdrop: false, beforeClose: () => mayLeave() },
  );
}

/** Every box in the word form, including added or removed meaning groups. */
function formSnapshot(form) {
  return JSON.stringify($$("input, textarea, select", form).map((field) => field.value));
}

/** A yes/no pop-up: resolves true for `yes`, false for `no` (or closing it). */
function askFirst({ title, text, yes, no = "Keep editing" }) {
  return new Promise((resolve) => {
    openModal(
      `<h2>${escapeHtml(title)}</h2>
       <p>${escapeHtml(text)}</p>
       <div class="modal-actions">
         <button type="button" class="button secondary" data-cancel>${escapeHtml(no)}</button>
         <button type="button" class="button danger" data-confirm>${escapeHtml(yes)}</button>
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
        // Closing with × or the backdrop counts as `no`.
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

export async function renderDictionary() {
  page(
    "Dictionary",
    "Tagalog words students can look up, explained in Filipino",
    `<button class="button primary" id="dict-add">+ Add word</button>`,
  );
  $("#page-content").innerHTML = `
    <div class="card dict-teacher">
      <div class="dict-toolbar">
        <label class="student-search">
          <span class="sr-only">Search the dictionary</span>
          <span aria-hidden="true">⌕</span>
          <input id="dict-search" type="search" placeholder="Search a word, e.g. bahay" autocomplete="off" maxlength="${MAX_WORD}" />
        </label>
        <label class="dict-filter">
          <span class="sr-only">Show</span>
          <select id="dict-filter">
            <option value="all">All words</option>
            <option value="teacher">Added or changed by teachers</option>
          </select>
        </label>
      </div>
      <nav class="dict-letters" aria-label="Letters">
        <button type="button" data-letter="" class="is-active">All</button>
        ${LETTERS.map((l) => `<button type="button" data-letter="${l}">${l.toUpperCase()}</button>`).join("")}
      </nav>
      <div id="dict-results" aria-live="polite"><p class="dict-empty">Loading…</p></div>
    </div>
    <p class="dict-credit">Most words come from <a href="https://tl.wiktionary.org/" target="_blank" rel="noopener">Tagalog Wiktionary</a> (CC BY-SA 4.0).</p>`;

  const input = $("#dict-search");
  const filter = $("#dict-filter");
  const results = $("#dict-results");
  let everything = [];
  let matches = [];
  let listPage = 1; // kept while a word is open, so Back returns to the same page
  let pageSize = PAGE_SIZE;
  let open = null; // key of the word being viewed, or null for the list

  const filtered = () => {
    const prefix = normalizeWord(input.value);
    const kind = filter.value;
    return everything
      .filter((e) => kind !== "teacher" || e.source === "teacher")
      .filter((e) => !prefix || e.key.startsWith(prefix))
      .sort((a, b) => (b.key === prefix) - (a.key === prefix));
  };

  const showList = () => {
    open = null;
    matches = filtered();
    const text = input.value.trim();
    if (!matches.length) {
      results.innerHTML = text
        ? `<p class="dict-empty">No word starts with “${escapeHtml(text)}” yet. <button class="button primary small" type="button" data-add-typed>Add “${escapeHtml(text)}”</button></p>`
        : `<p class="dict-empty">No words here yet.</p>`;
      return;
    }
    const heading = text ? `Words starting with “${text}”` : filter.value === "all" ? "All words, A to Z" : filter.selectedOptions[0].textContent;
    results.innerHTML = `
      <h2 class="dict-heading">${escapeHtml(heading)} · ${matches.length.toLocaleString()}</h2>
      <div class="list">${matches.map(rowHtml).join("")}</div>`;
    paginate({
      rows: () => $$(".dict-row", results),
      after: results.querySelector(".list"),
      label: ["word", "words"],
      page: listPage,
      pageSize,
      onChange: (state) => ({ page: listPage, pageSize } = state),
    });
  };

  const showEntry = (entry) => {
    open = entry.key;
    results.innerHTML = entryHtml(entry);
    results.querySelector("h2").focus?.();
  };

  const load = async (focusWord = "") => {
    results.innerHTML = `<p class="dict-empty">Loading…</p>`;
    try {
      everything = await allWords();
    } catch (error) {
      console.error(error);
      results.innerHTML = `<p class="dict-empty">Couldn't load the dictionary. Try again.</p>`;
      return;
    }
    const entry = focusWord && everything.find((e) => e.key === normalizeWord(focusWord));
    if (entry) showEntry(entry);
    else showList();
  };

  const setLetter = (letter) =>
    $$(".dict-letters [data-letter]").forEach((b) => b.classList.toggle("is-active", b.dataset.letter === letter));

  const afterSave = (word) => load(word);

  $("#dict-add").addEventListener("click", () => openWordModal(null, afterSave));
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      listPage = 1;
      setLetter(LETTERS.includes(normalizeWord(input.value)) ? normalizeWord(input.value) : input.value.trim() ? null : "");
      showList();
    }, SEARCH_DELAY);
  });
  filter.addEventListener("change", () => {
    listPage = 1;
    showList();
  });
  $(".dict-letters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-letter]");
    if (!button) return;
    input.value = button.dataset.letter;
    listPage = 1;
    setLetter(button.dataset.letter);
    showList();
  });

  results.addEventListener("click", async (event) => {
    if (event.target.closest("[data-add-typed]")) {
      openWordModal(null, afterSave);
      $("#dict-word-form [name=word]").value = input.value.trim();
      $("#dict-word-form [name=word]").dispatchEvent(new Event("input"));
      return;
    }
    const chip = event.target.closest("[data-word]");
    if (chip) {
      const entry = everything.find((e) => e.key === normalizeWord(chip.dataset.word));
      if (entry) showEntry(entry);
      else toast(`“${chip.dataset.word}” isn't in the dictionary yet.`);
      return;
    }
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const act = button.dataset.act;
    if (act === "back") {
      showList();
      return;
    }
    const entry = everything.find((e) => e.key === button.closest("[data-key]").dataset.key);
    if (!entry) return;
    if (act === "open") {
      showEntry(entry);
      return;
    }
    if (act === "speak") {
      speakWord(button, entry, "Audio not available, try again.");
      return;
    }
    if (act === "edit") {
      openWordModal(entry, afterSave);
      return;
    }
    const word = entry.accent || entry.word;
    const sure = await askFirst(
      act === "delete"
        ? {
            title: "Delete this word?",
            text: `Are you sure you want to delete “${word}”? Students and teachers won't find it in the dictionary anymore.`,
            yes: "Delete",
            no: "Cancel",
          }
        : {
            title: "Restore the original?",
            text: `Remove the changes to “${word}”? Students will see the original Wiktionary meaning again.`,
            yes: "Restore original",
            no: "Cancel",
          },
    );
    if (!sure) return;
    button.disabled = true;
    try {
      if (act === "delete") await deleteWord(entry, who());
      else await restoreWord(entry.key);
      toast(act === "delete" ? `“${word}” deleted.` : "Original meaning restored.");
      // Stay on the word if it's still there; a deleted one goes back to the list.
      await load(open && act !== "delete" ? entry.word : "");
    } catch (error) {
      console.error(error);
      toast("That didn't work. You can only delete words you added.");
      button.disabled = false;
    }
  });

  load();
}
