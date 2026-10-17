import { $, escapeHtml } from "../../js/helpers.js";
import { SKILLS, lessonParts, summarize } from "../../js/scoring.js";
import {
  firstName,
  loadClassLessons,
  loadClassProgressDocs,
  saveSummary,
  scoredLessons,
  scoredResults,
} from "../data.js";
import { buddy, content, icon, stars } from "../ui.js";

// "Aking Progreso" (the app's ProgressFragment): five separate skill cards, never one
// combined grade. Uses the same scoring as the app and the teacher's reports (js/scoring.js).

const STYLE = {
  pagUnawa: { name: "Lektura", source: "Mga nabasang aralin", icon: "book" },
  talasalitaan: { name: "Talasalitaan", source: "Crossword", icon: "puzzle" },
  pagkilala: { name: "Pagkilala sa Salita", source: "Gawain", icon: "pencil" },
  pagbigkas: { name: "Pagbigkas", source: "Pronunciation", icon: "mic" },
  pagsusulit: { name: "Pag-unawa sa Binasa", source: "Pagsusulit", icon: "clipboard" },
};

const LEVEL_CARD = {
  MAHUSAY: { label: "Mahusay", tone: "up", stars: 3, message: "Ang galing mo! Ituloy mo lang." },
  UMUUNLAD: { label: "Umuunlad", tone: "unawa", stars: 2, message: "Malapit ka na! Kaunting ensayo pa." },
  NAGSISIMULA: { label: "Nagsisimula", tone: "pagkilala", stars: 1, message: "Magandang simula! Magsanay pa tayo." },
  KAILANGAN_NG_TULONG: { label: "Kailangan ng tulong", tone: "down", stars: 0, message: "Kaya mo 'yan! Balikan natin ang aralin." },
  KULANG_ANG_DATOS: { label: "Kulang pa ang datos", tone: "soft", stars: 0, message: "Tapusin pa ang ilang aralin para makita ang iyong antas." },
};

const NOT_STARTED = { percent: null, text: "--", label: "Hindi pa nasisimulan", tone: "soft", message: "Simulan mo na ang unang aralin!" };

function scoredState(summary) {
  if (!summary.lessons || summary.score == null) return { ...NOT_STARTED, stars: 0 };
  const level = LEVEL_CARD[summary.level];
  return {
    percent: summary.score,
    text: `${summary.score}`,
    label: level.label,
    tone: level.tone,
    stars: level.stars,
    trend: summary.trend,
    lessonScores: summary.lessonScores,
    message: level.message,
  };
}

/** Lektura has no score: show how many lectures were read. */
function lectureState(docs) {
  const lessons = scoredLessons();
  const ids = new Set(lessons.map((lesson) => lesson.id));
  const total = lessons.length;
  const finished = docs.filter((item) => ids.has(item.id) && item.lectureFinished === true).length;
  if (!total || !finished) return NOT_STARTED;
  const done = finished === total;
  return {
    percent: Math.floor((finished * 100) / total),
    text: `${finished}/${total}`,
    label: done ? "Tapos na" : "Nasa progreso",
    tone: done ? "up" : "unawa",
    message: done ? "Natapos mo ang lahat ng lektura!" : "Ituloy ang pagbasa ng mga lektura.",
  };
}

const NO_GAME = { percent: null, text: "--", label: "Walang laro", tone: "soft", message: "Walang laro sa mga aralin mo ngayon." };
const NO_ACTIVITY = { percent: null, text: "--", label: "Walang gawain", tone: "soft", message: "Walang gawain sa mga aralin mo ngayon." };

function skillCard(key, state, index) {
  const style = STYLE[key];
  const bars = (state.lessonScores || []).slice(-6);
  const trend =
    state.trend === "UP"
      ? `<span class="st-pill st-pill--up">↑ Umaangat</span>`
      : state.trend === "DOWN"
        ? `<span class="st-pill st-pill--down">↓ Bumaba</span>`
        : "";
  return `
    <article class="st-skill st-skill--${key}" style="--i:${index}">
      <div class="st-skill__head">
        <span class="st-skill__icon">${icon(style.icon)}</span>
        <span class="st-skill__name"><strong>${style.name}</strong><small>${style.source}</small></span>
        <span class="st-skill__percent${state.percent == null ? " is-empty" : ""}">${escapeHtml(state.text)}</span>
      </div>
      <div class="st-skill__row">
        <span class="st-pill st-pill--${state.tone}">${escapeHtml(state.label)}</span>
        ${trend}
        ${state.stars == null ? "" : stars(state.stars)}
      </div>
      <span class="st-bar st-skill__bar"><i style="width:${Math.max(0, Math.min(100, state.percent || 0))}%"></i></span>
      <div class="st-skill__foot">
        <p>${escapeHtml(state.message)}</p>
        ${
          bars.length
            ? `<span class="st-minibars" aria-hidden="true">${bars
                .map((score, i) => `<i class="${i === bars.length - 1 ? "is-latest" : ""}" style="height:${Math.max(14, score)}%"></i>`)
                .join("")}</span>`
            : ""
        }
      </div>
    </article>`;
}

