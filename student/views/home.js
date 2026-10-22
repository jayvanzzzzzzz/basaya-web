import { $, escapeHtml, navigate } from "../../js/helpers.js";
import {
  student,
  availability,
  canOpen,
  classId,
  formatWhen,
  isComplete,
  loadClassLessons,
  loadProfile,
} from "../data.js";
import { content, icon, showDialog } from "../ui.js";
import { refreshBell } from "./notifications.js";

// "Mga Aralin": the class's lessons (the app's HomeFragment + LessonAdapter).

const DIFFICULTY = ["beginner", "intermediate", "advanced"];

/**
 * "Tapos na", "Nasa progreso" or "Hindi pa nasisimulan" (a skipped game or Gawain never
 * counts). A part left halfway already makes it Nasa progreso.
 */
function statusOf(lesson) {
  const game = lesson.gameFinished && !lesson.gameSkipped;
  const activity = lesson.activityFinished && !lesson.activitySkipped;
  if (isComplete(lesson)) return { key: "done", label: "Tapos na", icon: "check" };
  if (lesson.lectureFinished || game || activity || lesson.quizFinished || lesson.started)
    return { key: "progress", label: "Nasa progreso", icon: "refresh" };
  return { key: "new", label: "Hindi pa nasisimulan", icon: "lock" };
}

/** Lecture, game and Gawain (unless skipped) and Pagsusulit, as on the app's card. */
function percentOf(lesson) {
  const parts = [lesson.lectureFinished, lesson.quizFinished];
  if (!lesson.gameSkipped) parts.push(lesson.gameFinished);
  if (!lesson.activitySkipped) parts.push(lesson.activityFinished);
  return Math.floor((parts.filter(Boolean).length * 100) / parts.length);
}

function scheduleChip(lesson) {
  const state = availability(lesson);
  if (state === "not-yet-open")
    return `<span class="st-chip st-chip--new">${icon("lock")}Bubukas: ${escapeHtml(formatWhen(lesson.openAt))}</span>`;
  if (state === "closed")
    return `<span class="st-chip st-chip--closed">${icon("lock")}Sarado na · Deadline: ${escapeHtml(formatWhen(lesson.dueAt))}</span>`;
  if (lesson.dueAt != null)
    return `<span class="st-chip st-chip--progress">Deadline: ${escapeHtml(formatWhen(lesson.dueAt))}</span>`;
  return "";
}

function highlight(title, search) {
  if (!search) return escapeHtml(title);
  const start = title.toLowerCase().indexOf(search.toLowerCase());
  if (start < 0) return escapeHtml(title);
  const end = start + search.length;
  return `${escapeHtml(title.slice(0, start))}<mark>${escapeHtml(title.slice(start, end))}</mark>${escapeHtml(title.slice(end))}`;
}

/** Pagsasanay (Practice: nothing saved) or Pagtataya (Assessment: scores count). */
const modeChip = (lesson) =>
  lesson.practice
    ? `<span class="st-chip st-chip--practice">${icon("refresh")}Pagsasanay</span>`
    : `<span class="st-chip st-chip--assessment">${icon("star")}Pagtataya</span>`;

function lessonCard(lesson, search) {
  const status = statusOf(lesson);
  const percent = percentOf(lesson);
  const difficulty = lesson.difficulty.toLowerCase();
  // A Practice lesson saves no progress, so it has no status or progress bar.
  return `
    <li>
      <button class="st-lesson${canOpen(lesson) ? "" : " is-locked"}" type="button" data-lesson="${escapeHtml(lesson.id)}">
        <span class="st-lesson__top">
          <span class="st-lesson__eyebrow">${lesson.order > 0 ? `ARALIN ${lesson.order}` : "ARALIN"}</span>
          ${lesson.practice ? "" : `<span class="st-chip st-chip--${status.key}">${icon(status.icon)}${status.label}</span>`}
        </span>
        <strong class="st-lesson__title">${highlight(lesson.title, search)}</strong>
        ${lesson.description ? `<span class="st-lesson__desc">${escapeHtml(lesson.description)}</span>` : ""}
        <span class="st-lesson__meta">
          ${modeChip(lesson)}
          ${
            lesson.difficulty
              ? `<span class="st-difficulty st-difficulty--${DIFFICULTY.includes(difficulty) ? difficulty : "other"}"><i></i>${escapeHtml(
                  lesson.difficulty.charAt(0).toUpperCase() + lesson.difficulty.slice(1),
                )}</span>`
              : ""
          }
          ${scheduleChip(lesson)}
        </span>
        ${
          lesson.practice
            ? ""
            : `<span class="st-lesson__progress">
          <span class="st-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Progreso ng aralin"><i style="width:${percent}%"></i></span>
          <b>${percent}%</b>
        </span>`
        }
      </button>
    </li>`;
}

