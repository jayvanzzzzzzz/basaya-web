import { pathModules, sequenceBlocker, lessonSequence } from '../../js/studentSequence.js';
import { skeleton } from '../../js/page-loading.js';
import { pathBlocker, orderedPathAssignments } from '../../js/learningPathSequence.js';
import { confirmAction } from "../../js/action-confirmation.js";
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
import { listDownloads, removeDownload, updateDownloadMetadata } from "../offlineStore.js";
import { onLeave } from "../router.js";
import { downloadLessons } from "../downloadQueue.js";
import { withDownloadAbort } from "../downloadCancellation.js";

// "Mga Aralin": the class's lessons (the app's HomeFragment + LessonAdapter).

const DIFFICULTY = ["beginner", "intermediate", "advanced"];
let downloads = new Map();
let downloadsScope = "";
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
  if (lesson.lectureFinished || game || activity || (lesson.pronunciationFinished && !lesson.pronunciationSkipped) || (lesson.quizFinished && !lesson.quizSkipped) || lesson.started)
    return { key: "progress", label: "Nasa progreso", icon: "refresh" };
  return { key: "new", label: "Hindi pa nasisimulan", icon: "book" };
}

/** All five parts, excluding a game or Gawain the admin skipped. */
function percentOf(lesson) {
  const parts = [lesson.lectureFinished];
  if (!lesson.pronunciationSkipped) parts.push(lesson.pronunciationFinished);
  if (!lesson.quizSkipped) parts.push(lesson.quizFinished);
  if (!lesson.gameSkipped) parts.push(lesson.gameFinished);
  if (!lesson.activitySkipped) parts.push(lesson.activityFinished);
  return Math.floor((parts.filter(Boolean).length * 100) / parts.length);
}

