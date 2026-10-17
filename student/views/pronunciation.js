import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, escapeHtml, navigate, openModal, toast } from "../../js/helpers.js";
import { lookupWord } from "../../js/dictionary.js";
import { syllabify } from "../../js/syllables.js";
import {
  availability,
  clearResume,
  findLesson,
  loadLessonProgress,
  loadPronunciation,
  refreshSummary,
  resumeOf,
  saveProgress,
  saveResume,
} from "../data.js";
import { onLeave } from "../router.js";
import { Microphone, browserRecognitionAvailable, listenWithBrowser, score, transcribe } from "../speech.js";
import { confetti, confettiFrom, content, icon, setBuddyMood, setTalking, shake, talkingBuddy } from "../ui.js";
import { renderResults } from "./results.js";

// Bigkas (the app's PronunciationActivity): hear the word, say it into the mic, and
// basaya-stt (Whisper) checks it. Three lives per word; "nothing heard" never costs one, and a
// word whose lives run out scores 0. Saves the Pagbigkas skill: first-try correct words, plus
// the words that needed help. Every scored try saves the place (resume.pronunciation): the
// word, its lives left and the score so far, so a closed Bigkas continues there.

const MAX_LIVES = 3;
const ADVANCE_DELAY_MS = 2400;

export async function renderPronunciation(lessonId) {
  const lesson = await findLesson(lessonId);
  const pathUrl = `/lesson/${encodeURIComponent(lessonId)}`;
  if (!lesson) return navigate("/home");
  if (availability(lesson) !== "open" || lesson.pronunciationFinished) return navigate(pathUrl);

  content().innerHTML = `<div class="st-focus-loading"><div class="st-loading"><span></span><span></span><span></span></div></div>`;
  const [activity, progress] = await Promise.all([loadPronunciation(lessonId), loadLessonProgress(lessonId)]);
  if (progress.pronunciationFinished) return navigate(pathUrl);
  if (!activity?.words.length) {
    toast("Walang pronunciation activity para sa lesson na ito.");
    return navigate(pathUrl);
  }

  content().innerHTML = `
    <section class="st-pron">
      <header class="st-focus-bar">
        <a class="st-icon-button" href="#${pathUrl}" aria-label="Isara">${icon("close")}</a>
        <span class="st-bar st-pron__bar"><i id="pron-bar" style="width:0%"></i></span>
        <span class="st-lives" id="pron-lives" role="img">${heartIcon()}<b id="pron-lives-count">${MAX_LIVES}</b></span>
      </header>
      <p class="st-pron__instruction">${escapeHtml(activity.instruction || "Bigkasin ang salitang ito.")}</p>
      <div class="st-pron__stage">
        ${talkingBuddy("st-buddy st-buddy--idle st-pron__buddy")}
        <div class="st-card st-pron__word" id="pron-card">
          <span class="st-pron__count" id="pron-count"></span>
          <button class="st-icon-button st-pron__info" type="button" id="pron-info" hidden aria-label="Ano ang ibig sabihin ng salita?">${icon("info")}</button>
          <strong id="pron-word"></strong>
          <span class="st-pron__syllables" id="pron-syllables"></span>
          <button class="st-icon-button st-pron__speaker" type="button" id="pron-speaker" aria-label="Pakinggan ang salita">${icon("speaker")}</button>
        </div>
      </div>
      <div class="st-pron__note" id="pron-note" hidden aria-live="polite">
        <strong id="pron-note-title"></strong>
        <span id="pron-note-text"></span>
      </div>
      <div class="st-pron__mic-area">
        <span class="st-pron__ring" aria-hidden="true"></span>
        <span class="st-pron__ring st-pron__ring--two" aria-hidden="true"></span>
        <button class="st-pron__mic" type="button" id="pron-mic" aria-label="Bigkasin ang salita">
          ${icon("mic")}
          <span class="st-pron__spinner" aria-hidden="true"></span>
        </button>
      </div>
      <p class="st-pron__hint" id="pron-hint">Pindutin ang mic at sabihin ang salita</p>
    </section>`;

  const words = activity.words;
  const mascot = $(".st-pron__buddy");
  const micButton = $("#pron-mic");
  const speaker = $("#pron-speaker");
  const micArea = $(".st-pron__mic-area");
  const player = new Audio();
  // Each word's Diksiyonaryo entry, looked up once. Pantig under the word is split right
  // away, then swapped for a teacher's fix when the entry comes back; the ⓘ button shows
  // only for words the Diksiyonaryo has (display only; checking still uses the word).
  const syllables = words.map((w) => syllabify(w.word));
  const entries = words.map(() => null);
  const showWordExtras = () => {
    const text = syllables[index] || "";
    const el = $("#pron-syllables");
    if (!el) return;
    el.textContent = text;
    el.setAttribute("aria-label", `Pantig: ${text}`);
    el.hidden = !text.includes("·");
    const info = $("#pron-info");
    const had = !info.hidden;
    info.hidden = !entries[index];
    // A little wiggle when the button appears, so the student notices it.
    if (!info.hidden && !had) {
      info.classList.remove("st-pron__info--hello");
      void info.offsetWidth;
      info.classList.add("st-pron__info--hello");
    }
  };
  words.forEach((w, i) =>
    lookupWord(w.word)
      .catch(() => null)
      .then((entry) => {
        entries[i] = entry;
        if (entry?.syllables) syllables[i] = entry.syllables;
        if (i === index) showWordExtras();
      }),
  );

  /** The word's meaning from the Diksiyonaryo: first meaning group only, kept short. */
  const showMeaning = () => {
    const entry = entries[index];
    if (!entry) return;
    const sense = entry.senses[0];
    const syllableText = syllables[index] || "";
    openModal(
      `<div class="st-word-info">
        <span class="st-word-info__icon">${icon("book")}</span>
        <h2>${escapeHtml(entry.accent || entry.word)}</h2>
        ${syllableText.includes("·") ? `<p class="st-word-info__syllables" aria-label="Pantig: ${escapeHtml(syllableText)}">${escapeHtml(syllableText)}</p>` : ""}
        ${sense?.pos ? `<span class="st-word-info__pos">${escapeHtml(sense.pos)}</span>` : ""}
        <ol class="st-word-info__meanings">${(sense?.definitions || []).map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ol>
        ${sense?.examples.length ? `<ul class="st-word-info__examples">${sense.examples.map((e) => `<li>“${escapeHtml(e)}”</li>`).join("")}</ul>` : ""}
        <button class="button primary" type="button" data-close-info>Isara</button>
      </div>`,
      (backdrop, close) => {
        backdrop.querySelector(".modal").classList.add("st-modal");
        backdrop.querySelector("[data-close-info]").addEventListener("click", close);
        backdrop.querySelector("[data-close-info]").focus();
        onLeave(close);
      },
    );
  };
  $("#pron-info").addEventListener("click", showMeaning);

  const resume = resumeOf(progress, "pronunciation", words.length);
  let index = resume?.done ?? 0;
  let lives = MAX_LIVES;
  let correctCount = Number(resume?.correct) || 0;
  let firstTryCorrect = Number(resume?.firstTryCorrect) || 0;
  let missesOnWord = 0;
  const hardWords = new Set(Array.isArray(resume?.hardWords) ? resume.hardWords : []);
  // Lives and misses of the word the student closed on (a fresh word gets MAX_LIVES).
  let restored = resume
    ? {
        lives: Math.min(Math.max(Number(resume.lives) || MAX_LIVES, 1), MAX_LIVES),
        misses: Number(resume.misses) || 0,
      }
    : null;
  let processing = false;
  let useBrowser = false; // set once basaya-stt is unavailable (e.g. free daily limit)
  let microphone = null;
  let listening = null; // AbortController of the current attempt
  let advanceTimer = null;
  let saving = false;

  onLeave(() => {
    // Never keep the mic or audio running after leaving.
    listening?.abort();
    microphone?.close();
    player.pause();
    window.speechSynthesis?.cancel();
    clearTimeout(advanceTimer);
  });

  const setMood = (mood) => {
    setTalking(mascot, false);
    setBuddyMood(mascot, mood);
  };
  /** The book "says" the word: mouth moving, no other mood animation fighting it. */
  const startTalking = () => {
    setBuddyMood(mascot, "idle");
    setTalking(mascot, true);
  };
  const setLevel = (level) => micArea.style.setProperty("--level", level.toFixed(3));

  const showNote = (tone, title, text = "") => {
    const note = $("#pron-note");
    note.hidden = false;
    note.className = `st-pron__note st-pron__note--${tone}`;
    $("#pron-note-title").textContent = title;
    $("#pron-note-text").textContent = text;
    $("#pron-note-text").hidden = !text;
  };
  const hideNote = () => ($("#pron-note").hidden = true);

  const setEnabled = (enabled) => {
    micButton.disabled = !enabled;
    speaker.disabled = !enabled;
  };

  /** `done` words are finished; lives/misses belong to word `done` when it is the current one. */
  const savePlace = (done) =>
    saveResume(lessonId, "pronunciation", {
      done,
      total: words.length,
      lives: done === index ? lives : MAX_LIVES,
      misses: done === index ? missesOnWord : 0,
      correct: correctCount,
      firstTryCorrect,
      hardWords: [...hardWords],
    });

  const showWord = () => {
    lives = restored?.lives ?? MAX_LIVES;
    missesOnWord = restored?.misses ?? 0;
    restored = null;
    $("#pron-word").textContent = words[index].word;
    $("#pron-info").hidden = true; // so it wiggles again for the new word
    showWordExtras();
    $("#pron-count").textContent = `Salita ${index + 1} / ${words.length}`;
    $("#pron-bar").style.width = `${(index * 100) / words.length}%`;
    updateLives(false);
    hideNote();
    setMood("idle");
    $("#pron-hint").textContent = "Pindutin ang mic at sabihin ang salita";
    const card = $("#pron-card");
    card.classList.remove("st-pron__word--in");
    void card.offsetWidth;
    card.classList.add("st-pron__word--in");
    setEnabled(true);
  };

  const updateLives = (animate) => {
    $("#pron-lives-count").textContent = String(lives);
    $("#pron-lives").setAttribute("aria-label", `${lives} buhay`);
    if (animate) shake($("#pron-lives"));
  };

  const listeningUi = () => {
    micArea.classList.add("is-listening");
    micArea.classList.remove("is-thinking");
    setMood("happy");
    $("#pron-hint").textContent = "Nakikinig ako… sabihin mo na!";
  };
  const thinkingUi = () => {
    micArea.classList.remove("is-listening");
    micArea.classList.add("is-thinking");
    setMood("thinking");
    $("#pron-hint").textContent = "Sandali lang…";
  };
  const idleUi = () => {
    processing = false;
    micArea.classList.remove("is-listening", "is-thinking");
    setLevel(0);
    speaker.disabled = false;
    $("#pron-hint").textContent = "Pindutin ang mic at sabihin ang salita";
    setMood("idle");
  };

  // ----- Playing the word -----
  const speakWithTts = (word) => {
    if (!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "fil-PH";
    utterance.onstart = startTalking;
    utterance.onend = () => setMood("idle");
    utterance.onerror = () => setMood("idle");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };
  const playWord = () => {
    if (processing) return;
    const current = words[index];
    player.pause();
    window.speechSynthesis?.cancel();
    if (current.audioUrl) {
      player.src = current.audioUrl;
      player.onplaying = startTalking;
      player.onended = () => setMood("idle");
      player.onerror = () => speakWithTts(current.word);
      player.play().catch(() => speakWithTts(current.word));
    } else {
      speakWithTts(current.word);
    }
  };
  speaker.addEventListener("click", playWord);

  // ----- Results -----
  const advance = () => {
    index += 1;
    if (index >= words.length) finish();
    else showWord();
  };

  const handleScore = (result) => {
    idleUi();
    if (result.band === "great" || result.band === "okay") {
      correctCount += 1;
      if (missesOnWord === 0) firstTryCorrect += 1;
      savePlace(index + 1);
      setEnabled(false);
      setMood("happy");
      confettiFrom(mascot, 40);
      confetti({ count: 60 });
      $("#pron-card").classList.add("is-correct");
      setTimeout(() => $("#pron-card")?.classList.remove("is-correct"), 600);
      // Correct answers show the lesson word exactly as written, not the raw recognizer text.
      showNote("success", result.band === "great" ? "Ang galing mo!" : "Malapit na, tama!", words[index].word);
      advanceTimer = setTimeout(advance, ADVANCE_DELAY_MS);
      return;
    }
    // Wrong answers only encourage; the misheard text is not shown.
    lives -= 1;
    missesOnWord += 1;
    hardWords.add(words[index].word);
    updateLives(true);
    setMood("cheer");
    // Out of lives: the word scores 0 and the next one is up.
    savePlace(lives <= 0 ? index + 1 : index);
    if (lives <= 0) {
      setEnabled(false);
      showNote("cheer", "Ayos lang! Lilipat tayo sa susunod na salita.");
      advanceTimer = setTimeout(advance, ADVANCE_DELAY_MS);
    } else {
      showNote("cheer", "Kaya mo 'yan! Subukan ulit.");
    }
  };

  const noSpeech = () => {
    idleUi();
    showNote("info", "Wala akong narinig. Subukan ulit nang mas malakas.");
  };
  const offline = () => {
    idleUi();
    showNote("info", "Kailangan ng internet para magpatuloy.", "Kumonekta sa internet para masuri ang iyong pagbigkas.");
    shake(micButton);
  };

  // ----- Listening -----
  const listenBrowser = async () => {
    listeningUi();
    listening = new AbortController();
    const result = await listenWithBrowser(listening.signal);
    if (result.candidates?.length) handleScore(score(words[index].word, result.candidates, result.confidences));
    else if (result.unavailable) {
      idleUi();
      showNote("info", "Hindi available ang pagsuri ng pagbigkas ngayon.", "Subukan ulit mamaya.");
      useBrowser = false; // try basaya-stt again next time
    } else noSpeech();
  };

  /** basaya-stt failed while online (limit or server): like the app, let the browser listen. */
  const switchToBrowser = () => {
    if (!browserRecognitionAvailable()) {
      idleUi();
      showNote("info", "Hindi available ang pagsuri ng pagbigkas ngayon.", "Subukan ulit mamaya.");
      return;
    }
    useBrowser = true;
    idleUi();
    showNote("info", "Sabihin mo ulit ang salita.", "Pindutin ulit ang mic.");
  };

  const listenWhisper = async () => {
    if (!microphone) microphone = new Microphone();
    const opened = await microphone.open();
    if (opened === "denied") {
      idleUi();
      showNote("info", "Kailangan ng microphone permission para magamit ito.", "Payagan ang mikropono sa settings ng browser, saka subukan ulit.");
      return;
    }
    if (opened !== "ok") {
      idleUi();
      showNote("info", "Hindi magamit ang mikropono ngayon.");
      return;
    }
    listeningUi();
    listening = new AbortController();
    const recording = await microphone.record(setLevel, listening.signal);
    if (!recording.wav) return noSpeech();

    thinkingUi();
    const result = await transcribe(recording.wav);
    if (result.text != null) {
      if (!result.text) noSpeech();
      else handleScore(score(words[index].word, [result.text]));
    } else if (result.networkError) {
      if (!navigator.onLine) offline();
      else switchToBrowser();
    } else {
      switchToBrowser();
    }
  };

  micButton.addEventListener("click", () => {
    if (processing) return;
    player.pause();
    window.speechSynthesis?.cancel();
    if (!navigator.onLine) return offline();
    processing = true;
    speaker.disabled = true;
    hideNote();
    if (useBrowser || !Microphone.supported()) listenBrowser();
    else listenWhisper();
  });

  // ----- Finish -----
  const finish = async () => {
    if (saving) return;
    saving = true;
    $("#pron-bar").style.width = "100%";
    microphone?.close();
    microphone = null;
    try {
      await saveProgress(
        lessonId,
        {
          pronunciationFinished: true,
          pronunciationScore: correctCount,
          pronunciationTotal: words.length,
          pronunciationCompletedAt: serverTimestamp(),
          ...clearResume("pronunciation"),
        },
        {
          key: "pagbigkas",
          correct: firstTryCorrect,
          attempts: words.length,
          items: words.length,
          extras: { eventuallyCorrect: correctCount, hardWords: [...hardWords] },
        },
      );
      refreshSummary();
    } catch (error) {
      console.error("Failed to save pronunciation result", error);
      toast(
        error?.code === "permission-denied"
          ? "Sarado na ang aralin. Hindi na-save ang iyong sagot."
          : "Hindi na-save ang iyong sagot. Subukan muli.",
      );
      saving = false;
      return navigate(pathUrl);
    }

    const percent = Math.floor((correctCount * 100) / words.length);
    renderResults({
      lessonId,
      title: activity.title,
      heading: "Natapos mo ang Bigkas!",
      scoreLabel: "Mga salitang nabigkas",
      score: correctCount,
      total: words.length,
      showPercent: false,
      starCount: percent >= 80 ? 3 : percent >= 50 ? 2 : correctCount > 0 ? 1 : 0,
      remark:
        percent >= 80
          ? "Mahusay! Handa ka na sa susunod na hakbang."
          : percent >= 50
            ? "Magaling! Konting ulit pa lang."
            : "Magpatuloy! Balikan ang aralin at subukan muli.",
      celebrate: percent >= 50,
    });
  };

  // Every word was done before closing: only the result is left to save.
  if (index >= words.length) finish();
  else showWord();
}

const heartIcon = () =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.2C1.6 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.5 0 5.5 3.5 4.3 6.8-1.7 4.6-9.2 9.2-9.2 9.2Z" /></svg>`;
