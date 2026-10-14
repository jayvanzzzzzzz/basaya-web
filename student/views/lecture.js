import { $, $$, escapeHtml, navigate, toast } from "../../js/helpers.js";
import { availability, findLesson, loadLecture, saveProgress } from "../data.js";
import { onLeave } from "../router.js";
import { content, icon, showDialog } from "../ui.js";

// The lecture (the app's LectureActivity): tap to reveal each sentence while the talking
// book reads it aloud. The last page's button marks the lecture finished.

export async function renderLecture(lessonId) {
  const lesson = await findLesson(lessonId);
  const pathUrl = `/lesson/${encodeURIComponent(lessonId)}`;
  if (!lesson) return navigate("/home");
  const state = availability(lesson);
  // After the deadline a finished lecture can still be reread.
  if (state === "not-yet-open" || (state === "closed" && !lesson.lectureFinished)) return navigate(pathUrl);

  content().innerHTML = `<div class="st-focus-loading"><div class="st-loading"><span></span><span></span><span></span></div></div>`;
  const lecture = await loadLecture(lessonId);
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
        <button class="st-icon-button" type="button" id="lecture-speaker" aria-label="I-on o i-off ang tunog" aria-pressed="true">${icon("speaker")}</button>
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
  // One element for every sentence: once a tap has unlocked it, iPhones let it keep playing.
  const player = new Audio();
  player.preload = "auto";
  let speakerOn = true;
  let pageIndex = 0;
  let sentenceIndex = 0;
  let saving = false;

  const setTalking = (talking) => book.classList.toggle("is-talking", talking);
  player.addEventListener("playing", () => setTalking(true));
  player.addEventListener("ended", () => setTalking(false));
  player.addEventListener("pause", () => setTalking(false));
  player.addEventListener("error", () => setTalking(false));

  const stopAudio = () => {
    player.pause();
    setTalking(false);
  };
  onLeave(() => {
    stopAudio();
    player.removeAttribute("src");
    document.removeEventListener("keydown", onKey);
  });

  const play = (index) => {
    stopAudio();
    const url = lecture.pages[pageIndex].audioUrls[index];
    if (!speakerOn || !url) return;
    player.src = url;
    player.play().catch(() => setTalking(false)); // blocked until the first tap on some phones
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
    reveal();
  };

  const finish = async () => {
    if (saving) return;
    saving = true;
    stopAudio();
    nextButton.disabled = true;
    try {
      if (availability(lesson) === "open") await saveProgress(lessonId, { lectureFinished: true });
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
      message: "Sigurado ka bang gusto mong lumabas? Mawawala ang iyong kasalukuyang progreso sa pahinang ito.",
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
    if (pageIndex < lecture.pages.length - 1) showPage(pageIndex + 1);
    else finish();
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

  showPage(0);
}