// Lahat / Bukas / Sarado tabs. "Hindi pa bukas" lessons count as Bukas.
const TABS = [
  { key: "all", label: "Lahat" },
  { key: "open", label: "Bukas" },
  { key: "closed", label: "Sarado" },
];
let activeTab = "all";

const tabOf = (lesson) => (availability(lesson) === "closed" ? "closed" : "open");

// Status chips under the search, combined with the tabs above (e.g. Bukas + Hindi pa
// nasisimulan). Practice lessons save no progress, so they're only under Lahat.
const STATUSES = [
  { key: "all", label: "Lahat" },
  { key: "done", label: "Tapos na" },
  { key: "progress", label: "Nasa progreso" },
  { key: "new", label: "Hindi pa nasisimulan" },
];
let activeStatus = "all";

const inStatus = (lesson, status) => status === "all" || (!lesson.practice && statusOf(lesson).key === status);

/**
 * List order: open lessons by nearest deadline, then open ones with no deadline,
 * then not-yet-open (soonest to open first), then closed (most recently closed first).
 */
function compareBySchedule(a, b) {
  const rank = { open: 0, "not-yet-open": 1, closed: 2 };
  const stateA = availability(a);
  const stateB = availability(b);
  if (stateA !== stateB) return rank[stateA] - rank[stateB];
  if (stateA === "closed") return b.dueAt - a.dueAt || a.order - b.order;
  if (stateA === "not-yet-open") return a.openAt - b.openAt || a.order - b.order;
  if (a.dueAt == null || b.dueAt == null)
    return (a.dueAt == null) - (b.dueAt == null) || a.order - b.order;
  return a.dueAt - b.dueAt || a.order - b.order;
}

/** Before the open date, or after the deadline of an unfinished lesson. */
function showLocked(lesson) {
  const closed = availability(lesson) === "closed";
  showDialog({
    iconName: "lock",
    tone: "locked",
    title: closed ? "Sarado na" : "Hindi pa bukas",
    message: closed
      ? `Lumampas na ang deadline ng “${lesson.title}” (${formatWhen(lesson.dueAt)}). Hindi na ito maaaring sagutan.`
      : `Mabubuksan mo ang “${lesson.title}” sa ${formatWhen(lesson.openAt)}.`,
  });
}

function emptyState(kind, query = "") {
  const states = {
    "no-class": {
      title: "Wala ka pang nasalihang klase.",
      text: "Pindutin ang button sa ibaba para sumali gamit ang class code.",
      action: `<a class="button primary" href="#/join">${icon("plus")}Sumali sa klase</a>`,
    },
    "no-lessons": {
      title: "Wala pang nakatalagang aralin.",
      text: "Bumalik muli para tingnan ang mga bagong gawain.",
    },
    "no-results": { title: `Walang lesson na nahanap para sa “${query}”.`, text: "" },
    "no-open": { title: "Walang bukas na aralin.", text: "" },
    "no-closed": { title: "Walang saradong aralin.", text: "" },
    "no-done": { title: "Wala ka pang natapos na aralin.", text: "Tapusin ang bawat hakbang ng isang aralin para mapunta ito rito." },
    "no-progress": { title: "Walang aralin na nasa progreso.", text: "Ang mga aralin na sinimulan mo na ay makikita rito." },
    "no-new": { title: "Nasimulan mo na ang lahat ng aralin!", text: "Magaling! Tingnan ang Nasa progreso para ituloy ang mga ito." },
  };
  const state = states[kind];
  return `
    <div class="st-empty">
      <img class="st-empty__art" src="../img/logo.png" alt="" />
      <h2>${escapeHtml(state.title)}</h2>
      ${state.text ? `<p>${escapeHtml(state.text)}</p>` : ""}
      ${state.action || ""}
    </div>`;
}

