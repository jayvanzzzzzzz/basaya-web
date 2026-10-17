import { $, escapeHtml } from "../../js/helpers.js";
import { loadSeed, lookupWord, searchWords, suggestRoots, syllablesOf } from "../../js/dictionary.js";
import { onLeave } from "../router.js";
import { buddy, content, icon } from "../ui.js";

// Diksiyonaryo: Tagalog words explained in Filipino (js/dictionary.js). Search as you
// type, tap a word for its full meaning, tap a synonym or root to jump to it.

const LETTERS = "a b k d e g h i l m n ng o p r s t u w y".split(" ");
const SEARCH_DELAY = 250;

let timer = null;
let lastSearch = 0; // drops answers to older searches typed past

const shown = (entry) => entry.accent || entry.word;

function entryHtml(entry) {
  return `
    <article class="st-dict-entry">
      <button class="st-dict-back" type="button" data-back>${icon("back")}<span>Bumalik sa listahan</span></button>
      <header>
        <div class="st-dict-word">
          <h2 tabindex="-1">${escapeHtml(shown(entry))}</h2>
          <p class="st-dict-syllables" aria-label="Pantig: ${escapeHtml(syllablesOf(entry))}">${escapeHtml(syllablesOf(entry))}</p>
        </div>
        ${entry.source === "teacher" ? `<span class="st-dict-tag">Dinagdag ng guro</span>` : ""}
      </header>
      ${entry.senses
        .map(
          (sense) => `
        <section class="st-dict-sense">
          <h3>${escapeHtml(sense.pos)}</h3>
          <ol>${sense.definitions.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ol>
          ${sense.examples.length ? `<ul class="st-dict-examples">${sense.examples.map((e) => `<li>“${escapeHtml(e)}”</li>`).join("")}</ul>` : ""}
        </section>`,
        )
        .join("")}
      ${
        entry.synonyms.length
          ? `<div class="st-dict-syn"><span>Kasingkahulugan:</span> ${entry.synonyms
              .map((s) => `<button type="button" class="st-dict-chip" data-word="${escapeHtml(s)}">${escapeHtml(s)}</button>`)
              .join("")}</div>`
          : ""
      }
    </article>`;
}

function listHtml(entries) {
  return `<ul class="st-dict-list">${entries
    .map(
      (entry, i) => `
      <li style="--i: ${i}">
        <button type="button" class="st-dict-row" data-key="${escapeHtml(entry.key)}">
          <strong>${escapeHtml(shown(entry))}</strong>
          <span>${escapeHtml(entry.senses[0]?.pos || "")} · ${escapeHtml(entry.senses[0]?.definitions[0] || "")}</span>
          ${icon("chevron")}
        </button>
      </li>`,
    )
    .join("")}</ul>`;
}

const loading = () => `<div class="st-loading"><span></span><span></span><span></span></div>`;

function errorHtml() {
  return `<div class="st-empty">
      <h2>Hindi ma-load ang diksiyonaryo</h2>
      <p>${navigator.onLine ? "Subukan muli mamaya." : "Walang internet. Kumonekta muli, saka subukan."}</p>
    </div>`;
}

export async function renderDictionary() {
  content().innerHTML = `
    <section class="st-dict">
      <header class="st-hero st-hero--dict">
        <div class="st-hero__text">
          <span class="st-hero__eyebrow">Diksiyonaryo</span>
          <h1>Anong salita ang hahanapin mo?</h1>
        </div>
        ${buddy("happy", "st-dict__buddy")}
      </header>
      <form class="st-dict-search" role="search" id="dict-form">
        ${icon("search")}
        <input id="dict-input" type="search" placeholder="Hal. bahay, kumain, maganda" autocomplete="off"
          autocapitalize="none" spellcheck="false" maxlength="60" aria-label="Hanapin ang salita" />
      </form>
      <nav class="st-dict-letters" aria-label="Mga titik">
        ${LETTERS.map((l) => `<button type="button" data-letter="${l}">${l.toUpperCase()}</button>`).join("")}
      </nav>
      <div id="dict-results" aria-live="polite"></div>
      <p class="st-dict-credit">
        Ilang kahulugan mula sa <a href="https://tl.wiktionary.org/" target="_blank" rel="noopener">Wiktionary</a>
        (<a href="https://creativecommons.org/licenses/by-sa/4.0/deed.tl" target="_blank" rel="noopener">CC BY-SA</a>).
        Ang iba ay dinagdag ng mga guro.
      </p>
    </section>`;

  onLeave(() => clearTimeout(timer));
  const input = $("#dict-input");
  const results = $("#dict-results");
  let lastList = []; // to come back to from a word

  const showList = (entries, heading = "") => {
    lastList = entries;
    results.innerHTML = `${heading}${listHtml(entries)}`;
  };

  const showEntry = (entry) => {
    results.innerHTML = entryHtml(entry);
    results.querySelector("h2").focus?.();
  };

  const search = async (text) => {
    const id = ++lastSearch;
    const query = text.trim();
    if (!query) {
      showIntro();
      return;
    }
    results.innerHTML = loading();
    try {
      const found = await searchWords(query);
      if (id !== lastSearch) return;
      if (found.length) {
        showList(found);
        return;
      }
      const roots = await suggestRoots(query);
      if (id !== lastSearch) return;
      lastList = roots;
      results.innerHTML = roots.length
        ? `<p class="st-dict-hint">Wala ang “${escapeHtml(query)}”. Baka ang salitang-ugat ang hinahanap mo:</p>${listHtml(roots)}`
        : `<div class="st-empty">
            <img class="st-empty__art" src="../img/logo.png" alt="" />
            <h2>Wala pa ang salitang ito</h2>
            <p>Tingnan kung tama ang baybay, o sabihin sa iyong guro para maidagdag niya ang “${escapeHtml(query)}”.</p>
          </div>`;
    } catch (error) {
      console.error(error);
      if (id === lastSearch) results.innerHTML = errorHtml();
    }
  };

  // Before typing: a few words to try.
  const showIntro = async () => {
    const id = ++lastSearch;
    results.innerHTML = loading();
    try {
      const all = await loadSeed();
      if (id !== lastSearch) return;
      const picks = Array.from({ length: 6 }, () => all[Math.floor(Math.random() * all.length)]);
      showList([...new Map(picks.map((e) => [e.key, e])).values()], `<h2 class="st-dict-heading">Subukan ang mga salitang ito</h2>`);
    } catch (error) {
      console.error(error);
      if (id === lastSearch) results.innerHTML = errorHtml();
    }
  };

  const openWord = async (word) => {
    input.value = word;
    const id = ++lastSearch;
    results.innerHTML = loading();
    try {
      const entry = await lookupWord(word);
      if (id !== lastSearch) return;
      if (entry) showEntry(entry);
      else search(word);
    } catch (error) {
      console.error(error);
      if (id === lastSearch) results.innerHTML = errorHtml();
    }
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => search(input.value), SEARCH_DELAY);
  });
  $("#dict-form").addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(timer);
    input.blur(); // hides the phone keyboard
    search(input.value);
  });
  $(".st-dict-letters").addEventListener("click", (event) => {
    const letter = event.target.closest("[data-letter]")?.dataset.letter;
    if (!letter) return;
    input.value = letter;
    clearTimeout(timer);
    search(letter);
  });
  results.addEventListener("click", (event) => {
    const row = event.target.closest("[data-key]");
    if (row) {
      const entry = lastList.find((e) => e.key === row.dataset.key);
      if (entry) showEntry(entry);
      return;
    }
    const chip = event.target.closest("[data-word]");
    if (chip) {
      openWord(chip.dataset.word);
      return;
    }
    if (event.target.closest("[data-back]")) {
      if (lastList.length) showList(lastList);
      else search(input.value);
    }
  });

  showIntro();
}
