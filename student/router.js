import { $, $$, escapeHtml, navigate } from "../js/helpers.js";
import { student } from "./data.js";
import { renderHome } from "./views/home.js";
import { renderJoin } from "./views/join.js";
import { renderLessonPath } from "./views/lessonPath.js";
import { renderLecture } from "./views/lecture.js";
import { renderGame } from "./views/game.js";
import { renderActivity } from "./views/activity.js";
import { renderPronunciation } from "./views/pronunciation.js";
import { renderQuiz } from "./views/quiz.js";
import { renderProgress } from "./views/progress.js";
import { renderChat, watchChatBadge } from "./views/chat.js";
import { renderNotifications, refreshBell } from "./views/notifications.js";
import { renderAccount } from "./views/account.js";
import { renderDictionary } from "./views/dictionary.js";

// Hash routes:
//   #/home  #/join  #/progress  #/chat  #/notifications  #/account  #/diksiyonaryo
//   #/lesson/{id}  #/lesson/{id}/{lecture|game|activity|pronunciation|quiz}

const PARTS = {
  lecture: renderLecture,
  game: renderGame,
  activity: renderActivity,
  pronunciation: renderPronunciation,
  quiz: renderQuiz,
};

const PAGES = {
  home: renderHome,
  join: renderJoin,
  progress: renderProgress,
  chat: renderChat,
  notifications: renderNotifications,
  account: renderAccount,
  diksiyonaryo: renderDictionary,
};

/** Called by a screen that is leaving (stops audio, the mic, live listeners). */
let cleanup = null;
export function onLeave(fn) {
  const previous = cleanup;
  cleanup = previous ? () => (previous(), fn()) : fn;
}

// One render at a time: navigating fast while a page is still loading used to run
// two renders into the same #page-content, and the older one then crashed on
// elements the newer one had replaced. A hash change mid-render is queued and
// the latest route is drawn once the current render settles.
let rendering = null;
let pending = false;

export function renderRoute() {
  if (rendering) {
    pending = true;
    return rendering;
  }
  rendering = (async () => {
    do {
      pending = false;
      await drawRoute();
    } while (pending);
  })().finally(() => {
    rendering = null;
  });
  return rendering;
}

async function drawRoute() {
  if (!student.uid) return;
  const leaving = cleanup;
  cleanup = null;
  leaving?.();

  const route = location.hash.slice(1) || "/home";
  const [, section = "home", rawId, part] = route.split("/");
  let lessonId = null;
  if (rawId) {
    try {
      lessonId = decodeURIComponent(rawId);
    } catch {
      navigate("/home");
      return;
    }
  }

  // Lesson parts take the whole page (no top bar or bottom menu), like the app.
  const focus = section === "lesson" && part in PARTS;
  $("#app-view").classList.toggle("is-focus", focus);
  $("#app-view").classList.toggle("is-chat", section === "chat");
  $$("[data-nav]").forEach((link) => {
    const active =
      link.dataset.nav === section ||
      (link.dataset.nav === "home" && ["lesson", "join", "notifications"].includes(section));
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);

  try {
    if (section === "lesson" && lessonId && !part) await renderLessonPath(lessonId);
    else if (section === "lesson" && lessonId && PARTS[part]) await PARTS[part](lessonId);
    else if (PAGES[section] && !rawId) await PAGES[section]();
    else navigate("/home");
  } catch (error) {
    console.error(error);
    // The student already moved on; the queued render will draw the new page.
    if (pending) return;
    $("#app-view").classList.remove("is-focus");
    $("#page-content").innerHTML = `
      <div class="st-empty">
        <h2>May problema</h2>
        <p>${escapeHtml(
          error?.code === "unavailable" || !navigator.onLine
            ? "Walang internet. Kumonekta muli, saka subukan."
            : "Hindi ma-load ang pahinang ito. Subukan muli.",
        )}</p>
        <button class="button primary" type="button" id="retry">Subukan muli</button>
      </div>`;
    $("#retry").addEventListener("click", renderRoute);
  }

  // Badges follow the class the student is in now.
  if (!focus) {
    refreshBell().catch(() => {});
    watchChatBadge().catch(() => {});
  }
}
