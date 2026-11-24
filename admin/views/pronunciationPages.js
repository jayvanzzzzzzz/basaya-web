import { $, $$, escapeHtml, safeHttpUrl, toast } from "../../js/helpers.js";
import { audioPreviewHtml } from './lessonMediaPlayer.js';

export const MAX_PRONUNCIATION_PAGES = 8;
export const MAX_PRONUNCIATION_CHARACTERS = 200;

export function audioGenerateButton(kind) {
  const attribute = {
    lecture: 'data-generate-sentence-audio',
    sentence: 'data-generate-pronunciation-sentence',
    word: 'data-generate-pronunciation-audio',
  }[kind];
  const label = kind === 'word' ? 'Generate word audio' : 'Generate sentence audio';
  const iconSize = kind === 'word' ? 26 : 24;
  return `<button type="button" class="button secondary small audio-generate-button" ${attribute} data-floating-tooltip data-audio-label="${label}" aria-label="${label}">
    <svg class="audio-generate-symbol" viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 5-5 4H2v6h3l5 4V5Z"/><path d="M13 9a5 5 0 0 1 0 6M16 12a8 8 0 0 1-1 6"/><path d="m19 2 .9 2.6L22.5 5.5l-2.6.9L19 9l-.9-2.6-2.6-.9 2.6-.9L19 2Z"/></svg>
    <svg class="audio-generate-spinner" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9"/></svg>
  </button>`;
}

