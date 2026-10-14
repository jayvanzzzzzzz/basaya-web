import { $, escapeHtml, navigate } from "../../js/helpers.js";
import { buddy, confetti, content, stars } from "../ui.js";

// The "finished!" screen shown after Gawain and Pagsusulit (the app's PracticeCompleteScreen
// and QuizCompleteScreen): score counting up, stars, a remark, and back to the lesson.

export function renderResults({ lessonId, title, heading, score, total, showPercent, remark, starCount, celebrate, scoreLabel }) {
  const percent = total > 0 ? Math.floor((score * 100) / total) : 0;
  content().innerHTML = `
    <section class="st-results">
      ${buddy(celebrate ? "happy" : "cheer", "st-results__buddy")}
      <h1>${escapeHtml(heading)}</h1>
      ${title ? `<p class="st-results__title">${escapeHtml(title)}</p>` : ""}
      <div class="st-card st-results__card">
        <span class="st-results__label">${escapeHtml(scoreLabel)}</span>
        <strong class="st-results__score" aria-label="${score} / ${total}"><span id="results-count">0</span> / ${total}</strong>
        ${showPercent ? `<span class="st-results__percent">${percent}%</span>` : ""}
        ${stars(starCount)}
        <p class="st-results__remark">${escapeHtml(remark)}</p>
      </div>
      <button class="button primary st-wide st-big" type="button" id="results-done">Bumalik sa aralin</button>
    </section>`;

  // Score counts up from zero.
  const counter = $("#results-count");
  const duration = Math.min(300 + score * 120, 1400);
  const started = performance.now() + 400;
  const tick = (time) => {
    if (!counter.isConnected) return;
    const progress = Math.max(0, Math.min(1, (time - started) / duration));
    counter.textContent = String(Math.round(score * (1 - (1 - progress) ** 3)));
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // Frames can pause (background tab, low-power mode): always land on the real score.
  setTimeout(() => {
    if (counter.isConnected) counter.textContent = String(score);
  }, 400 + duration + 100);

  if (celebrate) setTimeout(() => confetti({ count: 140 }), 600);
  $("#results-done").addEventListener("click", () => navigate(`/lesson/${encodeURIComponent(lessonId)}`));
  $("#results-done").focus({ preventScroll: true });
}