function scheduleChip(lesson) {
  const previous = pathBlocker(lesson, student.lessons);
  if (previous) return `<span class="st-chip st-chip--new">${icon('lock')}Tapusin muna: ${escapeHtml(previous.title || 'Naunang lesson path')}</span>`;
  const prerequisite = sequenceBlocker(lesson, student.lessons);
  if (prerequisite) return `<span class="st-chip st-chip--new">${icon('lock')}Tapusin muna: ${escapeHtml(prerequisite.title)}</span>`;
  if(lesson.exempt) return `<span class="st-chip st-chip--progress">Exempt — walang bawas sa marka${lesson.dueAt ? ` · Deadline: ${escapeHtml(formatWhen(lesson.dueAt))}` : ""}</span>`;
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

          ${lesson.practice ? "" : `<span class="st-chip st-chip--${status.key}">${icon(status.icon)}${status.label}</span>`}
        </span>
        <strong class="st-lesson__title">${highlight(lesson.title, search)}</strong>
        ${lesson.description ? `<span class="st-lesson__desc">${escapeHtml(lesson.description)}</span>` : ""}
        <span class="st-lesson__meta">
          ${lesson.learningPathTitle ? `<span class="st-chip st-chip--new">${escapeHtml(lesson.learningPathTitle)}</span>` : ''}
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
        <span class="st-lesson__action">${canOpen(lesson) ? lesson.practice ? "Magsanay" : status.key === "done" ? "Balikan ang aralin" : status.key === "progress" ? "Ipagpatuloy" : "Simulan ang aralin" : pathBlocker(lesson, student.lessons) ? "Naka-lock ang lesson path" : sequenceBlocker(lesson, student.lessons) ? "Naka-lock ang aralin" : "Tingnan ang iskedyul"}${icon(canOpen(lesson) ? "chevron" : "lock")}</span>
      ${canOpen(lesson) ? "" : lockOverlay()}</button>
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

function assignedStudentPaths() {
  return orderedPathAssignments([], student.lessons).map((path, index) => {
    const members = student.lessons.filter(lesson => lesson.learningPathAssignmentId === path.id);
    const done = members.filter(isComplete).length, finished = members.length > 0 && done === members.length;
    const first = members[0] || {};
    return { ...first, id: path.id, title: path.title || 'Lesson path', members, pathNumber: index + 1, done,
      started: members.some(lesson => isComplete(lesson) || statusOf(lesson).key === 'progress'),
      practice: members.every(lesson => lesson.practice),
      lectureFinished: finished, gameFinished: finished, activityFinished: finished, pronunciationFinished: finished, quizFinished: finished,
      gameSkipped: false, activitySkipped: false, pronunciationSkipped: false, quizSkipped: false };
  });
}
function pathDownloadControls(path) {
  if (!isInstalledPwa()) return '';
  const saved = path.members.filter(lesson => downloads.has(lesson.id)).length;
  const busy = bulkDownloading || downloading.size > 0 || removingDownloads.size > 0;
  const disabled = busy || !navigator.onLine || !path.members.some(lesson => canOpen(lesson) && !downloads.has(lesson.id));
  const action = '<button class="button secondary" type="button" data-download-path="' + escapeHtml(path.id) + '" ' + (disabled ? 'disabled' : '') + '>' + icon('download') + 'I-download</button>';
  return '<div class="st-path-download-actions">' + action + '<span>' + saved + '/' + path.members.length + ' na-download</span></div>' +
    '<details class="st-download-menu"><summary aria-label="Mga opsyon sa download: ' + escapeHtml(path.title) + '" title="Mga opsyon sa download"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></summary><div class="st-download-controls"><span>I-save ang mga bukas na aralin para magamit offline</span>' + action +
    '<button class="button secondary" type="button" data-remove-path-download="' + escapeHtml(path.id) + '" ' + (saved ? '' : 'hidden') + (busy ? ' disabled' : '') + '>Alisin ang download</button></div></details>';
}
function studentPathCard(path, search) {
  const unlocked = path.members.some(canOpen), status = statusOf(path), percent = Math.round(path.done / path.members.length * 100);
  const modules = new Set(path.members.map(lesson => lesson.moduleId).filter(Boolean)).size;
  return `<li class="st-lesson-card st-assigned-path${isInstalledPwa() ? " has-download-menu" : ""}"><button class="st-lesson${unlocked ? '' : ' is-locked'}" type="button" data-student-path="${escapeHtml(path.id)}"><span class="st-lesson__top">${path.practice ? '' : `<span class="st-chip st-chip--${status.key}">${icon(status.icon)}${status.label}</span>`}</span><strong class="st-lesson__title">${highlight(path.title, search)}</strong><span class="st-lesson__desc">${modules ? modules + ' modules &middot; ' : ''}${path.members.length} aralin</span><span class="st-lesson__meta">${modeChip(path)}${scheduleChip(path)}</span>${path.practice ? '' : `<span class="st-lesson__progress"><span class="st-bar" role="progressbar" aria-label="Mga araling natapos" aria-valuemin="0" aria-valuemax="${path.members.length}" aria-valuenow="${path.done}"><i style="width:${percent}%"></i></span><b>${path.done}/${path.members.length}</b></span>`}<span class="st-lesson__action">${unlocked ? 'Buksan ang lesson path' : pathBlocker(path, student.lessons) ? 'Naka-lock ang lesson path' : 'Tingnan ang iskedyul'}${icon(unlocked ? 'chevron' : 'lock')}</span>${unlocked ? "" : lockOverlay()}</button>${pathDownloadControls(path)}</li>`;
}

function moduleCard(module, search) {
  const unlocked = module.members.some(canOpen);
  const percent = Math.round(module.done / module.members.length * 100);
  const reason = sequenceBlocker(module.members[0], student.lessons);
  return `<li class="st-lesson-card st-module-card"><button type="button" class="st-lesson${unlocked ? '' : ' is-locked'}" data-student-module="${escapeHtml(module.id)}"><strong class="st-lesson__title">${highlight(module.title, search)}</strong><span class="st-lesson__desc">${module.members.length} aralin</span><span class="st-lesson__progress"><span class="st-bar" role="progressbar" aria-label="Mga araling natapos" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></span><b>${module.done}/${module.members.length}</b></span><span class="st-lesson__action">${unlocked ? 'Buksan ang module' : reason ? 'Tapusin muna: ' + escapeHtml(reason.title) : 'Naka-lock'}${icon(unlocked ? 'chevron' : 'lock')}</span>${unlocked ? '' : lockOverlay()}</button></li>`;
}
function lockOverlay() { return `<span class="st-sequence-lock" aria-hidden="true">${icon('lock')}</span>`; }
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
let homeSelection = { scope: null, path: null, module: null };

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
  const previous = pathBlocker(lesson, student.lessons);
  if (previous) return showDialog({ iconName: 'lock', tone: 'locked', title: 'Naka-lock ang lesson path', message: `Tapusin muna ang lahat ng kinakailangang aralin sa “${previous.title || 'Naunang lesson path'}” bago buksan ang lesson path na ito.` });
  const prerequisite = sequenceBlocker(lesson, student.lessons);
  if (prerequisite) return showDialog({ iconName: 'lock', tone: 'locked', title: 'Naka-lock', message: 'Tapusin muna: ' + prerequisite.title });
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
      title: student.profile.joinRequest?.status === "pending" ? "Hinihintay ang pag-apruba ng guro" : "Wala ka pang nasalihang klase.",
      text: student.profile.joinRequest?.status === "pending"
        ? `Naipadala ang kahilingan sa ${student.profile.joinRequest.className || "iyong klase"}. Mabubuksan ang mga aralin at chat kapag inaprubahan ka.`
        : student.profile.joinRequest?.status === "declined" ? "Hindi inaprubahan ang iyong kahilingan. Kausapin ang guro o gamitin muli ang tamang class code." : "Ipadala ang kahilingan gamit ang class code ng iyong guro.",
      action: `<a class="button primary" href="#/join">${icon("plus")}${student.profile.joinRequest?.status === "pending" ? "Tingnan ang kahilingan" : "Sumali sa klase"}</a>`,
    },
    "no-paths": { title: "Wala pang nakatalagang lesson path.", text: "Lalabas dito ang mga lesson path na itinalaga ng iyong guro." },
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
  const scope = JSON.stringify([student.uid, classId(), student.profile.progressSession]);
  if (scope !== downloadsScope) { downloads = new Map(); downloadsScope = scope; }
  if (!isInstalledPwa() && activeTab === "downloaded") activeTab = "all";
  if (homeSelection.scope !== scope) homeSelection = { scope, path: null, module: null };
  let activePathId = homeSelection.path;
  let activeModuleId = homeSelection.module;
  let active = true;
  onLeave(() => { active = false; homeSelection = { scope, path: activePathId, module: activeModuleId }; });
  content().innerHTML = `
    <section class="st-home">
      <header class="st-hero st-hero--home">
        <div class="st-home-welcome">

          <h1>Mga Aralin<span class="st-heading-dot">.</span></h1>

          <span class="st-home-class" id="home-class">${escapeHtml(student.profile.className || "")}</span>
        </div>
        <div class="st-home-art" aria-hidden="true"><span class="st-home-art__page"></span><img src="../img/logo.png" alt="" /></div>
        <button class="st-icon-button st-hub-tooltip" type="button" id="home-refresh" aria-label="I-refresh ang mga aralin" data-tooltip="I-refresh">${icon("refresh")}</button>
      </header>
      <section class="st-home-tools" aria-label="Hanapin at salain ang mga aralin">
      <div class="st-library-heading"><h2>Aking mga lesson path</h2><span>Sundin ang pagkakasunod-sunod ng iyong mga lesson path</span></div>
      <label class="st-search">
        ${icon("search")}
        <input id="home-search" type="search" placeholder="Hanapin ang lesson path" autocomplete="off" aria-label="Hanapin ang lesson path" />
      </label>
      <div class="st-tabs" id="home-tabs" role="tablist" aria-label="Salain ang mga aralin" hidden></div>
      <div class="st-status-filters" id="home-status" role="group" aria-label="Salain ayon sa progreso" hidden></div>
      </section>
      ${isInstalledPwa() ? `<div class="st-download-all"><button class="button secondary" type="button" id="home-download-all" disabled>${icon("download")}<span>I-download lahat</span></button><button class="st-icon-button" type="button" id="home-cancel-download-all" aria-label="Itigil ang pag-download" title="Itigil ang pag-download" hidden>${icon("close")}</button><span id="home-download-all-status" role="status"></span></div>` : ""}
      <div id="home-path-heading" class="st-home-path-heading" hidden><button class="button secondary" type="button" id="home-back-path">Bumalik sa mga lesson path</button><h2 id="home-path-title"></h2></div>
      <div id="home-list" aria-live="polite">
        ${skeleton('student-lessons', { label: 'Inihahanda ang mga aralin...', tag: 'div' })}
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
    downloadAll.hidden = !classId() || !student.lessons.some(lesson => lesson.learningPathAssignmentId);
    downloadAll.disabled = !navigator.onLine || bulkDownloading || downloading.size > 0 || removingDownloads.size > 0 ||
      !student.lessons.some((lesson) => lesson.learningPathAssignmentId && (!activePathId || lesson.learningPathAssignmentId === activePathId) && canOpen(lesson) && !downloads.has(lesson.id));
    downloadAll.querySelector("span").textContent = bulkDownloading ? "Dina-download…" : "I-download lahat";
    bulkStatus.textContent = bulkLabel;
    cancelDownloadAll.hidden = !bulkDownloading;
    cancelDownloadAll.disabled = bulkController?.signal.aborted === true;
  };

  const pathLessons = () => student.lessons.filter(lesson => lesson.learningPathAssignmentId === activePathId);
  const modules = () => pathModules(pathLessons()).map(module => {
    const done = module.members.filter(isComplete).length, finished = done === module.members.length;
    return { ...module.members[0], ...module, done, started: module.members.some(item => statusOf(item).key === 'progress'),
      practice: module.members.every(item => item.practice), lectureFinished: finished, gameFinished: finished,
      activityFinished: finished, pronunciationFinished: finished, quizFinished: finished,
      gameSkipped: false, activitySkipped: false, pronunciationSkipped: false, quizSkipped: false };
  });
  const viewItems = () => !activePathId ? assignedStudentPaths() : !activeModuleId ? modules() : lessonSequence(pathLessons().filter(lesson => (lesson.moduleId || '__lessons') === activeModuleId));
  const inTab = lesson => activeTab === 'downloaded' && lesson.members ? lesson.members.some(item => downloads.has(item.id)) : matchesLessonTab(lesson, activeTab);
  const matchingLessons = () => {
    const query = search.value.trim().toLowerCase();
    return viewItems().filter((lesson) => inTab(lesson) && inStatus(lesson, activeStatus) &&
      (!query || lesson.title.toLowerCase().includes(query)));
  };

  /** Counts follow the tab chosen above, so they match the list. */
  const drawStatuses = () => {
    const tabLessons = viewItems().filter(inTab);
    statuses.innerHTML = STATUSES.map(({ key, label }) => {
      const count = tabLessons.filter((lesson) => inStatus(lesson, key)).length;
      return `
        <button class="st-status-filter st-status-filter--${key}${key === activeStatus ? " is-active" : ""}" type="button" data-status="${key}" aria-pressed="${key === activeStatus}">
          ${label}<span class="st-tab__count">${count}</span>
        </button>`;
    }).join("");
  };

  const drawTabs = () => {
    const items = viewItems();
    const closed = items.filter((lesson) => tabOf(lesson) === "closed").length;
    const count = { all: items.length, open: items.length - closed, closed,
      downloaded: items.filter(lesson => lesson.members ? lesson.members.some(item => downloads.has(item.id)) : downloads.has(lesson.id)).length };
    tabs.innerHTML = availableTabs().map(
      ({ key, label }) => `
        <button class="st-tab${key === activeTab ? " is-active" : ""}" type="button" role="tab" data-tab="${key}" aria-selected="${key === activeTab}">
          ${label}<span class="st-tab__count">${count[key]}</span>
        </button>`,
    ).join("");
  };

  const draw = () => {
    if (!active) return;
    updateBulkButton();
    if (activePathId && !pathLessons().length) { activePathId = null; activeModuleId = null; }
    if (activeModuleId && !modules().some(module => module.id === activeModuleId)) activeModuleId = null;
    $('#home-path-heading').hidden = !activePathId;
    $('.st-library-heading h2').textContent = activePathId ? 'Mga aralin sa lesson path' : 'Aking mga lesson path';
    $('.st-library-heading > span').textContent = activePathId ? 'Piliin ang araling ipagpapatuloy' : 'Sundin ang pagkakasunod-sunod ng iyong mga lesson path';
    $('#home-path-title').textContent = activeModuleId ? modules().find(item => item.id === activeModuleId)?.title || 'Mga aralin' : activePathId ? pathLessons()[0]?.learningPathTitle || 'Lesson path' : '';
    $('#home-back-path').textContent = activeModuleId ? 'Bumalik sa mga module' : 'Bumalik sa mga lesson path';
    $('.st-library-heading h2').textContent = activeModuleId ? 'Mga aralin' : activePathId ? 'Mga module' : 'Aking mga lesson path';
    $('.st-library-heading > span').textContent = activeModuleId ? 'Tapusin ang aralin upang buksan ang susunod.' : activePathId ? 'Tapusin ang module upang buksan ang susunod.' : 'Sundin ang pagkakasunod-sunod ng iyong mga lesson path';
    search.placeholder = activeModuleId ? 'Hanapin ang aralin' : activePathId ? 'Hanapin ang module' : 'Hanapin ang lesson path';
    search.setAttribute('aria-label', search.placeholder);
    const query = search.value.trim();
    tabs.hidden = !classId() || !viewItems().length;
    statuses.hidden = tabs.hidden;
    if (!classId()) {
      list.innerHTML = emptyState("no-class");
      return;
    }
    if (!viewItems().length) {
      list.innerHTML = emptyState("no-paths");
      return;
    }
    drawTabs();
    drawStatuses();
    const shown = matchingLessons();
    list.innerHTML = shown.length
      ? `<ul class="st-lessons">${shown.map(lesson => activeModuleId ? lessonCard(lesson, query) : activePathId ? moduleCard(lesson, query) : studentPathCard(lesson, query)).join("")}</ul>`
      : query
        ? emptyState("no-results", query)
        : emptyState(`no-${activeStatus === "all" ? activeTab : activeStatus}`);
  };
  const refreshDownloads = () => {
    if (!active) return;
    if (!activeModuleId) { draw(); return; }
    updateBulkButton();
    const downloadedCount = tabs.querySelector('[data-tab="downloaded"] .st-tab__count');
    if (downloadedCount) downloadedCount.textContent = viewItems().filter((lesson) => downloads.has(lesson.id)).length;
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

  const load = async ({ preserveCards = false, force = false } = {}) => {
    const previousLessons = JSON.stringify(student.lessons);
    // The class may have changed elsewhere (e.g. the teacher approved leaving).
    if (force) await loadProfile();
    if (!active) return;
    const uid = student.uid;
    const cid = classId();
    const sameScope = () => active && student.uid === uid && classId() === cid;
    $("#home-class").textContent = student.profile.className || "";
    search.closest(".st-search").hidden = !cid;
    await loadClassLessons({ force });
    if (!sameScope()) return;
    if (!preserveCards) draw();
    try {
      const saved = await listDownloads(uid, cid);
      // Update only the latest record's metadata; downloaded content stays device-owned.
      if (navigator.onLine) for (const item of saved) {
        if (!sameScope()) return;
        const current = student.lessons.find((lesson) => lesson.id === item.meta.id);
        if (!current) await removeDownload(uid, cid, item.meta.id);
        else await updateDownloadMetadata(uid, cid, current);
      }
      const latest = await listDownloads(uid, cid);
      if (!sameScope()) return;
      downloads = new Map(latest.map((item) => [item.meta.id, item]));
    } catch (error) {
      if (!sameScope()) return;
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
    const target = student.lessons.find(lesson => ids.includes(lesson.id));
    if (target?.learningPathAssignmentId && canOpen(target)) { activePathId = target.learningPathAssignmentId; activeModuleId = target.moduleId || '__lessons'; draw(); }
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

  $('#home-back-path').addEventListener('click', () => { if (activeModuleId) activeModuleId = null; else activePathId = null; search.value = ''; activeTab = 'all'; activeStatus = 'all'; draw(); $('#home-search').focus(); });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-student-path]'); if (!button) return;
    const path = assignedStudentPaths().find(item => item.id === button.dataset.studentPath); if (!path) return;
    if (!path.members.some(canOpen)) return showLocked(path);
    activePathId = path.id; search.value = ''; activeTab = 'all'; activeStatus = 'all'; draw(); $('#home-back-path').focus();
  });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-student-module]'); if (!button) return;
    const module = modules().find(item => item.id === button.dataset.studentModule); if (!module) return;
    const first = module.members[0];
    if (!module.members.some(canOpen)) return showLocked(first);
    activeModuleId = module.id; search.value = ''; activeTab = 'all'; activeStatus = 'all'; draw(); $('#home-back-path').focus();
  });
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
        if (!await confirmAction({ title: 'Alisin ang na-download na aralin?', message: 'Kailangan mo ng internet para i-download muli ang araling ito. Mananatili ang iyong mga resulta.', confirm: 'Alisin', danger: true, student: true })) return;
        if (!active) return;
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

  const downloadPath = async (targetPathId = activePathId) => {
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
      const queue = student.lessons.filter((lesson) => lesson.learningPathAssignmentId && (!targetPathId || lesson.learningPathAssignmentId === targetPathId) && canOpen(lesson) && !downloads.has(lesson.id));
      const result = await downloadLessons(queue, {
        signal: controller.signal,
        shouldContinue: () => active && navigator.onLine && student.uid === uid && classId() === cid,
        isEligible: (lesson) => canOpen(lesson) && !downloads.has(lesson.id),
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
  };

  downloadAll?.addEventListener("click", () => downloadPath());
  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-download-path], [data-remove-path-download]');
    if (!button || button.disabled || !isInstalledPwa() || bulkDownloading || downloading.size || removingDownloads.size) return;
    const id = button.dataset.downloadPath || button.dataset.removePathDownload;
    if (button.hasAttribute('data-download-path')) { await downloadPath(id); return; }
    const uid = student.uid, cid = classId();
    if (!await confirmAction({ title: 'Alisin ang download ng lesson path?', message: 'Kailangan mo ng internet para i-download muli ang mga aralin. Mananatili ang iyong mga resulta.', confirm: 'Alisin', danger: true, student: true })) return;
    if (!active || student.uid !== uid || classId() !== cid || bulkDownloading || downloading.size || removingDownloads.size) return;
    const queue = student.lessons.filter(lesson => lesson.learningPathAssignmentId === id && downloads.has(lesson.id));
    queue.forEach(lesson => removingDownloads.add(lesson.id));
    refreshDownloads();
    try {
      for (const lesson of queue) {
        if (!active || student.uid !== uid || classId() !== cid) break;
        await removeLessonDownload(lesson.id);
      }
    } catch (error) { if (active) toast(error.message || 'Hindi naalis ang download. Subukan muli.'); }
    finally {
      queue.forEach(lesson => removingDownloads.delete(lesson.id));
      if (student.uid === uid && classId() === cid) downloads = new Map((await downloadedLessons()).map(item => [item.meta.id, item]));
      window.dispatchEvent(new Event('basaya-download-state'));
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
      await load({ force: true });
    } finally {
      refresh.classList.remove("is-spinning");
      refresh.disabled = false;
    }
  });

  if (student.lessons.length || !classId()) draw();
  try { await load(); }
  catch (error) {
    if (!active) return;
    if (!student.lessons.length) throw error;
    toast("Hindi ma-refresh ang mga aralin. Ipinapakita ang huling na-load.");
  }
}
