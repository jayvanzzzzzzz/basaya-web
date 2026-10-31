import { $, escapeHtml, navigate } from "../../js/helpers.js";
import {
  availability,
  canOpen,
  findLesson,
  formatWhen,
  loadContentCounts,
  loadLessonProgress,
  resumeOf,
} from "../data.js";
import { unlockLecturePlayer } from "../lectureAudio.js";
import { onLeave } from "../router.js";
import { buddy, content, icon, showDialog } from "../ui.js";
import { muteNextLecture, prepareLecture } from "./lecture.js";

// One lesson's path (the app's DashboardActivity): Lecture → Laro → Gawain → Bigkas →
// Pagsusulit. Finished parts can't be redone (the lecture can be read again), and the
// quiz opens only after the lecture. A Practice lesson (Pagsasanay) saves nothing, so every
// part stays open and can be done again.

const PARTS = [
  { key: "lecture", title: "Lektura", sub: "Unawain ang aralin", icon: "book", tone: "unawa" },
  { key: "game", title: "Laro", sub: "Hanapin ang tamang salita", icon: "puzzle", tone: "talasalitaan" },
  { key: "activity", title: "Gawain", sub: "Sanayin ang natutuhan", icon: "pencil", tone: "pagkilala" },
  { key: "pronunciation", title: "Bigkas", sub: "Bigkasin ang bawat salita", icon: "mic", tone: "pagbigkas" },
  { key: "quiz", title: "Pagsusulit", sub: "Subukan ang iyong galing", icon: "clipboard", tone: "pagsusulit" },
];

const DONE_MESSAGES = {
  game: "Nakumpleto mo na ang larong ito. Hindi na ito maaaring ulitin.",
  activity: "Nakumpleto mo na ang gawaing ito. Hindi na ito maaaring ulitin.",
  pronunciation: "Nakumpleto mo na ang bigkas na ito. Hindi na ito maaaring ulitin.",
  quiz: "Natapos mo na ang pagsusulit. Hindi na ito maaaring ulitin.",
};

/** The count line under each card: a score once there is one, else how far the student got (a part left halfway, see resumeOf), else how many items. */
function countLine(key, progress, counts) {
  const started = (part, total) => resumeOf(progress, part, total)?.done ?? 0;
  if (key === "lecture")
    return progress.lectureFinished || !started("lecture", counts.lecture)
      ? `${counts.lecture} pages`
      : `${started("lecture", counts.lecture)}/${counts.lecture} pages`;
  if (key === "game")
    return progress.gameTotal > 0 ? `${progress.gameScore || 0}/${progress.gameTotal} levels` : `0/${counts.game} levels`;
  if (key === "activity")
    return progress.activityTotal != null
      ? `Pahina • ${progress.activityScore}/${progress.activityTotal}`
      : `${started("activity", counts.activity)}/${counts.activity} pages`;
  if (key === "pronunciation")
    return progress.pronunciationTotal != null
      ? `Salita • ${progress.pronunciationScore}/${progress.pronunciationTotal}`
      : `${started("pronunciation", counts.pronunciation)}/${counts.pronunciation} salita`;
  return progress.quizTotal != null
    ? `Puntos • ${progress.quizScore}/${progress.quizTotal}`
    : `${started("quiz", counts.quiz)}/${counts.quiz} questions`;
}

