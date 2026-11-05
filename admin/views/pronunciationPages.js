import { $, $$, escapeHtml, safeHttpUrl, toast } from "../../js/helpers.js";

export const MAX_PRONUNCIATION_PAGES = 5;
export const MAX_PRONUNCIATION_CHARACTERS = 200;

// Keep spelling from the first occurrence; punctuation and case do not create duplicates.
export function readyWords(sentences) {
  const seen = new Set();
  return sentences.flatMap(text => String(text).normalize("NFC").match(/[\p{L}\p{M}\p{N}]+(?:[-'’][\p{L}\p{M}\p{N}]+)*/gu) || [])
    .filter(word => {
      const key = word.toLocaleLowerCase("fil").replace(/’/g, "'");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function pageHtml(page = {}) {
  const audio = page.cloudAudio || null;
  const url = safeHttpUrl(audio?.audioUrl);
  return `<div class="sentence-editor" data-pronunciation-page data-cloud-audio="${escapeHtml(JSON.stringify(audio))}">
    <label><span data-card-number>Page</span>
      <span class="pronunciation-sentence-field">
        <textarea data-pronunciation-sentence maxlength="${MAX_PRONUNCIATION_CHARACTERS}" placeholder="Write one sentence for this page.">${escapeHtml(page.sentence || "")}</textarea>
        <span class="pronunciation-character-count" data-pronunciation-character-count aria-live="polite"></span>
      </span>
    </label>
    <div class="audio-actions">
      <button type="button" class="button secondary small" data-generate-pronunciation-sentence>Generate sentence audio</button>
      <button type="button" class="text-button danger pronunciation-remove-page lesson-remove-button" data-remove-pronunciation-page aria-label="Remove page" title="Remove page"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg></button>
    </div>
    <div class="audio-preview" data-audio-preview>${url ? `<audio controls src="${escapeHtml(url)}"></audio><small class="muted">Existing sentence audio</small>` : ""}</div>
    <small class="muted" data-pronunciation-audio-status role="status"></small>
    <div class="pronunciation-word-picker" data-page-ready-picker></div>
  </div>`;
}

export function mountPronunciationPages(modal, saved, { wordHtml, refreshWord, previews, generate, saveAudio, audioProblem }) {
  const panel = $('[data-panel="pronunciation"]', modal);
  const list = $('[data-pronunciation-pages]', panel);
  const wordList = $('[data-pronunciation-words]', panel);
  const sentenceSection = $('[data-pronunciation-sentence-section]', panel);
  const legacy = Boolean(saved?.words?.length && !saved?.pages?.length);
  panel.dataset.pronunciationMode = legacy ? "legacy" : "sentences";
  sentenceSection.hidden = legacy;
  $('[data-pronunciation-legacy]', panel).hidden = !legacy;
  list.innerHTML = (saved?.pages?.length ? saved.pages : [{}]).map(pageHtml).join("");
  const cache = new Map();
  const keyOf = word => word.toLocaleLowerCase("fil").replace(/’/g, "'");
  const selections = new WeakMap();
  $$('[data-pronunciation-page]', list).forEach((row, index) => selections.set(row, new Set((saved?.pages?.[index]?.readyWords || (saved?.pages?.length ? saved.words || [] : [])).map(keyOf))));
  $('[data-pronunciation-word-picker]', panel).hidden = true;
  const sentences = () => $$('[data-pronunciation-sentence]', list).map(field => field.value.trim());
  const sync = ({ renderPicker = true } = {}) => {
    if (panel.dataset.pronunciationMode !== "sentences") return;
    $$('[data-pronunciation-word]', wordList).forEach(row => cache.set(keyOf($('[data-pronunciation-text]', row).value), row));
    const words = readyWords(sentences());
    const selected = new Set();
    $$('[data-pronunciation-page]', list).forEach(row => {
      const pageWords = readyWords([$('[data-pronunciation-sentence]', row).value]);
      let chosen = selections.get(row);
      if (!chosen) { chosen = new Set(); selections.set(row, chosen); }
      const available = new Set(pageWords.map(keyOf));
      chosen.forEach(key => { if (!available.has(key)) chosen.delete(key); else selected.add(key); });
      const picker = $('[data-page-ready-picker]', row);
      if (renderPicker) picker.innerHTML = pageWords.map(word => `<button type="button" class="button secondary small" data-ready-word="${escapeHtml(keyOf(word))}"><span data-ready-check aria-hidden="true">&#10003; </span>${escapeHtml(word)}</button>`).join(' ');
      $$('[data-ready-word]', picker).forEach(button => {
        const added = chosen.has(button.dataset.readyWord);
        button.setAttribute('aria-pressed', String(added));
        button.classList.toggle('is-selected', added);
        $('[data-ready-check]', button).hidden = !added;
        button.title = added ? 'Added to this page. Double-click to remove.' : 'Click to add to this page’s Get Ready.';
      });
    });
    const rows = words.filter(word => selected.has(keyOf(word))).map(word => {
      const key = keyOf(word);
      let row = cache.get(key);
      if (!row) {
        const holder = document.createElement('div');
        holder.innerHTML = wordHtml(word);
        row = holder.firstElementChild;
        cache.set(key, row);
        refreshWord(row);
      }
      const field = $('[data-pronunciation-text]', row);
      if (field.value !== word) {
        field.value = word;
        refreshWord(row);
      }
      field.readOnly = true;
      $('[data-remove-pronunciation-word]', row).hidden = true;
      return row;
    });
    wordList.replaceChildren(...rows);
    $$('[data-pronunciation-page]', list).forEach((row, index, pages) => {
      $('[data-card-number]', row).textContent = `Page ${index + 1} of ${pages.length}`;
      $('[data-remove-pronunciation-page]', row).disabled = pages.length === 1;
      const field = $('[data-pronunciation-sentence]', row);
      const counter = $('[data-pronunciation-character-count]', row);
      counter.textContent = `${field.value.length}/${MAX_PRONUNCIATION_CHARACTERS}`;
      counter.setAttribute('aria-label', `${field.value.length} of ${MAX_PRONUNCIATION_CHARACTERS} characters`);
      const text = field.value.trim();
      const problem = text ? audioProblem(row, text) : '';
      $('[data-pronunciation-audio-status]', row).textContent = problem ? `Please ${problem}.` : '';
    });
    $('[data-add-pronunciation-page]', panel).disabled = list.children.length >= MAX_PRONUNCIATION_PAGES;
    $('[data-add-pronunciation-word]', panel).hidden = true;
  };
  sync();
  panel.addEventListener('input', event => {
    if (event.target.matches('[data-pronunciation-sentence]')) sync();
  });
  // Keep pointer selection in place; keyboard users can still tab to each word.
  panel.addEventListener('pointerdown', event => {
    if (event.target.closest('[data-ready-word]')) event.preventDefault();
  });
  panel.addEventListener('dblclick', event => {
    const button = event.target.closest('[data-ready-word]');
    if (!button) return;
    event.preventDefault();
    selections.get(button.closest('[data-pronunciation-page]'))?.delete(button.dataset.readyWord);
    sync({ renderPicker: false });
  });
  panel.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-enable-pronunciation-pages]')) {
      panel.dataset.pronunciationMode = 'sentences';
      sentenceSection.hidden = false;
      $('[data-pronunciation-legacy]', panel).hidden = true;
      sync();
    }
    if (button.matches('[data-add-pronunciation-page]')) {
      if (list.children.length >= MAX_PRONUNCIATION_PAGES) return toast('Use at most 5 sentence pages.');
      list.insertAdjacentHTML('beforeend', pageHtml());
      sync();
      list.lastElementChild.querySelector('textarea').focus();
    }
    if (button.matches('[data-remove-pronunciation-page]') && list.children.length > 1) {
      button.closest('[data-pronunciation-page]').querySelectorAll('audio').forEach(audio => audio.pause());
      button.closest('[data-pronunciation-page]').remove();
      sync();
    }
    if (button.matches('[data-ready-word]')) {
      selections.get(button.closest('[data-pronunciation-page]'))?.add(button.dataset.readyWord);
      sync({ renderPicker: false });
    }
    if (button.matches('[data-generate-pronunciation-sentence]')) {
      const row = button.closest('[data-pronunciation-page]');
      const text = $('[data-pronunciation-sentence]', row).value.trim();
      if (!text) return toast('Write the sentence before generating audio.');
      if ($('[data-pronunciation-sentence]', row).value.length > MAX_PRONUNCIATION_CHARACTERS) return toast('Use at most 200 characters per page.');
      await generate(button, row, text);
      sync();
    }
  });
  return {
    async read(lessonId) {
      if (panel.dataset.pronunciationMode === 'legacy') return {};
      const pages = [];
      for (const [index, row] of $$('[data-pronunciation-page]', list).entries()) {
        if ($('[data-pronunciation-sentence]', row).value.length > MAX_PRONUNCIATION_CHARACTERS) throw new Error(`Pronunciation page ${index + 1} exceeds 200 characters.`);
        const sentence = $('[data-pronunciation-sentence]', row).value.trim();
        if (!sentence || audioProblem(row, sentence)) throw new Error(`Generate current audio for pronunciation page ${index + 1}.`);
        const preview = previews.get(row);
        const cloudAudio = preview?.blob
          ? { ...await saveAudio({ audio: preview.blob, lessonId, section: 'pronunciation', pageNumber: index + 1, sentenceIndex: 1 }), text: sentence, ...(preview.wordStarts ? { wordStarts: preview.wordStarts } : {}) }
          : JSON.parse(row.dataset.cloudAudio);
        const chosen = selections.get(row) || new Set();
        pages.push({ pageNumber: index + 1, sentence, cloudAudio, readyWords: readyWords([sentence]).filter(word => chosen.has(keyOf(word))) });
      }
      return { formatVersion: 2, pages };
    },
  };
}