/** Pronunciation words missed at least once, most recent lessons first. */
function hardWords(docs) {
  const seen = new Set();
  return docs
    .map((item) => {
      const record = item.skills?.pagbigkas;
      const words = (record?.hardWords || []).filter((word) => typeof word === "string");
      return { time: record?.completedAt?.toMillis?.() || 0, words };
    })
    .filter((entry) => entry.words.length)
    .sort((a, b) => b.time - a.time)
    .flatMap((entry) => entry.words)
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);
}

export async function renderProgress() {
  content().innerHTML = `
    <section class="st-progress">
      <header class="st-progress__title">
        <h1>Aking Progreso</h1>
        <p>Tingnan kung gaano ka na kagaling sa bawat kasanayan!</p>
      </header>
      <div id="progress-body"><div class="st-loading"><span></span><span></span><span></span></div></div>
    </section>`;

  await loadClassLessons();
  const docs = await loadClassProgressDocs();
  const summary = summarize(await scoredResults(docs));

  // Practice lessons save nothing, so they are left out of every count here.
  const lessons = scoredLessons();
  const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const skippedOf = (id) => ({ game: lessonsById.get(id)?.gameSkipped, activity: lessonsById.get(id)?.activitySkipped });
  const finished = docs.filter((item) => lessonParts(item, skippedOf(item.id)).finished).length;
  const total = lessons.length;
  const allGamesSkipped = total > 0 && lessons.every((lesson) => lesson.gameSkipped);
  const allActivitiesSkipped = total > 0 && lessons.every((lesson) => lesson.activitySkipped);

  const levels = Object.values(summary.skills).map((skill) => skill.level);
  const hasData = Object.values(summary.skills).some((skill) => skill.lessons > 0) || docs.some((item) => item.lectureFinished);
  const [heroMessage, mood] = summary.needsHelp.length
    ? ["May kasanayang kailangan nating sanayin. Kaya natin 'to!", "cheer"]
    : levels.includes("MAHUSAY")
      ? ["Ang galing mo! Tingnan ang mga bituing nakuha mo.", "happy"]
      : hasData
        ? ["Tuloy lang ang pag-aaral, umuunlad ka!", "idle"]
        : ["Simulan ang unang aralin para makita ang iyong progreso.", "idle"];

  const percentDone = total ? Math.floor((finished * 100) / total) : 0;
  const words = hardWords(docs);
  const name = firstName().split(" ")[0];

  $("#progress-body").innerHTML = `
    <div class="st-progress-hero">
      ${buddy(mood, "st-progress-hero__buddy")}
      <div class="st-progress-hero__text">
        <h2>${escapeHtml(name ? `Kumusta, ${name}!` : "Kumusta!")}</h2>
        <p>${escapeHtml(heroMessage)}</p>
      </div>
      <div class="st-ring" style="--value:${percentDone}" role="img" aria-label="${finished} sa ${total} na aralin ang natapos">
        <strong>${finished}/${total}</strong>
        <small>aralin<br />natapos</small>
      </div>
    </div>

    <h2 class="st-section-title">Mga kasanayan ko</h2>
    <div class="st-skills">
      ${SKILLS.map(({ key }, index) => {
        const skill = summary.skills[key];
        const state =
          key === "pagUnawa" && skill.lessons === 0
            ? lectureState(docs)
            : key === "talasalitaan" && skill.lessons === 0 && allGamesSkipped
              ? NO_GAME
              : key === "pagkilala" && skill.lessons === 0 && allActivitiesSkipped
                ? NO_ACTIVITY
                : scoredState(skill);
        return skillCard(key, state, index);
      }).join("")}
    </div>

    ${
      words.length
        ? `<section class="st-card st-words">
            <h2>Mga salitang sanayin</h2>
            <p>Mga salitang medyo nahirapan ka sa Pagbigkas. Subukan mo ulit!</p>
            <div class="st-words__list">${words.map((word) => `<span>${escapeHtml(word)}</span>`).join("")}</div>
          </section>`
        : ""
    }`;

  // Keep the saved summary (read by the teacher's reports) in step with what the student sees.
  saveSummary(summary).catch((error) => console.warn("Could not save skill summary", error));
}
