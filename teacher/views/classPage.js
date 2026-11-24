import { captureRoute } from "../../js/route-lifecycle.js";
import { orderedPathAssignments } from '../../js/learningPathSequence.js';
import { confirmAction } from "../../js/action-confirmation.js";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state } from "../../js/state.js";
import { $, escapeHtml, toast, navigate, page, headerMenu, openModal as openBaseModal } from "../../js/helpers.js";
import { clearFieldError, fieldError } from "../../js/field-errors.js";
import { postToApi } from "../../js/api.js";
import {
  formatWhen,
  fromInputValue,
  notifyDeadline,
  notifyStudents,
  readSchedule,
  scheduleStatus,
  toInputValue,
  wireLessonSchedule,
  wirePathOpeningDates,
} from "../../js/schedule.js";
import { openClassModal } from "./dashboard.js";
import { hasUnreadChat, onChatSummaries } from "./messages.js";
import { watchStudentRequestsBadge } from "./studentRequestsBadge.js";
import { addLessonAction, reviewReadingsAction, watchTeacherTooltips } from './classActions.js';
import {
  confirmCancelRequest,
  deletionBanner,
  openRequestDeletionModal,
  wireDeletionBanner,
} from "./classDeletion.js";

import { deadlineAudienceMarkup, wireDeadlineAudience } from "./deadline-students.js";
import { loadClassContext,loadStudentProgress,completionOf } from "./progressData.js";
const SCHEDULE_LABELS = { scheduled: "Not open yet", open: "Open", closed: "Closed" };

