import { $, escapeHtml, navigate, toast } from "../../js/helpers.js";
import {
  student,
  availability,
  canOpen,
  classId,
  formatWhen,
  isComplete,
  loadClassLessons,
  loadProfile,
  downloadLesson,
  downloadedLessons,
  removeLessonDownload,
} from "../data.js";
import { content, icon, showDialog } from "../ui.js";
import { refreshBell } from "./notifications.js";
import { putDownload } from "../offlineStore.js";
import { onLeave } from "../router.js";
import { downloadLessons } from "../downloadQueue.js";
import { withDownloadAbort } from "../downloadCancellation.js";

// "Mga Aralin": the class's lessons (the app's HomeFragment + LessonAdapter).

const DIFFICULTY = ["beginner", "intermediate", "advanced"];
let downloads = new Map();
const downloading = new Set();
const downloadProgress = new Map();
const removingDownloads = new Set();
let bulkDownloading = false;
let bulkController = null;
let bulkLabel = "";
const isInstalledPwa = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function downloadedIcon() {
  return `<span class="st-download-icon st-download-icon--done" role="img" aria-label="Naka-download" title="Naka-download"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" /></svg></span>`;
}

function downloadIndicator(lessonId) {
  if (downloading.has(lessonId)) {
    const percent = Math.max(0, Math.min(100, Math.round(downloadProgress.get(lessonId) || 0)));
    return `<span class="st-download-ring" role="progressbar" aria-label="Progreso ng download" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle class="st-download-ring__track" cx="12" cy="12" r="9" /><circle class="st-download-ring__fill" cx="12" cy="12" r="9" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - percent}" /></svg>
    </span>`;
  }
  return downloads.has(lessonId) ? downloadedIcon() : "";
}

function downloadAction(lessonId) {
  return downloading.has(lessonId)
    ? `Dina-download… ${Math.max(0, Math.min(100, Math.round(downloadProgress.get(lessonId) || 0)))}%`
    : downloads.has(lessonId) ? "I-update ang download" : "I-download";
}

