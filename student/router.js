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
import { renderAssistant } from "./views/assistant.js";

// Hash routes: #/home #/join #/progress #/chat #/notifications #/account #/diksiyonaryo #/lesson/{id} #/lesson/{id}/{lecture|game|activity|pronunciation|quiz}

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
  assistant: renderAssistant,
};

/** Called by a screen that is leaving (stops audio, the mic, live listeners). */
let cleanup = null;
let leaveGuard = null;
let activeRoute = null;
let deciding = false;
let navAnimation;
let navObserver;

// Animate the new screen as soon as it mounts, including pages that await data
// before rendering. The fixed navigation stays still and loading never waits.
function prepareNavTransition(from, to) {
  navObserver?.disconnect();
  navAnimation?.cancel();
  const tabs = ["/home", "/progress", "/chat", "/account"];
  const page = $("#page-content");
  if (from === to || !tabs.includes(from) || !tabs.includes(to) ||
      !page?.animate || !window.MutationObserver ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  // Observe only the screen replacement, not later chat/progress updates.
  navObserver = new window.MutationObserver(() => {
    navObserver.disconnect();
    navAnimation = page.animate([
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  });
  navObserver.observe(page, { childList: true });
}

/** Keeps the current screen mounted until an asynchronous exit decision completes. */
export function beforeLeave(check) {
  leaveGuard = check;
  return () => { if (leaveGuard === check) leaveGuard = null; };
}
export function onLeave(fn) {
  const previous = cleanup;
  cleanup = previous ? () => (previous(), fn()) : fn;
}

// Main tabs guard their asynchronous updates on leave, so navigation
// can replace them immediately. Lesson screens retain serialized mounting and
// the quiz's exit guard while their initial setup is still running.
let rendering = null;

export function renderRoute() {
  if (deciding) {
    if ((location.hash.slice(1) || "/home") !== activeRoute)
      history.pushState(history.state, "", `#${activeRoute}`);
    return rendering?.promise;
  }
  if (rendering) {
    if (!["/home", "/progress", "/chat", "/account"].includes(activeRoute) || leaveGuard ||
        (location.hash.slice(1) || "/home") === activeRoute) {
      rendering.pending = true;
      return rendering.promise;
    }
  }
  const flight = { pending: false };
  rendering = flight;
  flight.promise = (async () => {
    do {
      flight.pending = false;
      await drawRoute(flight);
    } while (flight.pending && rendering === flight);
  })().finally(() => {
    if (rendering === flight) rendering = null;
  });
  return flight.promise;
}

async function drawRoute(flight) {
  if (!student.uid) return;
  const route = location.hash.slice(1) || "/home";
  if (leaveGuard && activeRoute === route) return;
  if (leaveGuard && activeRoute && activeRoute !== route) {
    // Hash traversal has already changed the URL. Restore it without rerendering
    // or losing the selected answer, then return to the requested history entry
    // only after the user confirms and the server accepts the abandonment.
    history.pushState(history.state, "", `#${activeRoute}`);
    deciding = true;
    try {
      if (await leaveGuard()) { leaveGuard = null; history.back(); }
    } finally { deciding = false; }
    return;
  }
  const leaving = cleanup;
  cleanup = null;
  leaving?.();

  const previousRoute = activeRoute;
  activeRoute = route;
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
  $("#app-view").classList.toggle("is-chat", section === "chat" || section === "assistant");
  $$("[data-nav]").forEach((link) => {
    const active =
      link.dataset.nav === section ||
      (link.dataset.nav === "home" && ["lesson", "join", "notifications"].includes(section));
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
  prepareNavTransition(previousRoute, route);

  try {
    if (section === "lesson" && lessonId && !part) await renderLessonPath(lessonId);
    else if (section === "lesson" && lessonId && PARTS[part]) await PARTS[part](lessonId);
    else if (PAGES[section] && !rawId) await PAGES[section]();
    else navigate("/home");
  } catch (error) {
    // The student already moved on; the queued render will draw the new page.
    if (flight.pending || rendering !== flight) return;
    console.error(error);
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
  } finally {
    if (rendering === flight) navObserver?.disconnect();
  }

  // Badges follow the class the student is in now.
  if (!focus && rendering === flight) {
    refreshBell().catch(() => {});
    watchChatBadge().catch(() => {});
  }
}