// One rounded, lightly duotone icon vocabulary for classroom controls.
const classIcon = body => `<svg class="class-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const CLASS_ICONS = {
  extend: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2.5h6M19 3v5m-2.5-2.5h5"/>',
  schedule: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4m8-4v4m-8 7h3m-3 3h6"/>',
  archive: '<path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/>',
  notify: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0"/>',
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
    ['#view-students', 'Students', 'students'], ['#add-lesson', 'Add Lesson Path', 'add'],
    ['#add-lesson-inline', 'Add Lesson Path', 'add'], ['#add-lesson-empty', 'Add Lesson Path', 'add'],
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
    proxy.setAttribute('aria-label', 'Add Lesson Path');
    proxy.dataset.teacherTooltip = ''; proxy.dataset.floatingTooltip = 'Add Lesson Path';
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

async function openScheduleModal(classId, link, lesson, onSaved) {
  let previous = null, next = null, assignedPath = null;
  if (link.learningPathAssignmentId) {
    try {
      const [paths, links] = await Promise.all([getDocs(collection(db, 'classes', classId, 'learningPaths')), getDocs(collection(db, 'classes', classId, 'classLessons'))]);
      const ordered = orderedPathAssignments(paths.docs.map(item => ({ id: item.id, ...item.data() })), links.docs.map(item => ({ id: item.id, ...item.data() })));
      const index = ordered.findIndex(item => item.id === link.learningPathAssignmentId);
      assignedPath = ordered[index]; previous = ordered[index - 1]; next = ordered[index + 1];
    } catch (error) { toast(error.message); return; }
  }
  if (link.learningPathAssignmentId) lesson = { ...lesson, title: `${link.learningPathTitle || 'Learning path'} — schedule applies to every module and lesson` };
  openModal(
    `<h2>Lesson schedule</h2>
     <p>${escapeHtml(lesson.title)}</p>
     <form id="schedule-form" data-confirm-manually>
       <div class="form-grid">
         <label>Opens on <input type="datetime-local" name="openAt" value="${toInputValue(link.openAt)}" /></label>
         <label>Due on <input type="datetime-local" name="dueAt" value="${toInputValue(link.dueAt)}" /></label>
       </div>
       <p class="lesson-schedule__hint">Leave a date empty to remove it. New dates must be today or later, and the deadline must follow the opening date. A deadline on the opening day is set to 11:59 PM.</p>
       <div class="modal-actions">
         <button class="button secondary" type="button" id="schedule-cancel">Cancel</button>
         <button class="button primary" type="submit">Save schedule</button>
       </div>
     </form>`,
    (backdrop, close) => {
      const form = backdrop.querySelector("#schedule-form");
      wireLessonSchedule(form, { existingSchedule: link });
      const validateOpeningOrder = assignedPath ? wirePathOpeningDates([{ path: assignedPath, form }], { previous, next }) : () => null;
      backdrop.querySelector("#schedule-cancel").addEventListener("click", close);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const openingError = validateOpeningOrder();
        if (openingError) return toast(openingError);
        // Historical dates may be kept, but newly chosen past dates are rejected.
        const schedule = readSchedule(e.currentTarget, { existingSchedule: link });
        if (schedule.error) return toast(schedule.error);
        if (!await confirmAction({ title: link.learningPathAssignmentId ? 'Save learning path schedule?' : 'Save lesson schedule?', message: link.learningPathAssignmentId ? 'Apply this opening date and deadline to every lesson in this assigned learning path.' : 'Students will access this lesson according to the new opening and due dates.', confirm: 'Save schedule' })) return;
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
  let individualBase = 0;
  const base = () => Math.max(currentDue.getTime(), individualBase, Date.now());
  const closed = currentDue.getTime() < Date.now();
  openModal(
    `<h2>Extend deadline</h2>
     <p>${escapeHtml(lesson.title)}</p>
     <form id="extend-form" data-confirm-manually>
       ${link.learningPathAssignmentId ? '<p class="lesson-schedule__hint">Applies to every module and lesson in this path.</p>' : deadlineAudienceMarkup()}
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
         link.learningPathAssignmentId
           ? "Students get more time for this whole path. Its opening schedule and completion prerequisites still apply."
           : closed
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
      const audience = link.learningPathAssignmentId ? { selection: () => null } : wireDeadlineAudience(backdrop,classId,link,value=>{individualBase=value;const active=backdrop.querySelector("[data-extend-days].is-active");if(active)pick(Number(active.dataset.extendDays));});
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
          const studentIds = audience.selection();
          if(!await confirmAction({title:"Extend deadline?",message:studentIds ? `Extend this lesson for ${studentIds.length} selected active ${studentIds.length===1?"student":"students"}. Everyone else keeps their existing deadline.` : link.learningPathAssignmentId ? "Extend the deadline for every module and lesson in this path for the entire class." : "Extend this lesson's deadline for the entire class.",confirm:"Extend deadline"})) {submit.disabled=false;return;}
          if(!form.isConnected)return;
          submit.textContent="Extending…";
          form.setAttribute("aria-busy","true");
          form.dataset.selectedAudience = String(studentIds !== null);
          if(studentIds) await postToApi("lesson-deadlines",{action:"extend-students",classId,entryId:link.id,studentIds,dueAt:due.getTime()});
          else await saveSchedule(classId, link, { openAt: link.openAt ?? null, dueAt: Timestamp.fromDate(due) });
        } catch (err) {
          submit.disabled = false;
          submit.textContent="Extend deadline";
          form.setAttribute("aria-busy","false");
          return toast(err.message);
        }
        close();
        if (form.elements.notify.checked && form.dataset.selectedAudience !== "true") {
          try {
            // Keep legacy link ids; the API resolves their lesson identity.
            await notifyDeadline(classId, link.id);
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

async function saveSchedule(classId,link,{openAt,dueAt}) {
  if (link.learningPathAssignmentId) return postToApi('content-lifecycle', { action: 'schedule-learning-path', classId, assignmentId: link.learningPathAssignmentId, openAt: openAt?.toMillis?.() ?? null, dueAt: dueAt?.toMillis?.() ?? null });
  return postToApi("lesson-deadlines",{action:"schedule",classId,entryId:link.id,openAt:openAt?.toMillis?.()??null,dueAt:dueAt?.toMillis?.()??null});
}

const progressPercent = (percent) => {
  const value = Number(percent);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
};

export async function renderClass(classId) {
  const isCurrent = captureRoute(`/classes/${encodeURIComponent(classId)}`);
  if (!isCurrent()) return;
  const classDoc = await getDoc(doc(db, "classes", classId));
  if (!isCurrent()) return;
  if (!classDoc.exists() || classDoc.data().teacherId !== state.user.uid)
    return navigate("/dashboard");
  const classroom = { id: classDoc.id, ...classDoc.data() };
  if(classroom.archived===true) {
    page(classroom.className,"Archived class",'<button type="button" class="button primary" id="restore-class">Restore class</button>');
    $('#page-content').innerHTML=`<section class="card"><h2>This class is archived</h2><p>Students, lessons and saved progress are preserved. Participation is paused until the class is restored.</p><div class="modal-actions"><a class="button secondary" href="#/classes/${encodeURIComponent(classId)}/students">View roster</a><a class="button secondary" href="#/classes/${encodeURIComponent(classId)}/report">View saved report</a></div></section>`;
    $('#restore-class').onclick=()=>openRequestDeletionModal(classroom,()=>renderClass(classId));return;
  }
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
  const [studentsSnap, linksSnap, pathsSnap] = await Promise.all([
    runRead(
      "students",
      getDocs(collection(db, "classes", classId, "students")),
    ),
    runRead(
      "classLessons",
      getDocs(collection(db, "classes", classId, "classLessons")),
    ),
    runRead("learningPaths", getDocs(collection(db, "classes", classId, "learningPaths"))),
  ]);
  if (!isCurrent()) return;
  const allAssignedPaths = pathsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const assignedPaths = [...orderedPathAssignments(allAssignedPaths, linksSnap.docs.map(d => ({ id: d.id, ...d.data() }))), ...allAssignedPaths.filter(path => path.archived)];
  const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const leaveCount = students.filter((student) => student.leaveRequest).length;
  const links = linksSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const progressContext = await loadClassContext(classId);
  const progress = progressContext ? await Promise.all(progressContext.students.filter(student=>student.accountProfile.disabled!==true&&student.membershipStatus!=="dropped").map(student=>loadStudentProgress(student.id,progressContext.lessons,student.joinedAt,student))) : [];
  if(!isCurrent())return;
  const completions = progress.filter(item=>!item.error&&!item.inactive).map(completionOf).filter(item=>item.percent!==null);
  const average = completions.length ? Math.round(completions.reduce((sum,item)=>sum+item.percent,0)/completions.length) : null;
  const activePaths = assignedPaths.filter(path => !path.archived);
  const pathLink = path => ({ ...links.find(link => link.learningPathAssignmentId === path.id), learningPathAssignmentId: path.id, learningPathTitle: path.title, ...(Object.hasOwn(path, 'openAt') ? { openAt: path.openAt } : {}), ...(Object.hasOwn(path, 'dueAt') ? { dueAt: path.dueAt } : {}), mode: path.mode || 'assessment' });
  const subtitle = classroom.description || "";
  page(
    classroom.className,
    subtitle,
    `<button class="button secondary class-report-button" id="class-report" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m4 7H3" /></svg>Class Report</button><button class="button secondary class-chat-button" id="class-chat" type="button"><span class="class-chat-button__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" /></svg></span>Class chat<span class="class-chat-button__badge" data-class-chat-badge hidden><span class="sr-only">New messages</span></span></button><button class="button secondary class-students-button" id="view-students" type="button">Students<span class="class-students-button__dot" data-student-requests-dot aria-hidden="true" ${leaveCount ? "" : "hidden"}></span></button>${headerMenu(
      "More class options",
      `<button type="button" id="edit-class">Edit class</button><button type="button" class="danger" id="class-deletion">${classroom.archived ? "Restore class" : "Archive class"}</button>`,
    )}${addLessonAction('add-lesson')}`,
    { crumbs: [{ label: "Classrooms", href: "#/classes" }] },
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
          <b>${students.filter(student=>student.membershipStatus!=="dropped").length}</b><span>Students enrolled</span>
        </div>
        <div class="card stat class-overview__stat">
          <span class="class-overview__stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M5 4.5v17M9 6h7m-7 4h7"/></svg></span>
          <b>${activePaths.length}</b><span>Lesson paths assigned</span>
        </div>
        <div class="card stat class-overview__stat class-overview__stat--progress">
          <span class="class-overview__stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 18V9m5 9V5m5 13v-6m5 6V3"/></svg></span>
          <b>${average===null?"—":`${average}%`}</b><span>Active student progress</span>
          <span class="class-overview__progress-track" aria-hidden="true"><i style="width:${average??0}%"></i></span>
        </div>
      </div>
    </section>
    <section class="class-lessons" aria-labelledby="class-lessons-title">
      <div class="class-lessons__header">
        <div>
          <span class="class-lessons__eyebrow">Learning plan</span>
          <h2 id="class-lessons-title">Assigned lesson paths</h2>
          <p>Keep the class moving through each lesson path.</p>
        </div>
        <div class="teacher-class-actions">${reviewReadingsAction(classId)}${addLessonAction('add-lesson-inline')}</div>
      </div>
      <section class="class-paths" aria-label="Class lesson paths">
        <div class="class-path-list">${activePaths.map((path, index) => {
          const link = pathLink(path), pathLinks = links.filter(item => item.learningPathAssignmentId === path.id);
          const moduleCount = path.modules?.length || new Set(pathLinks.map(item => item.moduleId).filter(Boolean)).size;
          const count = path.lessonIds?.length || pathLinks.length;
          return `<article class="class-lesson class-path-card" data-class-path="${escapeHtml(path.id)}"><div class="class-lesson__content"><span class="lesson-picker__eyebrow">Lesson path ${index + 1}</span><h3>${escapeHtml(path.title || 'Lesson path')}</h3><p>${moduleCount} modules &middot; ${count} lessons</p>${scheduleMarkup(link)}</div><details class="class-path-menu"><summary aria-label="Actions for ${escapeHtml(path.title || 'lesson path')}" data-teacher-tooltip data-floating-tooltip="Lesson path actions">${classIcon('<path d="M4 6h16M4 12h16M4 18h16"/>')}</summary><div class="class-path-menu__popup"><button type="button" data-extend-path="${escapeHtml(path.id)}" ${!link.dueAt ? 'disabled title="Set a deadline using Edit schedule first"' : ''}>${classIcon(CLASS_ICONS.extend)}<span>Extend deadline</span></button><button type="button" data-schedule-path="${escapeHtml(path.id)}">${classIcon(CLASS_ICONS.schedule)}<span>Edit schedule</span></button>${pathLinks.some(item => item.notifyPending) ? `<button type="button" data-notify-path="${escapeHtml(path.id)}">${classIcon(CLASS_ICONS.notify)}<span>Notify students</span></button>` : ''}<button type="button" data-archive-path="${escapeHtml(path.id)}">${classIcon(CLASS_ICONS.archive)}<span>Archive lesson path</span></button></div></details></article>`;
        }).join('') || '<div class="class-lessons__empty"><h3>No lesson paths assigned yet</h3><p>Add a lesson path from your library to start the classroom learning plan.</p><button class="button primary" id="add-lesson-empty" type="button">Add Lesson Path</button></div>'}</div>
        <details class="class-path-archive"><summary>Archived lesson paths (${assignedPaths.filter(path => path.archived).length})</summary><p>Archived assignments keep their schedules and student progress.</p>
          ${assignedPaths.filter(path => path.archived).map(path => `<article class="class-lesson"><div class="class-lesson__content"><h3>${escapeHtml(path.title || 'Lesson path')}</h3><p>${(path.lessonIds || []).length} lessons</p></div><button type="button" class="button secondary small" data-restore-path="${escapeHtml(path.id)}">Restore lesson path</button></article>`).join('') || '<p>No archived lesson paths in this class.</p>'}
        </details>
      </section>
    </section>
  `;
  refineClassControls();
  wireDeletionBanner(classroom, () => renderClass(classId));
  $('#class-report').addEventListener('click', () => navigate(`/classes/${encodeURIComponent(classId)}/report`));
  $('#class-chat').addEventListener('click', () => navigate(`/messages/${encodeURIComponent(classId)}`));
  const showChatBadge = () => { const badge = $('[data-class-chat-badge]'); if (badge) badge.hidden = !hasUnreadChat(classId); };
  showChatBadge(); onChatSummaries(showChatBadge);
  watchStudentRequestsBadge(classId, leaveCount, links);
  document.querySelectorAll('.teacher-class-header .header-menu__toggle, .sidebar .theme-toggle, .sidebar .account-menu__toggle, .sidebar .main-nav a').forEach(button => {
    button.dataset.teacherTooltip = '';
    button.dataset.floatingTooltip = button.getAttribute('aria-label') || button.querySelector('strong')?.textContent || button.textContent.trim();
    button.removeAttribute('title');
  });
  const classMenu = $('.teacher-class-header .header-menu__toggle');
  classMenu.addEventListener('click', () => requestAnimationFrame(() => {
    if (classMenu.getAttribute('aria-expanded') === 'true') $('.header-menu__popup button')?.focus();
  }));
  $('.teacher-class-header .header-menu').addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); $('.header-menu__popup').hidden = true;
      classMenu.setAttribute('aria-expanded', 'false'); classMenu.focus(); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || classMenu.getAttribute('aria-expanded') !== 'true') return;
    event.preventDefault();
    const items = [...document.querySelectorAll('.teacher-class-header .header-menu__popup button')], index = items.indexOf(document.activeElement);
    items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  });
  watchTeacherTooltips();
  $('#edit-class').addEventListener('click', () => openClassModal(classroom));
  $('#class-deletion').addEventListener('click', () => {
    const refresh = () => renderClass(classId);
    if (classroom.deletionRequest) confirmCancelRequest(classroom, refresh);
    else openRequestDeletionModal(classroom, refresh);
  });
  $('#view-students').addEventListener('click', () => navigate(`/classes/${encodeURIComponent(classId)}/students`));
  const add = () => navigate(`/classes/${encodeURIComponent(classId)}/add-lesson`);
  $('#add-lesson').addEventListener('click', add);
  $('#add-lesson-inline')?.addEventListener('click', add);
  $('#add-lesson-empty')?.addEventListener('click', add);
  document.querySelectorAll('[data-archive-path], [data-restore-path]').forEach(button => button.addEventListener('click', async () => {
    const restoring = button.hasAttribute('data-restore-path'), assignmentId = button.dataset.archivePath || button.dataset.restorePath;
    const path = assignedPaths.find(item => item.id === assignmentId); if (!path) return;
    if (!await confirmAction({ title: `${restoring ? 'Restore' : 'Archive'} "${path.title}" in this class?`, message: restoring ? 'Return this whole lesson path to the class with its saved schedules and student progress.' : 'Hide this whole lesson path from the class. Student progress and library content are preserved.', confirm: restoring ? 'Restore lesson path' : 'Archive lesson path' })) return;
    button.disabled = true;
    try {
      await postToApi('content-lifecycle', { action: restoring ? 'restore-class-path' : 'archive-class-content', classId, assignmentId });
      toast(restoring ? 'Lesson path restored. Saved progress is preserved.' : 'Lesson path archived. Saved progress is preserved.');
      await renderClass(classId);
    } catch (error) { button.disabled = false; toast(error.message); }
  }));
  document.querySelectorAll('[data-schedule-path], [data-extend-path], [data-notify-path]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.schedulePath || button.dataset.extendPath || button.dataset.notifyPath;
    const path = activePaths.find(item => item.id === id); if (!path) return;
    const link = pathLink(path), lesson = { title: path.title || 'Lesson path' }, refresh = () => renderClass(classId);
    if (button.dataset.schedulePath) return openScheduleModal(classId, link, lesson, refresh);
    if (button.dataset.extendPath && link.dueAt) return openExtendModal(classId, link, lesson, refresh);
    if (!await confirmAction({ title: 'Notify students?', message: 'Notify the class about every lesson in this path.', confirm: 'Notify students' })) return;
    button.disabled = true;
    try { await notifyStudents(classId, links.filter(item => item.learningPathAssignmentId === path.id).map(item => item.id)); toast('Students were notified.'); await refresh(); }
    catch (error) { button.disabled = false; toast(error.message); }
  }));
  wireClassPathMenus();
}

let pathMenusWired = false;
function wireClassPathMenus() {
  if (pathMenusWired) return;
  pathMenusWired = true;
  document.addEventListener('click', event => {
    document.querySelectorAll('.class-path-menu[open]').forEach(menu => {
      if (!menu.contains(event.target) || event.target.closest('button')) { menu.open = false; if (menu.contains(event.target)) menu.querySelector('summary').focus(); }
    });
  }, true);
  document.addEventListener('keydown', event => {
    const menu = event.target.closest('.class-path-menu'); if (!menu) return;
    const summary = menu.querySelector('summary');
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); menu.open = false; summary.focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); menu.open = true;
      const buttons = [...menu.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(document.activeElement);
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  });
}

export function openStudentsModal(classroom, students, progress) {
  const body = students.length ? `<div class="list stagger-in">${students.map(s => {
    const p = progress.find(x => x.studentId === s.id) || {}, value = Math.max(0, Math.min(100, Number(p.percent) || 0));
    return `<div class="student-row"><div class="student-info"><div class="student-avatar">${escapeHtml((s.displayName || s.name || 'S').charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(s.displayName || s.name || 'Student')}</strong><p>${escapeHtml(s.email || '')}</p></div></div><div class="progress"><small>${value}%</small><div class="progress-bar"><i style="width:${value}%"></i></div></div></div>`;
  }).join('')}</div>` : `<p class="muted">Students will appear here once they join with <code>${escapeHtml(classroom.classCode || '')}</code>.</p>`;
  openModal(`<h2>Students</h2><p>${students.length} enrolled in ${escapeHtml(classroom.className)}.</p>${body}`);
}
