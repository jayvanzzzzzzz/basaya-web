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
import { $, escapeHtml, toast, notify, navigate, page, headerMenu, openModal } from "../../js/helpers.js";
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
import {
  confirmCancelRequest,
  deletionBanner,
  openRequestDeletionModal,
  wireDeletionBanner,
} from "./classDeletion.js";

const SCHEDULE_LABELS = { scheduled: "Not open yet", open: "Open", closed: "Closed" };

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
    `<button class="button secondary class-report-button" id="class-report" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m4 7H3" /></svg>Class Report</button><button class="button secondary class-chat-button" id="class-chat" type="button"><span class="class-chat-button__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" /></svg></span>Class chat<span class="class-chat-button__badge" data-class-chat-badge hidden><span class="sr-only">New messages</span></span></button><button class="button secondary" id="view-students">Students${leaveCount ? `<span class="button-badge" title="${leaveCount} leave request${leaveCount === 1 ? "" : "s"}">${leaveCount}</span>` : ""}</button>${headerMenu(
      "More class options",
      `<button type="button" id="edit-class">Edit class</button><button type="button" class="danger" id="class-deletion">${classroom.deletionRequest ? "Cancel deletion request" : "Request deletion"}</button>`,
    )}<button class="button primary" id="add-lesson">+ Add lesson</button>`,
    { crumbs: [{ label: "Classrooms", href: "#/dashboard" }] },
  );
  $("#page-header").classList.add("teacher-class-header");
  $("#page-content").classList.add("teacher-class-page");
  $("#page-content").innerHTML = `
    ${deletionBanner(classroom)}
    <section class="class-overview" aria-label="Class overview">
      <div class="class-overview__identity">
        <span class="class-overview__eyebrow">Classroom overview</span>
        <div class="class-overview__code code-stub code-stub--on-canvas" title="Tap to copy">
          <span class="code-stub__label">Class code</span>
          <code>${escapeHtml(classroom.classCode || "—")}</code>
          <span class="code-stub__hint">Copy</span>
        </div>
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
        <button class="button secondary" id="add-lesson-inline" type="button">+ Add lesson</button>
      </div>
      ${
        linkedLessons.length
          ? `<div class="class-lesson-tabs" role="tablist" aria-label="Filter lessons">${LESSON_TABS.map(
              ({ key, label }) => `
                <button class="class-lesson-tab${key === activeTab ? " is-active" : ""}" type="button" role="tab" data-lesson-tab="${key}" aria-selected="${key === activeTab}">
                  ${label}<span class="class-lesson-tab__count">${tabCount[key]}</span>
                </button>`,
            ).join("")}</div>
            <div class="class-lessons__list stagger-in">${linkedLessons
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
      });
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