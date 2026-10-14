import { serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { $, $$, escapeHtml, navigate, toast } from "../../js/helpers.js";
import {
  availability,
  clearResume,
  findLesson,
  loadActivity,
  loadLessonProgress,
  refreshSummary,
  resumeOf,
  saveProgress,
  saveResume,
} from "../data.js";
import { onLeave } from "../router.js";
import { buddy, confettiFrom, content, icon, setBuddyMood, shake } from "../ui.js";
import { renderResults } from "./results.js";

// Gawain (the app's PracticeActivity): tap the correct words, then check. A page counts as
// right only on its first check; retries are counted separately. Saves the Pagkilala skill.
// Every check saves the place (resume.activity), so a closed Gawain continues on that page.

const sameSet = (a, b) => a.size === b.size && [...a].every((value) => b.has(value));

export async function renderActivity(lessonId) {
  const lesson = await findLesson(lessonId);
  const pathUrl = `/lesson/${encodeURIComponent(lessonId)}`;
  if (!lesson) return navigate("/home");
  if (availability(lesson) !== "open" || lesson.activityFinished) return navigate(pathUrl);

  content().innerHTML = `<div class="st-focus-loading"><div class="st-loading"><span></span><span></span><span></span></div></div>`;
  const [activity, progress] = await Promise.all([loadActivity(lessonId), loadLessonProgress(lessonId)]);
  if (progress.activityFinished) return navigate(pathUrl);
  if (!activity?.pages.length) {
    toast("Walang gawain para sa araling ito.");
    return navigate(pathUrl);
  }

  content().innerHTML = `
    <section class="st-activity">
      <header class="st-focus-bar">
        <a class="st-icon-button" href="#${pathUrl}" aria-label="Isara">${icon("close")}</a>
        <div class="st-track st-track--activity" id="activity-track">
          ${activity.pages.map(() => "<i></i>").join("")}
        </div>
      </header>
      <div class="st-activity__head">
        <span class="st-activity__tag" id="activity-page"></span>
        ${activity.title ? `<h1>${escapeHtml(activity.title)}</h1>` : ""}
        ${activity.instruction ? `<p>${escapeHtml(activity.instruction)}</p>` : ""}
      </div>
      <div class="st-card st-worksheet">
        <span class="st-activity__pick" id="activity-pick"></span>
        <div class="st-tiles" id="activity-tiles" role="group" aria-label="Mga salita"></div>
      </div>
      <div class="st-feedback" id="activity-feedback" hidden aria-live="polite">
        ${buddy("idle", "st-feedback__buddy")}
        <p id="activity-feedback-text"></p>
      </div>
      <div class="st-focus-footer">
        <button class="st-action st-action--check st-wide" type="button" id="activity-action" disabled>Suriin ang Sagot</button>
      </div>
    </section>`;

  const tilesEl = $("#activity-tiles");
  const action = $("#activity-action");
  const feedback = $("#activity-feedback");
  const feedbackText = $("#activity-feedback-text");
  const feedbackBuddy = feedback.querySelector(".st-buddy");

  const total = activity.pages.length;
  const resume = resumeOf(progress, "activity", total);
  let pageIndex = resume?.done ?? 0;
  let checked = false;
  let score = Number(resume?.score) || 0; // pages right on their first check
  let retries = Number(resume?.retries) || 0;
  const checkedPages = new Set();
  // A page already checked wrong before closing no longer counts as a first try.
  if (resume?.tried) checkedPages.add(pageIndex);
  const selected = new Set();
  let saving = false;
  onLeave(() => {});

  const savePlace = (done) =>
    saveResume(lessonId, "activity", { done, total, score, retries, tried: done === pageIndex });

  const page = () => activity.pages[pageIndex];
  const correctSet = () => new Set(page().correctIndices);
  // A page saved without correct answers can't be answered, so it never blocks the student.
  const isCorrect = () => correctSet().size === 0 || sameSet(selected, correctSet());

  const setAction = (label, kind) => {
    action.textContent = label;
    action.className = `st-action st-action--${kind} st-wide`;
  };

  const updateTrack = () => {
    $$("#activity-track i").forEach((bar, i) => {
      bar.classList.toggle("is-done", i < pageIndex || (i === pageIndex && checked && isCorrect()));
    });
    $("#activity-page").textContent = `Pahina ${pageIndex + 1} / ${activity.pages.length}`;
  };

  const showPage = () => {
    const pickCount = page().correctIndices.length;
    $("#activity-pick").textContent = pickCount ? `Pumili ng ${pickCount} salita` : "";
    $("#activity-pick").hidden = !pickCount;
    selected.clear();
    checked = false;
    feedback.hidden = true;
    setBuddyMood(feedbackBuddy, "idle");
    setAction("Suriin ang Sagot", "check");
    action.disabled = true;
    tilesEl.innerHTML = page()
      .words.map(
        (word, index) =>
          `<button class="st-tile" type="button" data-index="${index}" aria-pressed="false" style="--i:${index}">${escapeHtml(word)}</button>`,
      )
      .join("");
    updateTrack();
  };

  tilesEl.addEventListener("click", (event) => {
    const tile = event.target.closest(".st-tile");
    if (!tile || checked) return;
    const index = Number(tile.dataset.index);
    if (selected.has(index)) selected.delete(index);
    else selected.add(index);
    tile.classList.toggle("is-picked", selected.has(index));
    tile.setAttribute("aria-pressed", String(selected.has(index)));
    action.disabled = selected.size === 0;
  });

  const showFeedback = (good, text) => {
    feedback.hidden = false;
    feedback.className = `st-feedback st-feedback--${good ? "good" : "retry"}`;
    feedbackText.textContent = text;
    setBuddyMood(feedbackBuddy, good ? "happy" : "cheer");
    feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const check = () => {
    const correct = correctSet();
    const right = isCorrect();
    const incomplete = !right && selected.size > 0 && [...selected].every((index) => correct.has(index));
    const explanation = page().explanation ?? activity.explanation;

    $$(".st-tile", tilesEl).forEach((tile) => {
      const index = Number(tile.dataset.index);
      const picked = selected.has(index);
      tile.disabled = true;
      tile.classList.remove("is-picked");
      if (picked && correct.has(index)) {
        tile.classList.add("is-right");
        tile.insertAdjacentHTML("afterbegin", icon("check"));
      } else if (picked) {
        tile.classList.add("is-wrong");
        tile.insertAdjacentHTML("afterbegin", icon("cross"));
        shake(tile);
      } else {
        tile.classList.add("is-faded");
      }
    });

    checked = true;
    updateTrack();
    const firstCheck = !checkedPages.has(pageIndex);
    checkedPages.add(pageIndex);
    if (!right) retries += 1;
    if (right && firstCheck) score += 1;
    savePlace(right ? pageIndex + 1 : pageIndex);

    if (right) {
      showFeedback(
        true,
        correct.size === 0
          ? "Walang nakatakdang sagot ang pahinang ito. Tuloy tayo!"
          : `Mahusay! ${explanation}`.trim(),
      );
      setAction(pageIndex === activity.pages.length - 1 ? "Tapusin" : "Susunod", "next");
      confettiFrom(tilesEl);
    } else if (incomplete) {
      showFeedback(false, `Tama ang napili mo, pero may kulang pa! Pumili ng ${correct.size} salita.`);
      setAction("Subukan Muli", "retry");
    } else {
      showFeedback(false, `Subukan muli. ${explanation}`.trim());
      setAction("Subukan Muli", "retry");
    }
  };

  const finish = async () => {
    if (saving) return;
    saving = true;
    action.disabled = true;
    try {
      await saveProgress(
        lessonId,
        {
          activityFinished: true,
          activityScore: score,
          activityTotal: total,
          activityCompletedAt: serverTimestamp(),
          ...clearResume("activity"),
        },
        { key: "pagkilala", correct: score, attempts: total, items: total, extras: { retries } },
      );
      refreshSummary();
    } catch (error) {
      console.error("Failed to save activity result", error);
      toast(
        error?.code === "permission-denied"
          ? "Sarado na ang aralin. Hindi na-save ang iyong sagot."
          : "Hindi na-save ang iyong sagot. Subukan muli.",
      );
      action.disabled = false;
      saving = false;
      return;
    }

    const percent = Math.floor((score * 100) / total);
    renderResults({
      lessonId,
      title: activity.title,
      heading: "Natapos mo ang Gawain!",
      scoreLabel: "Iyong puntos",
      score,
      total,
      showPercent: false,
      starCount: percent >= 80 ? 3 : percent >= 50 ? 2 : score > 0 ? 1 : 0,
      remark:
        percent >= 80
          ? "Mahusay! Handa ka na sa susunod na hakbang."
          : percent >= 50
            ? "Magaling! Konting ulit pa lang."
            : "Magpatuloy! Balikan ang aralin at subukan muli.",
      celebrate: percent >= 50,
    });
  };

  action.addEventListener("click", () => {
    if (!checked) return check();
    if (!isCorrect()) return showPage(); // try the same page again
    if (pageIndex < activity.pages.length - 1) {
      pageIndex += 1;
      showPage();
    } else {
      finish();
    }
  });

  // Every page was answered before closing: only the result is left to save.
  if (pageIndex >= total) {
    pageIndex = total - 1;
    showPage();
    finish();
  } else {
    showPage();
  }
}