// Get Ready vocabulary is lowercase; punctuation and case do not create duplicates.
export function readyWords(sentences) {
  const seen = new Set();
  return sentences.flatMap(text => String(text).normalize("NFC").match(/[\p{L}\p{M}\p{N}]+(?:[-'’][\p{L}\p{M}\p{N}]+)*/gu) || [])
    .map(word => word.toLocaleLowerCase("fil"))
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
      ${audioGenerateButton('sentence')}
      <button type="button" class="text-button danger pronunciation-remove-page lesson-remove-button" data-remove-pronunciation-page data-floating-tooltip aria-label="Remove page"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg></button>
    </div>
    <div class="audio-preview" data-audio-preview>${audioPreviewHtml(url)}</div>
    <small class="muted" data-pronunciation-audio-status role="status"></small>
    <div class="pronunciation-word-picker" data-page-ready-picker></div>
  </div>`;
}

export function mountPronunciationPages(modal, saved, { wordHtml, refreshWord, previews, generate, saveAudio, audioProblem, confirmRemoval = async () => true }) {
  const panel = $('[data-panel="pronunciation"]', modal);
  const list = $('[data-pronunciation-pages]', panel);
  const wordList = $('[data-pronunciation-words]', panel);
  const sentenceSection = $('[data-pronunciation-sentence-section]', panel);
  const navigation = $('[data-pronunciation-page-navigation]', modal);
  const ribbons = $('[data-pronunciation-page-ribbons]', modal);
  let activePage = 0;
  let removingWord = false;
  const legacy = Boolean(saved?.words?.length && !saved?.pages?.length);
  panel.dataset.pronunciationMode = legacy ? "legacy" : "sentences";
  sentenceSection.hidden = legacy;
  $('[data-pronunciation-legacy]', panel).hidden = !legacy;
  list.innerHTML = (saved?.pages?.length ? saved.pages : [{}]).map(pageHtml).join("");
  const cache = new Map();
  const keyOf = word => word.toLocaleLowerCase("fil").replace(/’/g, "'");
  const savedEdits = Object.assign({}, ...(saved?.pages || []).map(page => page.readyWordEdits || {}));
  $$('[data-pronunciation-word]', wordList).forEach(row => {
    const value = $('[data-pronunciation-text]', row).value;
    const source = Object.keys(savedEdits).find(key => savedEdits[key] === value);
    if (source) row.dataset.readyWordSource = source;
  });
  const selections = new WeakMap();
  $$('[data-pronunciation-page]', list).forEach((row, index) => selections.set(row, new Set((saved?.pages?.[index]?.readyWords || (saved?.pages?.length ? saved.words || [] : [])).map(keyOf))));
  $('[data-pronunciation-word-picker]', panel).hidden = true;
  const sentences = () => $$('[data-pronunciation-sentence]', list).map(field => field.value.trim());
  function showPage(index = activePage) {
    const pages = $$('[data-pronunciation-page]', list);
    activePage = Math.min(Math.max(index, 0), Math.max(pages.length - 1, 0));
    if (ribbons.children.length !== pages.length) ribbons.innerHTML = pages.map((_, i) =>
      `<button type="button" class="lecture-page-ribbon" data-pronunciation-page-ribbon="${i}" aria-controls="pronunciation-page-${i}">Page ${i + 1}</button>`).join('');
    $$('[data-pronunciation-page-ribbon]', ribbons).forEach((button, i) => {
      button.classList.toggle('active', i === activePage);
      button.setAttribute('aria-current', i === activePage ? 'page' : 'false');
    });
    const currentRibbon = ribbons.children[activePage];
    if (currentRibbon && ribbons.clientWidth) {
      const bounds = ribbons.getBoundingClientRect(), current = currentRibbon.getBoundingClientRect();
      if (current.right > bounds.right) ribbons.scrollLeft += current.right - bounds.right;
      else if (current.left < bounds.left) ribbons.scrollLeft += current.left - bounds.left;
    }
    pages.forEach((row, i) => {
      row.id = `pronunciation-page-${i}`;
      if (i !== activePage) row.querySelectorAll('audio').forEach(audio => audio.pause());
      row.hidden = i !== activePage;
    });
    $('[data-pronunciation-page-count]', modal).textContent = `(${pages.length})`;
    const chosen = selections.get(pages[activePage]) || new Set();
    const visibleWords = [];
    $$('[data-pronunciation-word]', wordList).forEach(row => {
      row.hidden = panel.dataset.pronunciationMode === 'sentences' && !chosen.has(row.dataset.readyWordSource || keyOf($('[data-pronunciation-text]', row).value));
      if (row.hidden) row.querySelectorAll('audio').forEach(audio => audio.pause());
      if (!row.hidden) visibleWords.push(row);
    });
    visibleWords.forEach((row, i) => {
      const number = $('[data-card-number]', row);
      if (number) number.textContent = `Word ${i + 1} of ${visibleWords.length}`;
    });
    const count = $('[data-card-count]', panel) || $('[data-editor-count="pronunciation"]', modal);
    if (count) count.textContent = `(${visibleWords.length})`;
  }
  const sync = ({ renderPicker = true } = {}) => {
    if (panel.dataset.pronunciationMode !== "sentences") return;
    $$('[data-pronunciation-word]', wordList).forEach(row => cache.set(row.dataset.readyWordSource || keyOf($('[data-pronunciation-text]', row).value), row));
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
      if (!row.dataset.readyWordSource && field.value !== word) {
        // Capitalization alone does not invalidate existing word audio.
        const audio = JSON.parse(row.dataset.cloudAudio || 'null');
        if (audio?.text && keyOf(audio.text) === key) {
          row.dataset.cloudAudio = JSON.stringify({ ...audio, text: word });
        }
        const preview = previews.get(row);
        if (preview?.text && keyOf(preview.text) === key) preview.text = word;
        field.value = word;
        refreshWord(row);
      }
      row.dataset.readyWordSource = key;
      $('[data-remove-pronunciation-word]', row).hidden = false;
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
    $('[data-add-pronunciation-page]', modal).disabled = list.children.length >= MAX_PRONUNCIATION_PAGES;
    $('[data-add-pronunciation-word]', modal).hidden = true;
    showPage();
  };
  async function removeReadyWord(key, page, moveFocus = false) {
    const chosen = selections.get(page);
    if (removingWord || !chosen?.has(key)) return;
    removingWord = true;
    try {
      const word = $('[data-pronunciation-text]', cache.get(key)).value.trim() || key;
      if (!await confirmRemoval('Get Ready word', `Remove “${word}” from this page’s Get Ready words? You can add it again by selecting it in the sentence.`)) return;
      if (!panel.isConnected || !page.isConnected || !chosen.has(key)) return;
      chosen.delete(key);
      sync({ renderPicker: false });
      panel.dispatchEvent(new panel.ownerDocument.defaultView.Event('change', { bubbles: true }));
      if (moveFocus) {
        $$('[data-ready-word]', page).find(button => button.dataset.readyWord === key)?.focus({ preventScroll: true });
      }
    } finally {
      removingWord = false;
    }
  }
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
    void removeReadyWord(button.dataset.readyWord, button.closest('[data-pronunciation-page]'));
  });
  modal.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-remove-pronunciation-word]') && panel.dataset.pronunciationMode === 'sentences') {
      // The general lesson handler handles legacy lists; sentence pages keep per-page selections.
      event.stopImmediatePropagation();
      const row = button.closest('[data-pronunciation-word]');
      await removeReadyWord(row.dataset.readyWordSource, $$('[data-pronunciation-page]', list)[activePage], true);
      return;
    }
    if (button.matches('[data-enable-pronunciation-pages]')) {
      if (!await confirmRemoval('original word practice', 'Switch to sentence pages? The original word list will be replaced when you save the lesson.')) return;
      panel.dataset.pronunciationMode = 'sentences';
      sentenceSection.hidden = false;
      $('[data-pronunciation-legacy]', panel).hidden = true;
      navigation.hidden = false;
      sync();
    }
    if (button.matches('[data-add-pronunciation-page]')) {
      if (list.children.length >= MAX_PRONUNCIATION_PAGES) return toast('Use at most 8 pronunciation pages.');
      list.insertAdjacentHTML('beforeend', pageHtml());
      activePage = list.children.length - 1;
      sync();
      list.lastElementChild.querySelector('textarea').focus();
    }
    if (button.matches('[data-remove-pronunciation-page]') && list.children.length > 1) {
      const removed = button.closest('[data-pronunciation-page]');
      if (!await confirmRemoval('pronunciation page')) return;
      if (!removed.isConnected || list.children.length <= 1) return;
      const removedIndex = $$('[data-pronunciation-page]', list).indexOf(removed);
      removed.querySelectorAll('audio').forEach(audio => audio.pause());
      removed.remove();
      if (removedIndex < activePage) activePage--;
      sync();
    }
    if (button.matches('[data-pronunciation-page-ribbon]')) showPage(Number(button.dataset.pronunciationPageRibbon));
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
    setVisible(on) { navigation.hidden = !on || panel.dataset.pronunciationMode === 'legacy'; },
    reveal(target) {
      const page = target.closest('[data-pronunciation-page]');
      if (page) showPage($$('[data-pronunciation-page]', list).indexOf(page));
      else {
        const row = target.closest('[data-pronunciation-word]');
        if (row) {
          const key = row.dataset.readyWordSource || keyOf($('[data-pronunciation-text]', row).value);
          const index = $$('[data-pronunciation-page]', list).findIndex(page => selections.get(page)?.has(key));
          if (index >= 0) showPage(index);
        }
      }
    },
    async read(lessonId) {
      if (panel.dataset.pronunciationMode === 'legacy') return {};
      if (list.children.length < 1 || list.children.length > MAX_PRONUNCIATION_PAGES) throw new Error('Use 1-8 pronunciation pages.');
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
        const selectedWords = readyWords([sentence]).filter(word => chosen.has(keyOf(word)));
        const readyWordEdits = Object.fromEntries(selectedWords.flatMap(word => {
          const field = $('[data-pronunciation-text]', cache.get(keyOf(word)));
          const edited = field.value.trim();
          return edited && edited !== word ? [[keyOf(word), edited]] : [];
        }));
        pages.push({ pageNumber: index + 1, sentence, cloudAudio, readyWords: selectedWords,
          ...(Object.keys(readyWordEdits).length ? { readyWordEdits } : {}) });
      }
      return { formatVersion: 2, pages };
    },
  };
}