/** "Tapos na", "Nasa progreso" or "Hindi pa nasisimulan" (a skipped game or Gawain never counts). A part left halfway already makes it Nasa progreso. */
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
    <li class="st-lesson-card${isInstalledPwa() ? " has-download-menu" : ""}" data-download-card="${escapeHtml(lesson.id)}">
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
      ${isInstalledPwa() ? `<span class="st-download-state" data-download-state="${escapeHtml(lesson.id)}">${downloadIndicator(lesson.id)}</span>
      <details class="st-download-menu" data-download-menu="${escapeHtml(lesson.id)}">
        <summary aria-label="Mga opsyon sa download: ${escapeHtml(lesson.title)}" title="Mga opsyon sa download">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
        </summary>
        <div class="st-download-controls">
        <span data-download-hint>${downloads.has(lesson.id) ? (downloads.get(lesson.id).meta.contentVersion === lesson.contentVersion ? "Naka-download" : "May bagong bersyon") : navigator.onLine ? canOpen(lesson) ? "I-save para magamit offline" : "Hindi bukas ang aralin para i-download" : "Kumonekta para i-download"}</span>
        <button class="button secondary" type="button" data-download="${escapeHtml(lesson.id)}" ${navigator.onLine && canOpen(lesson) ? "" : "hidden"} ${bulkDownloading || downloading.has(lesson.id) || removingDownloads.has(lesson.id) ? "disabled" : ""}>${downloadAction(lesson.id)}</button>
        <button class="button secondary" type="button" data-remove-download="${escapeHtml(lesson.id)}" ${downloads.has(lesson.id) ? "" : "hidden"} ${bulkDownloading || downloading.has(lesson.id) || removingDownloads.has(lesson.id) ? "disabled" : ""}>Alisin ang download</button>
        </div>
      </details>` : ""}
    </li>`;
}

// Progress must preserve card nodes, their animation state, focus and open menus.
function updateDownloadCard(card) {
  const id = card.dataset.downloadCard;
  const saved = downloads.get(id);
  const lesson = student.lessons.find((item) => item.id === id);
  const indicator = card.querySelector("[data-download-state]");
  if (!indicator || !lesson) return;
  const busy = bulkDownloading || downloading.has(id) || removingDownloads.has(id);
  const ring = indicator.querySelector(".st-download-ring");
  if (downloading.has(id)) {
    if (!ring) indicator.innerHTML = downloadIndicator(id);
    else {
      const percent = Math.max(0, Math.min(100, Math.round(downloadProgress.get(id) || 0)));
      ring.setAttribute("aria-valuenow", percent);
      ring.querySelector(".st-download-ring__fill").setAttribute("stroke-dashoffset", 100 - percent);
    }
  } else if (saved) {
    if (!indicator.querySelector(".st-download-icon--done")) indicator.innerHTML = downloadedIcon();
  } else if (indicator.firstChild) indicator.replaceChildren();
  const download = card.querySelector("[data-download]");
  download.hidden = !navigator.onLine || !canOpen(lesson);
  download.disabled = busy;
  download.textContent = downloadAction(id);
  const remove = card.querySelector("[data-remove-download]");
  remove.hidden = !saved;
  remove.disabled = busy;
  card.querySelector("[data-download-hint]").textContent = saved
    ? saved.meta.contentVersion === lesson.contentVersion ? "Naka-download" : "May bagong bersyon"
    : navigator.onLine ? canOpen(lesson) ? "I-save para magamit offline" : "Hindi bukas ang aralin para i-download" : "Kumonekta para i-download";
}

function matchesLessonTab(lesson, tab) {
  if (tab === "all") return true;
  if (tab === "downloaded") return downloads.has(lesson.id);
  return (availability(lesson) === "closed" ? "closed" : "open") === tab;
}

// Downloaded is separate from completion remarks such as Tapos na.
const TABS = [
  { key: "all", label: "Lahat" },
  { key: "open", label: "Bukas" },
  { key: "closed", label: "Sarado" },
];
const availableTabs = () => isInstalledPwa() ? [...TABS, { key: "downloaded", label: "Na-download" }] : TABS;
let activeTab = "all";

const tabOf = (lesson) => (availability(lesson) === "closed" ? "closed" : "open");

// Status chips under the search, combined with the tabs above (e.g. Bukas + Hindi pa nasisimulan). Practice lessons save no progress, so they're only under Lahat.
const STATUSES = [
  { key: "all", label: "Lahat" },
  { key: "done", label: "Tapos na" },
  { key: "progress", label: "Nasa progreso" },
  { key: "new", label: "Hindi pa nasisimulan" },
];
let activeStatus = "all";

const inStatus = (lesson, status) => status === "all" || (!lesson.practice && statusOf(lesson).key === status);

/** List order: open lessons by nearest deadline, then open ones with no deadline, then not-yet-open (soonest to open first), then closed (most recently closed first). */
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
      title: navigator.onLine ? "Wala pang nakatalagang aralin." : "Walang na-download na aralin.",
      text: navigator.onLine ? "Bumalik muli para tingnan ang mga bagong gawain." : "Kumonekta at i-download muna ang mga araling gagamitin offline.",
    },
    "no-downloaded": { title: "Walang na-download na aralin.", text: "Piliin ang I-download sa menu ng aralin o gamitin ang I-download lahat." },
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
  if (!isInstalledPwa() && activeTab === "downloaded") activeTab = "all";
  let active = true;
  onLeave(() => { active = false; });
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
      ${isInstalledPwa() ? `<div class="st-download-all"><button class="button secondary" type="button" id="home-download-all" disabled>${icon("download")}<span>I-download lahat</span></button><button class="st-icon-button" type="button" id="home-cancel-download-all" aria-label="Itigil ang pag-download" title="Itigil ang pag-download" hidden>${icon("close")}</button><span id="home-download-all-status" role="status"></span></div>` : ""}
      <div id="home-list" aria-live="polite">
        <div class="st-loading"><span></span><span></span><span></span></div>
      </div>
    </section>`;

  const list = $("#home-list");
  const search = $("#home-search");
  const tabs = $("#home-tabs");
  const statuses = $("#home-status");
  const downloadAll = $("#home-download-all");
  const cancelDownloadAll = $("#home-cancel-download-all");
  const bulkStatus = $("#home-download-all-status");
  const updateBulkButton = () => {
    if (!downloadAll) return;
    downloadAll.hidden = !classId() || !student.lessons.length;
    downloadAll.disabled = !navigator.onLine || bulkDownloading || downloading.size > 0 || removingDownloads.size > 0 ||
      !student.lessons.some((lesson) => availability(lesson) === "open" && !downloads.has(lesson.id));
    downloadAll.querySelector("span").textContent = bulkDownloading ? "Dina-download…" : "I-download lahat";
    bulkStatus.textContent = bulkLabel;
    cancelDownloadAll.hidden = !bulkDownloading;
    cancelDownloadAll.disabled = bulkController?.signal.aborted === true;
  };

  const inTab = (lesson) => matchesLessonTab(lesson, activeTab);
  const matchingLessons = () => {
    const query = search.value.trim().toLowerCase();
    return student.lessons.filter((lesson) => inTab(lesson) && inStatus(lesson, activeStatus) &&
      (!query || lesson.title.toLowerCase().includes(query))).sort(compareBySchedule);
  };

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
    const count = { all: student.lessons.length, open: student.lessons.length - closed, closed,
      downloaded: student.lessons.filter((lesson) => downloads.has(lesson.id)).length };
    tabs.innerHTML = availableTabs().map(
      ({ key, label }) => `
        <button class="st-tab${key === activeTab ? " is-active" : ""}" type="button" role="tab" data-tab="${key}" aria-selected="${key === activeTab}">
          ${label}<span class="st-tab__count">${count[key]}</span>
        </button>`,
    ).join("");
  };

  const draw = () => {
    updateBulkButton();
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
    const shown = matchingLessons();
    list.innerHTML = shown.length
      ? `<ul class="st-lessons">${shown.map((lesson) => lessonCard(lesson, query)).join("")}</ul>`
      : query
        ? emptyState("no-results", query)
        : emptyState(`no-${activeStatus === "all" ? activeTab : activeStatus}`);
  };
  const refreshDownloads = () => {
    if (!active) return;
    updateBulkButton();
    const downloadedCount = tabs.querySelector('[data-tab="downloaded"] .st-tab__count');
    if (downloadedCount) downloadedCount.textContent = student.lessons.filter((lesson) => downloads.has(lesson.id)).length;
    if (activeTab === "downloaded") {
      const shown = matchingLessons();
      let ul = list.querySelector(".st-lessons");
      const sameRows = ul ? shown.length === ul.children.length && shown.every((lesson, index) => ul.children[index].dataset.downloadCard === lesson.id) : !shown.length;
      if (!shown.length) {
        if (ul) list.innerHTML = emptyState(search.value.trim() ? "no-results" : activeStatus === "all" ? "no-downloaded" : `no-${activeStatus}`, search.value.trim());
      } else {
        if (!ul) { ul = document.createElement("ul"); ul.className = "st-lessons"; list.replaceChildren(ul); }
        const wanted = new Set(shown.map((lesson) => lesson.id));
        const existing = new Map([...ul.children].map((card) => [card.dataset.downloadCard, card]));
        existing.forEach((card, id) => { if (!wanted.has(id)) card.remove(); });
        shown.forEach((lesson, index) => {
          let card = existing.get(lesson.id);
          if (!card) {
            const template = document.createElement("template");
            template.innerHTML = lessonCard(lesson, search.value.trim());
            card = template.content.firstElementChild;
          }
          if (ul.children[index] !== card) ul.insertBefore(card, ul.children[index] || null);
        });
      }
      if (!sameRows) drawStatuses();
    }
    list.querySelectorAll("[data-download-card]").forEach(updateDownloadCard);
  };
  const refreshDownloadView = refreshDownloads;
  window.addEventListener("basaya-download-state", refreshDownloadView);
  onLeave(() => window.removeEventListener("basaya-download-state", refreshDownloadView));

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

  const load = async ({ preserveCards = false } = {}) => {
    const previousLessons = JSON.stringify(student.lessons);
    // The class may have changed elsewhere (e.g. the teacher approved leaving).
    await loadProfile();
    $("#home-class").textContent = student.profile.className || "";
    search.closest(".st-search").hidden = !classId();
    await loadClassLessons();
    try {
      const saved = await downloadedLessons();
      // Refresh schedules and membership without replacing the downloaded content version.
      if (navigator.onLine) for (const item of saved) {
        const current = student.lessons.find((lesson) => lesson.id === item.meta.id);
        if (!current) await removeLessonDownload(item.meta.id);
        else {
          item.meta = { ...current, contentVersion: item.meta.contentVersion };
          await putDownload(student.uid, student.profile.classId, item);
        }
      }
      downloads = new Map((await downloadedLessons()).map((item) => [item.meta.id, item]));
    } catch (error) {
      console.warn("Downloads unavailable", error);
      downloads = new Map();
    }
    if (preserveCards && previousLessons === JSON.stringify(student.lessons)) refreshDownloads();
    else draw();
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
  const closeDownloadMenus = (event) => {
    list.querySelectorAll(".st-download-menu[open]").forEach((menu) => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  };
  document.addEventListener("click", closeDownloadMenus);
  onLeave(() => document.removeEventListener("click", closeDownloadMenus));
  list.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const menu = event.target.closest(".st-download-menu[open]");
    if (menu) {
      event.preventDefault();
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  });
  list.addEventListener("click", (event) => {
    const card = event.target.closest("[data-lesson]");
    if (!card) return;
    const lesson = student.lessons.find((item) => item.id === card.dataset.lesson);
    if (!lesson) return;
    if (canOpen(lesson)) navigate(`/lesson/${encodeURIComponent(lesson.id)}`);
    else showLocked(lesson);
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-download], [data-remove-download]");
    if (!button || !isInstalledPwa() || bulkDownloading) return;
    const id = button.dataset.download || button.dataset.removeDownload;
    if (downloading.has(id) || removingDownloads.has(id)) return;
    const redrawDownloads = refreshDownloads;
    try {
      if (button.dataset.removeDownload) {
        removingDownloads.add(id);
        redrawDownloads();
        await removeLessonDownload(id);
      }
      else {
        downloading.add(id);
        downloadProgress.set(id, 0);
        redrawDownloads();
        await downloadLesson(id, (percent) => {
          downloadProgress.set(id, percent);
          refreshDownloads();
        });
      }
    } catch (error) {
      await showDialog({ iconName: "refresh", title: "Hindi natapos ang download", message: error.message || "Suriin ang internet at storage, saka subukan muli.", primary: "Sige" });
    } finally {
      downloading.delete(id);
      removingDownloads.delete(id);
      downloadProgress.delete(id);
      try {
        downloads = new Map((await downloadedLessons()).map((item) => [item.meta.id, item]));
      } catch {
        downloads = new Map();
      }
      redrawDownloads();
      if (!active) window.dispatchEvent(new Event("basaya-download-state"));
    }
  });

  cancelDownloadAll?.addEventListener("click", () => {
    bulkController?.abort();
    bulkLabel = "Itinitigil ang pag-download…";
    refreshDownloads();
  });

  downloadAll?.addEventListener("click", async () => {
    if (bulkDownloading || downloading.size || removingDownloads.size || !navigator.onLine || !isInstalledPwa()) return;
    const uid = student.uid;
    const cid = classId();
    bulkDownloading = true;
    const controller = new AbortController();
    bulkController = controller;
    bulkLabel = "Inihahanda ang mga aralin…";
    refreshDownloads();
    try {
      await withDownloadAbort(load({ preserveCards: true }), controller.signal);
      const queue = student.lessons.filter((lesson) => availability(lesson) === "open" && !downloads.has(lesson.id));
      const result = await downloadLessons(queue, {
        signal: controller.signal,
        shouldContinue: () => active && navigator.onLine && student.uid === uid && classId() === cid,
        isEligible: (lesson) => availability(lesson) === "open" && !downloads.has(lesson.id),
        download: (lesson, progress) => downloadLesson(lesson.id, progress, { signal: controller.signal }),
        onProgress: (lesson, index, total, percent) => {
          downloading.add(lesson.id);
          downloadProgress.set(lesson.id, percent);
          bulkLabel = `Aralin ${index + 1}/${total} • ${percent}%`;
          refreshDownloads();
        },
        onResult: async (lesson) => {
          downloading.delete(lesson.id);
          downloadProgress.delete(lesson.id);
          if (student.uid === uid && classId() === cid) downloads = new Map((await downloadedLessons()).map((item) => [item.meta.id, item]));
          refreshDownloads();
        },
      });
      bulkLabel = `${result.downloaded} na-download${result.failed ? ` • ${result.failed} hindi natapos` : ""}${result.stopped ? " • Natigil ang pila; pindutin muli para ituloy" : ""}`;
      if (active) toast(bulkLabel);
    } catch (error) {
      bulkLabel = controller.signal.aborted ? "Itinigil ang pag-download." : "Hindi natapos ang pag-download. Suriin ang internet at storage, saka subukan muli.";
      if (active) toast(bulkLabel);
    } finally {
      bulkDownloading = false;
      bulkController = null;
      window.dispatchEvent(new Event("basaya-download-state"));
    }
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
