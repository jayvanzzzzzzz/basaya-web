import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state } from "../../js/state.js";
import { $, escapeHtml, toast, notify, navigate, page, headerMenu, openModal as openBaseModal } from "../../js/helpers.js";
import { clearFieldError, fieldError } from "../../js/field-errors.js";
import { removeClassLesson } from "../../js/api.js";
import {
  formatWhen,
  fromInputValue,
  linkLessonId,
  linkMode,
  notifyDeadline,
  notifyStudents,
  readSchedule,
  scheduleStatus,
  toInputValue,
} from "../../js/schedule.js";
import { openClassModal } from "./dashboard.js";
import { hasUnreadChat, onChatSummaries } from "./messages.js";
import { paginate } from "../../js/pagination.js";
import { watchStudentRequestsBadge } from "./studentRequestsBadge.js";
import { addLessonAction, reviewReadingsAction, watchTeacherTooltips } from './classActions.js';
import {
  confirmCancelRequest,
  deletionBanner,
  openRequestDeletionModal,
  wireDeletionBanner,
} from "./classDeletion.js";

const SCHEDULE_LABELS = { scheduled: "Not open yet", open: "Open", closed: "Closed" };

// One rounded, lightly duotone icon vocabulary for classroom controls.
const classIcon = body => `<svg class="class-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const CLASS_ICONS = {
  report: '<path class="class-icon-tint" d="M5 3.5h10l4 4V21H5z"/><path d="M14 3.5V8h5M8.5 17v-3m3.5 3v-6m3.5 6v-4"/>',
  chat: '<path class="class-icon-tint" d="M4 4.5h16v12H9l-5 4z"/><path d="M4 13V7a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 7v7a2.5 2.5 0 0 1-2.5 2.5H9l-5 4v-4M8 9h8m-8 4h5"/>',
  students: '<circle class="class-icon-tint" cx="9" cy="8" r="3.5"/><circle cx="9" cy="8" r="3.5"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3.3 3.3 0 0 1 0 6.5M18 14a5 5 0 0 1 3 4.6V20"/>',
  add: '<path class="class-icon-tint" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H15v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M15 10V3H6.5A2.5 2.5 0 0 0 4 5.5V19a2 2 0 0 0 2 2h6M7.5 7h4M18 13v8m-4-4h8"/>',
  edit: '<path class="class-icon-tint" d="m14 4 6 6-10 10H4v-6z"/><path d="m12 6 6 6M4 14l10-10a2.8 2.8 0 0 1 4 0l2 2a2.8 2.8 0 0 1 0 4L10 20H4z"/>',
  delete: '<path class="class-icon-tint" d="m6 7 1 14h10l1-14z"/><path d="M4 7h16M9 7V3h6v4M6 7l1 14h10l1-14m-8 4v6m4-6v6"/>',
  copy: '<rect class="class-icon-tint" x="8" y="8" width="12" height="13" rx="2.5"/><rect x="8" y="8" width="12" height="13" rx="2.5"/><path d="M15 5V3H4v13h1"/>',
  readings: '<path class="class-icon-tint" d="M3 11h4v7H3zm14 0h4v7h-4z"/><path d="M4 11a8 8 0 0 1 16 0M3 11h4v7H3zm14 0h4v7h-4zM20 18a3 3 0 0 1-3 3h-4M10 8v7m3-9v11"/>',
  review: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
};

function refineClassControls() {
  const controls = [
    ['#class-report', 'Class report', 'report'], ['#class-chat', 'Class chat', 'chat'],
    ['#view-students', 'Students', 'students'], ['#add-lesson', 'Add lesson', 'add'],
    ['#add-lesson-inline', 'Add lesson', 'add'], ['#add-lesson-empty', 'Choose a lesson', 'add'],
    ['#edit-class', 'Edit class', 'edit'],
    ['#class-deletion', $('#class-deletion').textContent.trim(), 'delete'],
    ['.teacher-class-actions a', 'Review readings', 'readings'],
    ['.class-grading-notice a', 'Review readings', 'readings'],
  ];
  controls.forEach(([selector, label, icon]) => {
    const control = $(selector);
    if (!control) return;
    const badges = [...control.querySelectorAll('[data-class-chat-badge], [data-student-requests-dot], [data-reading-notice-dot], [data-grading-count]')];
    control.innerHTML = CLASS_ICONS[icon] ? classIcon(CLASS_ICONS[icon]) : '';
    control.append(...badges);
    control.classList.add('class-icon-control');
    control.setAttribute('aria-label', label);
    control.dataset.teacherTooltip = '';
    control.dataset.floatingTooltip = label;
  });
  const code = $('.class-overview__code');
  code.querySelector('.code-stub__hint').classList.add('sr-only');
  code.insertAdjacentHTML('beforeend', classIcon(CLASS_ICONS.copy));
  // The sticky header proxy is created before these controls are decorated.
  const proxy = $('.page-header-bar__action');
  if (proxy) {
    proxy.innerHTML = classIcon(CLASS_ICONS.add);
    proxy.classList.add('class-icon-control');
    proxy.setAttribute('aria-label', 'Add lesson');
    proxy.dataset.teacherTooltip = ''; proxy.dataset.floatingTooltip = 'Add lesson';
  }
}

// Keep dialog keyboard behavior local to classroom dialogs.
function openModal(html, mount) {
  const previous = document.activeElement;
  openBaseModal(html, (backdrop, baseClose) => {
    const dialog = backdrop.querySelector('[role="dialog"]');
    const heading = dialog.querySelector('h2');
    if (heading) { heading.id ||= 'class-dialog-title'; dialog.setAttribute('aria-labelledby', heading.id); }
    const close = () => { baseClose(); if (previous?.isConnected) previous.focus(); };
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    backdrop.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    mount?.(backdrop, close);
    (dialog.querySelector('input:not([type="hidden"]), select, textarea, [data-cancel]') || backdrop.querySelector('.modal-close')).focus();
  });
}

function scheduleMarkup(link) {
  const status = scheduleStatus(link);
  const parts = [
    // Older links have no mode: they are Assessments.
    link.mode === "practice"
      ? `<span class="mode-chip mode-chip--practice" title="Students can retry anytime. Scores aren't saved or reported.">Practice</span>`
      : `<span class="mode-chip">Assessment</span>`,
    `<span class="schedule-chip schedule-chip--${status}">${SCHEDULE_LABELS[status]}</span>`,
  ];
  if (link.openAt) parts.push(`<span>Opens ${escapeHtml(formatWhen(link.openAt))}</span>`);
  if (link.dueAt) parts.push(`<span>Due ${escapeHtml(formatWhen(link.dueAt))}</span>`);
  if (!link.openAt && !link.dueAt) parts.push("<span>No schedule</span>");
  return `<div class="class-lesson__schedule">${parts.join("")}</div>`;
}

// Lesson tabs. "Not open yet" lessons count as Open; only past-deadline ones are Closed.
const LESSON_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
];
/** Tab picked per class, so it survives re-renders (e.g. after editing a schedule). */
const lessonTabByClass = new Map();

const millisOf = (timestamp) => timestamp?.toMillis?.() ?? null;

/** List order: open lessons by nearest deadline, then open ones with no deadline, then not-open-yet (soonest to open first), then closed (most recently closed first). */
function compareBySchedule(a, b) {
  const rank = { open: 0, scheduled: 1, closed: 2 };
  const statusA = scheduleStatus(a.link);
  const statusB = scheduleStatus(b.link);
  if (statusA !== statusB) return rank[statusA] - rank[statusB];
  const dueA = millisOf(a.link.dueAt);
  const dueB = millisOf(b.link.dueAt);
  if (statusA === "closed") return dueB - dueA || a.number - b.number;
  if (statusA === "scheduled")
    return millisOf(a.link.openAt) - millisOf(b.link.openAt) || a.number - b.number;
  if (dueA == null || dueB == null) return (dueA == null) - (dueB == null) || a.number - b.number;
  return dueA - dueB || a.number - b.number;
}

function openScheduleModal(classId, link, lesson, onSaved) {
  openModal(
    `<h2>Lesson schedule</h2>
     <p>${escapeHtml(lesson.title)}</p>
     <form id="schedule-form">
       <div class="form-grid">
         <label>Opens on <input type="datetime-local" name="openAt" value="${toInputValue(link.openAt)}" /></label>
         <label>Due on <input type="datetime-local" name="dueAt" value="${toInputValue(link.dueAt)}" /></label>
       </div>
       <p class="lesson-schedule__hint">Leave a date empty to remove it. Students can't open the lesson before it opens, and it locks after the deadline.</p>
       <div class="modal-actions">
         <button class="button secondary" type="button" id="schedule-cancel">Cancel</button>
         <button class="button primary" type="submit">Save schedule</button>
       </div>
     </form>`,
    (backdrop, close) => {
      backdrop.querySelector("#schedule-cancel").addEventListener("click", close);
      backdrop.querySelector("#schedule-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        // An already-closed lesson may keep its past deadline.
        const schedule = readSchedule(e.currentTarget, { allowPastDeadline: true });
        if (schedule.error) return toast(schedule.error);
        try {
          await saveSchedule(classId, link, schedule);
          toast("Schedule saved.");
          close();
          onSaved();
        } catch (err) {
          toast(err.message);
        }
      });
    },
  );
}

const DAY = 24 * 60 * 60 * 1000;
const EXTEND_PRESETS = [
  { days: 1, label: "+1 day" },
  { days: 3, label: "+3 days" },
  { days: 7, label: "+1 week" },
];

function openExtendModal(classId, link, lesson, onSaved) {
  const currentDue = link.dueAt.toDate();
  // Presets count from the current deadline, or from now once it has passed, so the new deadline is always in the future.
  const base = () => Math.max(currentDue.getTime(), Date.now());
  const closed = currentDue.getTime() < Date.now();
  openModal(
    `<h2>Extend deadline</h2>
     <p>${escapeHtml(lesson.title)}</p>
     <form id="extend-form">
       <p class="extend-deadline__current">Current deadline: <strong>${escapeHtml(formatWhen(link.dueAt))}</strong>${
         closed ? ' <span class="schedule-chip schedule-chip--closed">Closed</span>' : ""
       }</p>
       <div class="extend-deadline__presets" role="group" aria-label="Extend by">
         ${EXTEND_PRESETS.map(
           (preset) =>
             `<button class="button secondary small" type="button" data-extend-days="${preset.days}">${preset.label}</button>`,
         ).join("")}
       </div>
       <label>New deadline <input type="datetime-local" name="dueAt" required data-missing="Pick the date and time of the new deadline, or press one of the buttons above." /></label>
       <label class="extend-deadline__notify">
         <input type="checkbox" name="notify" checked />
         <span>Notify students</span>
       </label>
       <p class="lesson-schedule__hint">${
         closed
           ? "The lesson reopens for students who haven't finished it until the new deadline."
           : "Students who haven't finished get more time. Reminders move to the new deadline."
       }</p>
       <div class="modal-actions">
         <button class="button secondary" type="button" id="extend-cancel">Cancel</button>
         <button class="button primary" type="submit">Extend deadline</button>
       </div>
     </form>`,
    (backdrop, close) => {
      const form = backdrop.querySelector("#extend-form");
      const input = form.elements.dueAt;
      const pick = (days) => {
        input.value = toInputValue({ toDate: () => new Date(base() + days * DAY) });
        clearFieldError(input);
        backdrop.querySelectorAll("[data-extend-days]").forEach((b) =>
          b.classList.toggle("is-active", Number(b.dataset.extendDays) === days),
        );
      };
      pick(EXTEND_PRESETS[0].days);
      backdrop.querySelectorAll("[data-extend-days]").forEach((b) =>
        b.addEventListener("click", () => pick(Number(b.dataset.extendDays))),
      );
      input.addEventListener("input", () =>
        backdrop.querySelectorAll("[data-extend-days]").forEach((b) => b.classList.remove("is-active")),
      );
      backdrop.querySelector("#extend-cancel").addEventListener("click", close);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const due = fromInputValue(input.value);
        const problem = !due
          ? input.dataset.missing
          : due <= currentDue
            ? "The new deadline must be later than the current one."
            : due <= new Date()
              ? "That time has already passed. Pick a later date."
              : "";
        if (fieldError(input, problem)) return input.focus();
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
          await saveSchedule(classId, link, { openAt: link.openAt ?? null, dueAt: Timestamp.fromDate(due) });
        } catch (err) {
          submit.disabled = false;
          return toast(err.message);
        }
        close();
        if (form.elements.notify.checked) {
          try {
            // An older Assessment link was just moved to the lesson id (saveSchedule).
            await notifyDeadline(classId, linkMode(link) === "practice" ? link.id : linkLessonId(link));
            toast("Deadline extended. Students were notified.");
          } catch (err) {
            toast(`Deadline extended, but students were not notified (${err.message}).`);
          }
        } else {
          toast("Deadline extended.");
        }
        onSaved();
      });
    },
  );
}

async function saveSchedule(classId, link, { openAt, dueAt }) {
  const lessonId = linkLessonId(link);
  // A Practice link keeps its own id ("{lessonId}__practice"); students save nothing on it.
  if (link.id === lessonId || linkMode(link) === "practice") {
    return updateDoc(doc(db, "classes", classId, "classLessons", link.id), { openAt, dueAt });
  }
  // Older links have auto-generated ids. Move them to the lesson id so the Firestore rules can find the schedule.
  const { id, ...data } = link;
  const batch = writeBatch(db);
  batch.set(doc(db, "classes", classId, "classLessons", lessonId), {
    ...data,
    lessonId,
    openAt,
    dueAt,
  });
  batch.delete(doc(db, "classes", classId, "classLessons", id));
  return batch.commit();
}

const progressPercent = (percent) => {
  const value = Number(percent);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
};

export async function renderClass(classId) {
  const classDoc = await getDoc(doc(db, "classes", classId));
  if (!classDoc.exists() || classDoc.data().teacherId !== state.user.uid)
    return navigate("/dashboard");
  const classroom = { id: classDoc.id, ...classDoc.data() };
  const runRead = async (label, promise) => {
    try {
      return await promise;
    } catch (err) {
      console.error(
        `renderClass: "${label}" read failed —`,
        err.code || err.message,
      );
      throw err;
    }
  };
  const [studentsSnap, linksSnap, progressSnap] = await Promise.all([
    runRead(
      "students",
      getDocs(collection(db, "classes", classId, "students")),
    ),
    runRead(
      "classLessons",
      getDocs(collection(db, "classes", classId, "classLessons")),
    ),
    runRead(
      "progress",
      getDocs(
        query(
          collection(db, "progress"),
          where("teacherId", "==", state.user.uid),
        ),
      ),
    ),
  ]);
  const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const leaveCount = students.filter((student) => student.leaveRequest).length;
  const links = linksSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const progress = progressSnap.docs
    .map((d) => d.data())
    .filter((item) => item.classId === classId);
  const average = progress.length
    ? Math.round(
        progress.reduce((sum, item) => sum + progressPercent(item.percent), 0) /
          progress.length,
      )
    : 0;
  const linkedLessons = links
    .map((link) => ({
      link,
      lesson: state.allLessons.find((l) => l.id === link.lessonId),
    }))
    .filter((x) => x.lesson)
    // "Lesson N" keeps the order the lessons were assigned in.
    .map((item, index) => ({ ...item, number: index + 1 }))
    .sort(compareBySchedule);
  const tabCount = {
    all: linkedLessons.length,
    closed: linkedLessons.filter(({ link }) => scheduleStatus(link) === "closed").length,
  };
  tabCount.open = tabCount.all - tabCount.closed;
  const activeTab = lessonTabByClass.get(classId) || "all";
  const subtitle = classroom.description || "";
  page(
    classroom.className,
    subtitle,
    `<button class="button secondary class-report-button" id="class-report" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m4 7H3" /></svg>Class Report</button><button class="button secondary class-chat-button" id="class-chat" type="button"><span class="class-chat-button__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" /></svg></span>Class chat<span class="class-chat-button__badge" data-class-chat-badge hidden><span class="sr-only">New messages</span></span></button><button class="button secondary class-students-button" id="view-students" type="button">Students<span class="class-students-button__dot" data-student-requests-dot aria-hidden="true" ${leaveCount ? "" : "hidden"}></span></button>${headerMenu(
      "More class options",
      `<button type="button" id="edit-class">Edit class</button><button type="button" class="danger" id="class-deletion">${classroom.deletionRequest ? "Cancel deletion request" : "Request deletion"}</button>`,
    )}${addLessonAction('add-lesson')}`,
    { crumbs: [{ label: "Classrooms", href: "#/dashboard" }] },
  );
  $("#page-header").classList.add("teacher-class-header");
  $("#page-header .page-header__top").insertAdjacentHTML("beforeend", '<span class="class-workspace-label">Class workspace</span>');
  $("#page-content").classList.add("teacher-class-page");
  $("#page-content").innerHTML = `
    ${deletionBanner(classroom)}
    <section class="class-grading-notice" data-grading-notice aria-label="Readings awaiting grading" hidden>
      <div class="class-grading-notice__copy" role="status" aria-live="polite" aria-atomic="true">
        <span class="class-grading-notice__label">Reading review</span>
        <div class="class-grading-notice__headline">
          <h2 data-grading-total></h2>
          <a class="button primary" href="#/classes/${encodeURIComponent(classId)}/readings">Review readings<span class="class-grading-notice__count" data-grading-count aria-hidden="true" hidden></span></a>
        </div>
        <p class="class-grading-notice__deadline" data-grading-deadline hidden></p>
        <p class="class-grading-notice__error" data-grading-error hidden>Reading counts could not be updated. Open Review readings to check.</p>
      </div>
    </section>
    <section class="class-overview" aria-label="Class overview">
      <div class="class-overview__identity">
        <div><span class="class-overview__eyebrow">Your classroom</span><p class="class-overview__details">${escapeHtml([classroom.gradeLevel ? `Grade ${classroom.gradeLevel}` : '', classroom.section ? `Section ${classroom.section}` : ''].filter(Boolean).join(' · ') || 'A shared space for learning')}</p></div>
        <button type="button" class="class-overview__code code-stub code-stub--on-canvas" aria-label="Copy class code" data-floating-tooltip="Copy class code" data-teacher-tooltip ${classroom.classCode ? '' : 'disabled'}>
          <span class="code-stub__label">Class code</span>
          <code>${escapeHtml(classroom.classCode || "—")}</code>
          <span class="code-stub__hint">Copy</span>
        </button>
      </div>
      <div class="grid stats class-overview__stats" aria-label="Class statistics">
        <div class="card stat class-overview__stat">
          <span class="class-overview__stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19v-1.2a5.5 5.5 0 0 1 11 0V19M16 5.3a3.2 3.2 0 0 1 0 6.1m1.2 2.2a4.7 4.7 0 0 1 3.3 4.5V19"/></svg></span>
          <b>${students.length}</b><span>Students enrolled</span>
        </div>
        <div class="card stat class-overview__stat">
          <span class="class-overview__stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M5 4.5v17M9 6h7m-7 4h7"/></svg></span>
          <b>${linkedLessons.length}</b><span>Lessons assigned</span>
        </div>
        <div class="card stat class-overview__stat class-overview__stat--progress">
          <span class="class-overview__stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 18V9m5 9V5m5 13v-6m5 6V3"/></svg></span>
          <b>${average}%</b><span>Average progress</span>
          <span class="class-overview__progress-track" aria-hidden="true"><i style="width:${average}%"></i></span>
        </div>
      </div>
    </section>
    <section class="class-lessons" aria-labelledby="class-lessons-title">
      <div class="class-lessons__header">
        <div>
          <span class="class-lessons__eyebrow">Learning plan</span>
          <h2 id="class-lessons-title">Assigned lessons</h2>
          <p>Keep the class moving, one lesson at a time.</p>
        </div>
        <div class="teacher-class-actions">${reviewReadingsAction(classId)}${addLessonAction('add-lesson-inline')}</div>
      </div>
      ${
        linkedLessons.length
          ? `<div class="class-lesson-tabs" role="tablist" aria-label="Filter lessons">${LESSON_TABS.map(
              ({ key, label }) => `
                <button class="class-lesson-tab${key === activeTab ? " is-active" : ""}" type="button" role="tab" id="lesson-tab-${key}" aria-controls="class-lesson-panel" tabindex="${key === activeTab ? 0 : -1}" data-lesson-tab="${key}" aria-selected="${key === activeTab}">
                  ${label}<span class="class-lesson-tab__count">${tabCount[key]}</span>
                </button>`,
            ).join("")}</div>
            <div id="class-lesson-panel" role="tabpanel" aria-labelledby="lesson-tab-${activeTab}" tabindex="0" class="class-lessons__list">${linkedLessons
              .map(
                ({ link, lesson, number }) => `
                  <article class="class-lesson" data-tab="${scheduleStatus(link) === "closed" ? "closed" : "open"}">
                    <span class="class-lesson__number">${String(number).padStart(2, "0")}</span>
                    <div class="class-lesson__content">
                      <span class="class-lesson__label">Lesson ${number}</span>
                      <h3>${escapeHtml(lesson.title)}</h3>
                      <p>${escapeHtml(lesson.description || "No description provided.")}</p>
                      ${scheduleMarkup(link)}
                    </div>
                    <div class="class-lesson__actions">
                      ${
                        link.notifyPending
                          ? `<button class="class-lesson__action class-lesson__action--notify" type="button" data-notify="${escapeHtml(link.id)}" aria-label="Notify students about ${escapeHtml(lesson.title)}">
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0"/></svg>
                              <span>Notify students</span>
                            </button>`
                          : ""
                      }
                      ${
                        link.dueAt
                          ? `<button class="class-lesson__action" type="button" data-extend="${escapeHtml(link.id)}" aria-label="Extend the deadline of ${escapeHtml(lesson.title)}">
                              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2.5h6"/></svg>
                              <span>Extend</span>
                            </button>`
                          : ""
                      }
                      <button class="class-lesson__action" type="button" data-schedule="${escapeHtml(link.id)}" aria-label="Edit schedule of ${escapeHtml(lesson.title)}">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4m8-4v4"/></svg>
                        <span>Schedule</span>
                      </button>
                      <button class="class-lesson__remove" type="button" data-unlink="${escapeHtml(link.id)}" aria-label="Remove ${escapeHtml(lesson.title)} from class">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
                        <span>Remove</span>
                      </button>
                    </div>
                  </article>`,
              )
              .join("")}</div>
            <p class="class-lessons__none" hidden></p>`
          : `<div class="class-lessons__empty">
              <div class="class-lessons__empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M5 4.5v17M9 6h7m-7 4h7"/></svg></div>
              <h3>No lessons assigned yet</h3>
              <p>Add a lesson from your library to start building this class’s learning plan.</p>
              <button class="button primary" id="add-lesson-empty" type="button">Choose a lesson</button>
            </div>`
      }
    </section>
  `;
  refineClassControls();
  wireDeletionBanner(classroom, () => renderClass(classId));
  $("#class-report").addEventListener("click", () =>
    navigate(`/classes/${encodeURIComponent(classId)}/report`),
  );
  $("#class-chat").addEventListener("click", () => navigate(`/messages/${encodeURIComponent(classId)}`));
  // Red bubble on "Class chat" while the class has messages the teacher hasn't read.
  const showChatBadge = () => {
    const badge = $("[data-class-chat-badge]");
    if (badge) badge.hidden = !hasUnreadChat(classId);
  };
  showChatBadge();
  onChatSummaries(showChatBadge);
  watchStudentRequestsBadge(classId, leaveCount, links);
  // Reuse body-level tooltips, including actions near scrolling/viewport edges.
  document.querySelectorAll('.teacher-class-header .header-menu__toggle, .teacher-class-page .class-lesson__actions button, .sidebar .theme-toggle, .sidebar .account-menu__toggle, .sidebar .main-nav a').forEach(button => {
    button.dataset.teacherTooltip = '';
    button.dataset.floatingTooltip = button.getAttribute('aria-label') || button.querySelector('strong')?.textContent || button.textContent.trim();
    button.removeAttribute('title');
  });
  const classMenu = $('.teacher-class-header .header-menu__toggle');
  classMenu.addEventListener('click', () => {
    requestAnimationFrame(() => {
      if (classMenu.getAttribute('aria-expanded') === 'true') $('.header-menu__popup button')?.focus();
    });
  });
  $('.teacher-class-header .header-menu').addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      $('.teacher-class-header .header-menu__popup').hidden = true;
      classMenu.setAttribute('aria-expanded', 'false');
      classMenu.focus(); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...document.querySelectorAll('.teacher-class-header .header-menu__popup button')];
    if (classMenu.getAttribute('aria-expanded') !== 'true') return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement);
    items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  });
  watchTeacherTooltips();
  $("#edit-class").addEventListener("click", () => openClassModal(classroom));
  $("#class-deletion").addEventListener("click", () => {
    const refresh = () => renderClass(classId);
    if (classroom.deletionRequest) confirmCancelRequest(classroom, refresh);
    else openRequestDeletionModal(classroom, refresh);
  });
  $("#view-students").addEventListener("click", () =>
    navigate(`/classes/${encodeURIComponent(classId)}/students`),
  );
  const add = () =>
    navigate(`/classes/${encodeURIComponent(classId)}/add-lesson`);
  $("#add-lesson").addEventListener("click", add);
  $("#add-lesson-inline")?.addEventListener("click", add);
  $("#add-lesson-empty")?.addEventListener("click", add);
  if (linkedLessons.length) {
    const rows = () => [...document.querySelectorAll(".class-lessons__list > .class-lesson")];
    const none = $(".class-lessons__none");
    const showTab = (tab) => {
      rows().forEach((row) => (row.hidden = tab !== "all" && row.dataset.tab !== tab));
      document.querySelectorAll("[data-lesson-tab]").forEach((button) => {
        const active = button.dataset.lessonTab === tab;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      });
      $('#class-lesson-panel').setAttribute('aria-labelledby', `lesson-tab-${tab}`);
      none.hidden = tabCount[tab] > 0;
      none.textContent = tab === "closed" ? "No closed lessons." : "No open lessons.";
    };
    showTab(activeTab);
    const pager = paginate({ rows, after: $(".class-lessons__list"), label: ["lesson", "lessons"] });
    document.querySelectorAll("[data-lesson-tab]").forEach((button) =>
      button.addEventListener("click", () => {
        lessonTabByClass.set(classId, button.dataset.lessonTab);
        showTab(button.dataset.lessonTab);
        pager.reset();
      }),
    );
    $('.class-lesson-tabs').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll('[data-lesson-tab]')];
      const index = tabs.indexOf(document.activeElement);
      const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      next.click();
    });
  }
  const findLinked = (linkId) => linkedLessons.find(({ link }) => link.id === linkId);
  document.querySelectorAll("[data-unlink]").forEach((b) =>
    b.addEventListener("click", () => {
      const found = findLinked(b.dataset.unlink);
      if (found) openRemoveLessonModal(classroom, found.link, found.lesson, students.length);
    }),
  );
  document.querySelectorAll("[data-schedule]").forEach((b) =>
    b.addEventListener("click", () => {
      const found = findLinked(b.dataset.schedule);
      if (found)
        openScheduleModal(classId, found.link, found.lesson, () => renderClass(classId));
    }),
  );
  document.querySelectorAll("[data-extend]").forEach((b) =>
    b.addEventListener("click", () => {
      const found = findLinked(b.dataset.extend);
      if (found) openExtendModal(classId, found.link, found.lesson, () => renderClass(classId));
    }),
  );
  document.querySelectorAll("[data-notify]").forEach((b) =>
    b.addEventListener("click", async () => {
      const found = findLinked(b.dataset.notify);
      if (!found) return;
      b.disabled = true;
      try {
        await notifyStudents(classId, [found.link.id]);
        toast("Students were notified.");
        renderClass(classId);
      } catch (err) {
        b.disabled = false;
        toast(`Students were not notified (${err.message}).`);
      }
    }),
  );
}

function openRemoveLessonModal(classroom, link, lesson, studentCount) {
  // Practice saves no progress: removing it only takes that copy out (an Assessment of the same lesson stays, with its progress).
  const practice = linkMode(link) === "practice";
  if (practice) studentCount = 0;
  const students = `${studentCount} student${studentCount === 1 ? "" : "s"}`;
  openModal(
    `<div class="remove-lesson">
       <span class="remove-lesson__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16m-10 4v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></span>
       <h2>Remove “${escapeHtml(lesson.title)}”${practice ? " (Practice)" : ""}?</h2>
       <p>It will be taken out of <strong>${escapeHtml(classroom.className)}</strong>${studentCount ? `, and the progress of all ${students} on it will be deleted:` : "."}</p>
       ${
         studentCount
           ? `<ul class="remove-student__list">
                <li>Lecture, game, activity and quiz completion</li>
                <li>Scores and answers saved for this lesson</li>
              </ul>`
           : ""
       }
       <p class="muted">The lesson stays in your library. If you add it back, everyone starts fresh. This can't be undone.</p>
       <p class="form-error" id="remove-lesson-error" role="alert"></p>
       <div class="modal-actions">
         <button type="button" class="button secondary" data-cancel>Keep lesson</button>
         <button type="button" class="button danger" data-confirm-remove>Remove lesson</button>
       </div>
     </div>`,
    (modal, close) => {
      $("[data-cancel]", modal).addEventListener("click", close);
      const confirmButton = $("[data-confirm-remove]", modal);
      confirmButton.addEventListener("click", async () => {
        confirmButton.disabled = true;
        confirmButton.textContent = "Removing…";
        try {
          if (practice) await deleteDoc(doc(db, "classes", classroom.id, "classLessons", link.id));
          else await removeClassLesson(classroom.id, lesson.id);
          close();
          notify({
            tone: "danger",
            title: "Lesson removed",
            message: studentCount
              ? `“${lesson.title}” was taken out of ${classroom.className}. Progress was reset for ${students}.`
              : `“${lesson.title}” was taken out of ${classroom.className}.`,
          });
          await renderClass(classroom.id);
        } catch (error) {
          $("#remove-lesson-error", modal).textContent = `Couldn't remove the lesson: ${error.message}.`;
          confirmButton.disabled = false;
          confirmButton.textContent = "Remove lesson";
        }
      });
    },
  );
}

export function openStudentsModal(classroom, students, progress) {
  const body = students.length
    ? `<div class="list stagger-in">${students
        .map((s) => {
          const p = progress.find((x) => x.studentId === s.id) || {};
          const value = progressPercent(p.percent);
          return `<div class="student-row"><div class="student-info"><div class="student-avatar">${escapeHtml((s.displayName || s.name || "S").charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(s.displayName || s.name || "Student")}</strong><p>${escapeHtml(s.email || "")}</p></div></div><div class="progress"><small>${value}%</small><div class="progress-bar"><i style="width:${value}%"></i></div></div></div>`;
        })
        .join("")}</div>`
    : `<p class="muted">Students will appear here once they join with <code>${escapeHtml(classroom.classCode || "—")}</code>.</p>`;
  openModal(
    `<h2>Students</h2><p>${students.length} enrolled in ${escapeHtml(classroom.className)}.</p>${body}`,
  );
}