export async function renderLessonPath(lessonId) {
  const lesson = await findLesson(lessonId);
  if (!lesson) {
    navigate("/home");
    return;
  }
  if (!canOpen(lesson)) {
    navigate("/home");
    return;
  }

  content().innerHTML = `
    <section class="st-path">
      <header class="st-hero st-hero--path">
        <a class="st-icon-button st-icon-button--light" href="#/home" aria-label="Bumalik">${icon("back")}</a>
        <div class="st-hero__text">
          <span class="st-hero__eyebrow">ARALIN · ${lesson.practice ? "PAGSASANAY" : "PAGTATAYA"}</span>
          <h1>${escapeHtml(lesson.title || "BaSaya")}</h1>
          ${lesson.description ? `<p>${escapeHtml(lesson.description)}</p>` : ""}
        </div>
        ${buddy("happy", "st-path__buddy")}
      </header>
      <div class="st-path__heading">
        <h2>Ang iyong landas</h2>
        <p>${
          lesson.practice
            ? "Pagsasanay ito: sagutan ang kahit anong hakbang, ilang beses man. Hindi naitatala ang iyong iskor."
            : "Tapusin ang bawat hakbang, isa-isa!"
        }</p>
      </div>
      <ol id="path-steps" class="st-steps"><li class="st-loading"><span></span><span></span><span></span></li></ol>
    </section>`;

  const [progress, counts] = await Promise.all([loadLessonProgress(lessonId), loadContentCounts(lessonId)]);
  const finished = {
    lecture: progress.lectureFinished === true,
    game: progress.gameFinished === true,
    activity: progress.activityFinished === true,
    pronunciation: progress.pronunciationFinished === true,
    quiz: progress.quizFinished === true,
  };
  // A finished quiz stays open even if the lecture flag lags behind. A Practice lesson saves nothing, so nothing is ever finished and nothing waits for the lecture.
  const quizLocked = !lesson.practice && !finished.lecture && !finished.quiz;
  const parts = PARTS.filter(
    (part) => !(part.key === "game" && lesson.gameSkipped) && !(part.key === "activity" && lesson.activitySkipped),
  );

  $("#path-steps").innerHTML = parts
    .map((part, index) => {
      const locked = part.key === "quiz" && quizLocked;
      return `
        <li class="st-step st-step--${part.tone}${locked ? " is-locked" : ""}${finished[part.key] ? " is-done" : ""}">
          <span class="st-step__number" aria-hidden="true">${index + 1}</span>
          <button class="st-step__card" type="button" data-part="${part.key}">
            <span class="st-step__icon">${icon(part.icon)}</span>
            <span class="st-step__text">
              <strong>${part.title}</strong>
              <small>${part.sub}</small>
              <em>${escapeHtml(countLine(part.key, progress, counts))}</em>
            </span>
            ${
              finished[part.key]
                ? `<span class="st-step__badge">${icon("check")}Tapos na</span>`
                : locked
                  ? `<span class="st-step__badge st-step__badge--locked">${icon("lock")}Naka-lock</span>`
                  : icon("chevron", "st-step__chevron")
            }
            ${part.key === "lecture" ? `<span class="st-step__spinner" aria-hidden="true"></span>` : ""}
          </button>
        </li>`;
    })
    .join("");

  /** Nothing opens before the open date; after the deadline only the lecture can be reread. */
  const blocked = (reviewing) => {
    const state = availability(lesson);
    if (state === "not-yet-open") {
      showDialog({ iconName: "lock", tone: "locked", title: "Hindi pa bukas", message: `Mabubuksan mo ang “${lesson.title}” sa ${formatWhen(lesson.openAt)}.` });
      return true;
    }
    if (state === "closed" && !reviewing) {
      showDialog({ iconName: "lock", tone: "locked", title: "Sarado na", message: "Lumampas na ang deadline ng araling ito. Hindi na ito maaaring sagutan." });
      return true;
    }
    return false;
  };
  const partUrl = (part) => `/lesson/${encodeURIComponent(lessonId)}/${part}`;
  const open = (part, { reviewing = false } = {}) => {
    if (!blocked(reviewing)) navigate(partUrl(part));
  };

  // Lecture: opens only once the audio of its first page is downloaded
  let active = true;
  let preparing = false;
  onLeave(() => {
    active = false;
  });

  /** The spinner on the lecture card while its audio downloads. */
  const setPreparing = (on) => {
    preparing = on;
    const card = $('[data-part="lecture"]');
    if (!card) return;
    card.classList.toggle("is-preparing", on);
    card.setAttribute("aria-busy", String(on));
    const count = card.querySelector("em");
    if (on) {
      count.dataset.text = count.textContent;
      count.textContent = "Inihahanda…";
    } else if (count.dataset.text != null) {
      count.textContent = count.dataset.text;
    }
  };

  const openLecture = async ({ reviewing = false, retry = false } = {}) => {
    if (blocked(reviewing)) return;
    unlockLecturePlayer(); // still inside the tap: lets the first sentence play on iPhones
    setPreparing(true);
    let status;
    try {
      status = await prepareLecture(lesson, { retry });
    } catch (error) {
      console.error("Failed to load the lecture", error);
      status = "error";
    }
    if (!active) return; // the student left the lesson page meanwhile
    setPreparing(false);
    if (status === "ready") return navigate(partUrl("lecture"));

    if (status === "error") {
      const answer = await showDialog({
        iconName: "refresh",
        tone: "locked",
        title: "Hindi ma-load ang aralin",
        message: "Suriin ang iyong internet at subukan muli.",
        primary: "Subukan muli",
        secondary: "Isara",
      });
      if (active && answer === "primary") openLecture({ reviewing });
      return;
    }
    const answer = await showDialog({
      iconName: "mute",
      tone: "locked",
      title: status === "slow" ? "Matagal ma-load ang tunog" : "Hindi ma-load ang tunog",
      message:
        status === "slow"
          ? "Mabagal ang internet kaya hindi pa handa ang tunog ng aralin."
          : "Hindi ma-download ang tunog ng aralin. Suriin ang iyong internet.",
      primary: "Subukan muli",
      secondary: "Buksan nang walang tunog",
    });
    if (!active) return;
    if (answer === "primary") openLecture({ reviewing, retry: true });
    else if (answer === "secondary") {
      muteNextLecture();
      navigate(partUrl("lecture"));
    }
  };

  $("#path-steps").addEventListener("click", async (event) => {
    const key = event.target.closest("[data-part]")?.dataset.part;
    if (!key || preparing) return;

    if (key === "lecture" && finished.lecture) {
      const answer = await showDialog({
        iconName: "check",
        tone: "done",
        title: "Tapos na",
        message: "Natapos mo na ang leksyon na ito. Maaari mo pa rin itong basahin muli anumang oras.",
        primary: "Basahin muli",
        secondary: "Isara",
      });
      if (answer === "primary") openLecture({ reviewing: true });
      return;
    }
    if (finished[key]) {
      showDialog({ iconName: "check", tone: "done", title: "Tapos na", message: DONE_MESSAGES[key] });
      return;
    }
    if (key === "quiz" && quizLocked) {
      showDialog({ iconName: "lock", tone: "locked", title: "Naka-lock", message: "Tapusin muna ang aralin para mabuksan ang pagsusulit" });
      return;
    }
    if (key === "lecture") openLecture();
    else open(key);
  });
}