export async function renderHome() {
  content().innerHTML = `
    <section class="st-home">
      <header class="st-hero st-hero--home">
        <div>
          <span class="st-hero__eyebrow">Mga Aralin</span>
          <h1 id="home-class">${escapeHtml(student.profile.className || "")}</h1>
        </div>
        <button class="st-icon-button" type="button" id="home-refresh" aria-label="I-refresh ang mga aralin">${icon("refresh")}</button>
      </header>
      <label class="st-search">
        ${icon("search")}
        <input id="home-search" type="search" placeholder="Hanapin ang aralin" autocomplete="off" aria-label="Hanapin ang aralin" />
      </label>
      <div class="st-tabs" id="home-tabs" role="tablist" aria-label="Salain ang mga aralin" hidden></div>
      <div class="st-status-filters" id="home-status" role="group" aria-label="Salain ayon sa progreso" hidden></div>
      <div id="home-list" aria-live="polite">
        <div class="st-loading"><span></span><span></span><span></span></div>
      </div>
    </section>`;

  const list = $("#home-list");
  const search = $("#home-search");
  const tabs = $("#home-tabs");
  const statuses = $("#home-status");

  const inTab = (lesson) => activeTab === "all" || tabOf(lesson) === activeTab;

  /** Counts follow the tab chosen above, so they match the list. */
  const drawStatuses = () => {
    const tabLessons = student.lessons.filter(inTab);
    statuses.innerHTML = STATUSES.map(({ key, label }) => {
      const count = tabLessons.filter((lesson) => inStatus(lesson, key)).length;
      return `
        <button class="st-status-filter st-status-filter--${key}${key === activeStatus ? " is-active" : ""}" type="button" data-status="${key}" aria-pressed="${key === activeStatus}">
          ${label}<span class="st-tab__count">${count}</span>
        </button>`;
    }).join("");
  };

  const drawTabs = () => {
    const closed = student.lessons.filter((lesson) => tabOf(lesson) === "closed").length;
    const count = { all: student.lessons.length, open: student.lessons.length - closed, closed };
    tabs.innerHTML = TABS.map(
      ({ key, label }) => `
        <button class="st-tab${key === activeTab ? " is-active" : ""}" type="button" role="tab" data-tab="${key}" aria-selected="${key === activeTab}">
          ${label}<span class="st-tab__count">${count[key]}</span>
        </button>`,
    ).join("");
  };

  const draw = () => {
    const query = search.value.trim();
    tabs.hidden = !classId() || !student.lessons.length;
    statuses.hidden = tabs.hidden;
    if (!classId()) {
      list.innerHTML = emptyState("no-class");
      return;
    }
    if (!student.lessons.length) {
      list.innerHTML = emptyState("no-lessons");
      return;
    }
    drawTabs();
    drawStatuses();
    const filtered = student.lessons
      .filter((lesson) => inTab(lesson) && inStatus(lesson, activeStatus))
      .sort(compareBySchedule);
    const shown = query
      ? filtered.filter((lesson) => lesson.title.toLowerCase().includes(query.toLowerCase()))
      : filtered;
    list.innerHTML = shown.length
      ? `<ul class="st-lessons">${shown.map((lesson) => lessonCard(lesson, query)).join("")}</ul>`
      : query
        ? emptyState("no-results", query)
        : emptyState(`no-${activeStatus === "all" ? activeTab : activeStatus}`);
  };

  tabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (!tab || tab.dataset.tab === activeTab) return;
    activeTab = tab.dataset.tab;
    draw();
  });

  statuses.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-status]");
    if (!chip || chip.dataset.status === activeStatus) return;
    activeStatus = chip.dataset.status;
    draw();
  });

  const load = async () => {
    // The class may have changed elsewhere (e.g. the teacher approved leaving).
    await loadProfile();
    $("#home-class").textContent = student.profile.className || "";
    search.closest(".st-search").hidden = !classId();
    await loadClassLessons();
    draw();
    refreshBell({ reload: true }).catch(() => {});
    highlightFromNotification();
  };

  /** From a tapped notification: scroll to the lesson(s) and make them glow for a moment. */
  const highlightFromNotification = () => {
    let ids = [];
    try {
      ids = (sessionStorage.getItem("basaya.highlight") || "").split(",").filter(Boolean);
      sessionStorage.removeItem("basaya.highlight");
    } catch {
      return;
    }
    if (!ids.length) return;
    if (search.value || activeTab !== "all" || activeStatus !== "all") {
      search.value = "";
      activeTab = "all";
      activeStatus = "all";
      draw();
    }
    const cards = ids.map((id) => list.querySelector(`[data-lesson="${CSS.escape(id)}"]`)).filter(Boolean);
    cards[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
    cards.forEach((card) => card.classList.add("is-glow"));
  };

  search.addEventListener("input", draw);
  list.addEventListener("click", (event) => {
    const card = event.target.closest("[data-lesson]");
    if (!card) return;
    const lesson = student.lessons.find((item) => item.id === card.dataset.lesson);
    if (!lesson) return;
    if (canOpen(lesson)) navigate(`/lesson/${encodeURIComponent(lesson.id)}`);
    else showLocked(lesson);
  });

  const refresh = $("#home-refresh");
  refresh.addEventListener("click", async () => {
    if (!classId()) {
      showDialog({ iconName: "plus", title: "Sumali muna sa isang klase.", message: "Ilagay ang class code mula sa iyong guro." });
      return;
    }
    refresh.classList.add("is-spinning");
    refresh.disabled = true;
    try {
      await load();
    } finally {
      refresh.classList.remove("is-spinning");
      refresh.disabled = false;
    }
  });

  await load();
}
