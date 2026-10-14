import { $, $$, escapeHtml, navigate, toast } from "../../js/helpers.js";
import {
  availability,
  clearResume,
  findLesson,
  loadLecture,
  loadLessonProgress,
  resumeOf,
  saveProgress,
  saveResume,
} from "../data.js";
import { audioSource, downloadPageAudio, lecturePlayer } from "../lectureAudio.js";
import { onLeave } from "../router.js";
import { content, icon, showDialog } from "../ui.js";

// The lecture (the app's LectureActivity): tap to reveal each sentence while the talking
// book reads it aloud. The last page's button marks the lecture finished. Until then each
// finished page saves the place (resume.lecture), so a closed lecture opens on the next page.
// The lesson path opens it only once the first page's audio is downloaded (prepareLecture).

/** How long the lesson path waits for the audio before asking the student. */
const AUDIO_WAIT_MS = 10_000;

/** What prepareLecture() loaded, for renderLecture(): { lessonId, data, muted }. */
let prepared = null;

async function loadForLecture(lesson) {
  const [lecture, progress] = await Promise.all([loadLecture(lesson.id), loadLessonProgress(lesson.id)]);
  // Rereading a finished lecture always starts at page 1 and saves nothing.
  const tracking = !progress.lectureFinished && !lesson.lectureFinished;
  const resume = tracking && lecture ? resumeOf(progress, "lecture", lecture.pages.length) : null;
  const startPage = lecture?.pages.length ? Math.min(resume?.done ?? 0, lecture.pages.length - 1) : 0;
  return { lecture, progress, tracking, startPage };
}

/**
 * Loads the lecture and the student's place in it, then downloads the audio of the page it
 * opens on. Resolves to "ready", "slow" (not downloaded within AUDIO_WAIT_MS) or "failed";
 * rejects when the lecture itself can't be loaded. `retry` keeps what was loaded and only
 * downloads the audio again (downloads still running carry on).
 */
export async function prepareLecture(lesson, { retry = false } = {}) {
  if (!retry || prepared?.lessonId !== lesson.id) {
    prepared = { lessonId: lesson.id, data: loadForLecture(lesson), muted: false };
  }
  const current = prepared;
  let data;
  try {
    data = await current.data;
  } catch (error) {
    if (prepared === current) prepared = null;
    throw error;
  }
  if (!data.lecture?.pages.length) return "ready"; // the lecture view says there's nothing to read
  return Promise.race([
    downloadPageAudio(data.lecture.pages[data.startPage]).then(
      () => "ready",
      () => "failed",
    ),
    new Promise((resolve) => setTimeout(() => resolve("slow"), AUDIO_WAIT_MS)),
  ]);
}

/** The student chose to open the prepared lecture without sound: start with the speaker off. */
export function muteNextLecture() {
  if (prepared) prepared.muted = true;
}

export async function renderLecture(lessonId) {
  const lesson = await findLesson(lessonId);
  const pathUrl = `/lesson/${encodeURIComponent(lessonId)}`;
  if (!lesson) return navigate("/home");
  const state = availability(lesson);
  // After the deadline a finished lecture can still be reread.
  if (state === "not-yet-open" || (state === "closed" && !lesson.lectureFinished)) return navigate(pathUrl);

  content().innerHTML = `<div class="st-focus-loading"><div class="st-loading"><span></span><span></span><span></span></div></div>`;
  // Opened from the lesson path, everything is ready. Opened by its address (e.g. a reload),
  // load it here and wait for the audio at most AUDIO_WAIT_MS.
  if (prepared?.lessonId !== lessonId) {
    try {
      await prepareLecture(lesson);
    } catch (error) {
      console.error("Failed to load the lecture", error);
      toast("Hindi ma-load ang aralin. Subukan muli.");
      return navigate(pathUrl);
    }
  }
  const { lecture, tracking, startPage } = await prepared.data;
  const muted = prepared.muted;
  prepared = null; // the next visit loads the place again
  if (!lecture?.pages.length) {
    toast("Walang lecture para sa araling ito.");
    return navigate(pathUrl);
  }

  content().innerHTML = `
    <section class="st-lecture">
      <header class="st-focus-bar">
        <button class="st-icon-button" type="button" id="lecture-close" aria-label="Isara ang aralin">${icon("close")}</button>
        <div class="st-track" id="lecture-track">
          ${lecture.pages.map(() => "<i></i>").join("")}
        </div>
        <button class="st-icon-button" type="button" id="lecture-speaker" aria-label="I-on o i-off ang tunog" aria-pressed="${!muted}">${icon(muted ? "mute" : "speaker")}</button>
      </header>
      <div class="st-lecture__head">
        <span class="st-lecture__page" id="lecture-page"></span>
        <h1>${escapeHtml(lecture.title || "Aralin")}</h1>
      </div>
      <button class="st-talking-book" type="button" id="lecture-book" aria-label="Ang nagsasalitang aklat. Pindutin para ulitin ang pangungusap.">
        <img src="../img/logo.png" alt="" />
        <span class="st-talking-book__waves" aria-hidden="true"><i></i><i></i><i></i></span>
      </button>
      <div class="st-lecture__sheet" id="lecture-sheet" tabindex="0" aria-label="Pindutin ang pahina para sa susunod na pangungusap">
        <div class="st-lecture__sentences" id="lecture-sentences" aria-live="polite"></div>
        <p class="st-lecture__hint" id="lecture-hint">Pindutin ang pahina para sa susunod!</p>
      </div>
      <div class="st-focus-footer">
        <button class="button primary st-wide st-big" type="button" id="lecture-next" hidden></button>
      </div>
    </section>`;

  const sheet = $("#lecture-sheet");
  const sentencesEl = $("#lecture-sentences");
  const nextButton = $("#lecture-next");
  const book = $("#lecture-book");
  const speaker = $("#lecture-speaker");
  // One element for every sentence and every visit: the lesson path unlocked it on the card
  // tap, and iPhones then let it keep playing.
  const player = lecturePlayer();
  const listeners = new AbortController();
  let speakerOn = !muted;
  let pageIndex = 0;
  let sentenceIndex = 0;
  let saving = false;

  const setTalking = (talking) => book.classList.toggle("is-talking", talking);
  const { signal } = listeners;
  player.addEventListener("playing", () => setTalking(true), { signal });
  player.addEventListener("ended", () => setTalking(false), { signal });
  player.addEventListener("pause", () => setTalking(false), { signal });
  player.addEventListener("error", () => setTalking(false), { signal });

  const stopAudio = () => {
    player.pause();
    setTalking(false);
  };
  onLeave(() => {
    stopAudio();
    listeners.abort();
    player.removeAttribute("src");
    document.removeEventListener("keydown", onKey);
  });

  const play = (index) => {
    stopAudio();
    const url = lecture.pages[pageIndex].audioUrls[index];
    if (!speakerOn || !url) return;
    player.src = audioSource(url); // the downloaded copy when there is one
    player.play().catch(() => setTalking(false));
  };

  const updateTrack = () => {
    $$("#lecture-track i").forEach((bar, i) => {
      const done = i < pageIndex || (i === pageIndex && sentenceIndex >= lecture.pages[i].sentences.length);
      bar.classList.toggle("is-done", done);
    });
  };

  const reveal = () => {
    const page = lecture.pages[pageIndex];
    if (sentenceIndex >= page.sentences.length) return;
    sentencesEl.querySelector(".is-active")?.classList.remove("is-active");
    const line = document.createElement("p");
    line.className = "st-sentence is-active";
    line.textContent = page.sentences[sentenceIndex];
    sentencesEl.append(line);
    play(sentenceIndex);
    sentenceIndex += 1;

    if (sentenceIndex === page.sentences.length) {
      nextButton.textContent = pageIndex === lecture.pages.length - 1 ? "TAPUSIN" : "SUSUNOD";
      nextButton.hidden = false;
      $("#lecture-hint").hidden = true;
    }
    updateTrack();
    line.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const showPage = (index) => {
    stopAudio();
    pageIndex = index;
    sentenceIndex = 0;
    sentencesEl.replaceChildren();
    $("#lecture-page").textContent = `PAHINA ${index + 1} NG ${lecture.pages.length}`;
    nextButton.hidden = true;
    $("#lecture-hint").hidden = false;
    // Download the next page's audio while this one is read.
    downloadPageAudio(lecture.pages[index + 1]).catch(() => {});
    reveal();
  };

  const finish = async () => {
    if (saving) return;
    saving = true;
    stopAudio();
    nextButton.disabled = true;
    try {
      if (availability(lesson) === "open")
        await saveProgress(lessonId, { lectureFinished: true, ...clearResume("lecture") });
    } catch (error) {
      console.error("Failed to mark lecture finished", error);
      toast("Hindi na-save ang iyong progreso. Subukan muli.");
      nextButton.disabled = false;
      saving = false;
      return;
    }
    navigate(pathUrl);
  };

  const confirmClose = async () => {
    const answer = await showDialog({
      iconName: "door",
      tone: "locked",
      title: "Lumabas sa Aralin",
      message: tracking
        ? "Sigurado ka bang gusto mong lumabas? Itutuloy mo ang aralin sa pahinang ito sa susunod."
        : "Sigurado ka bang gusto mong lumabas?",
      primary: "Oo",
      secondary: "Hindi",
    });
    if (answer === "primary") navigate(pathUrl);
  };

  function onKey(event) {
    if (document.querySelector(".modal-backdrop")) return;
    if (event.key === "ArrowRight" || ((event.key === " " || event.key === "Enter") && event.target === sheet)) {
      event.preventDefault();
      reveal();
    }
  }

  sheet.addEventListener("click", reveal);
  document.addEventListener("keydown", onKey);
  nextButton.addEventListener("click", () => {
    if (pageIndex < lecture.pages.length - 1) {
      if (tracking && availability(lesson) === "open")
        saveResume(lessonId, "lecture", { done: pageIndex + 1, total: lecture.pages.length });
      showPage(pageIndex + 1);
    } else {
      finish();
    }
  });
  // Tapping the book replays the sentence just read (and turns sound back on if muted).
  book.addEventListener("click", () => {
    if (sentenceIndex === 0) return;
    if (!speakerOn) speaker.click();
    play(sentenceIndex - 1);
  });
  speaker.addEventListener("click", () => {
    speakerOn = !speakerOn;
    if (!speakerOn) stopAudio();
    speaker.innerHTML = icon(speakerOn ? "speaker" : "mute");
    speaker.setAttribute("aria-pressed", String(speakerOn));
  });
  $("#lecture-close").addEventListener("click", confirmClose);

  // The saved place is the next unread page; the last page stays readable before finishing.
  showPage(startPage);
}
