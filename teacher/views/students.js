import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state } from "../../js/state.js";
import { $, escapeHtml, navigate, page, openModal, toast } from "../../js/helpers.js";
import { paginate } from "../../js/pagination.js";
import { removeStudent } from "../../js/api.js";
import { leaveRequestsPanel, wireLeaveRequests, leaveLeaveRequests, pendingLeaves } from "./leaveRequests.js";
import { enrollmentSummary, joinRequestsPanel } from "./joinRequestsUi.js";
import { watchJoinRequests, leaveJoinRequests } from "./joinRequests.js";
import { requestRibbons, wireRequestRibbons } from "./requestRibbons.js";
import { leaveStudentNotifications, watchStudentNotifications } from './studentNotifications.js';
import { watchTeacherTooltips } from './classActions.js';
import { attachFloatingTooltips } from '../../js/floatingTooltip.js';

// Local Lucide SVGs, consistent with the teacher portal's icon system.
const icons = {
  progress: '<path d="M3 3v18h18M7 14l4-4 4 3 6-7"/>',
  readings: '<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 12H2v7h5v-7H3Zm18 0h1v7h-5v-7h4ZM13 22h4a4 4 0 0 0 4-4"/>',
  messages: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  remove: '<path d="M3 6h18M19 6l-1 14H6L5 6M9 6V3h6v3M10 10v6M14 10v6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>'
};
const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
const studentAction = (key, label, attribute, id, hidden = false) => `<button type="button" class="roster-action${key === 'remove' ? ' roster-action--danger' : ''}" ${attribute}="${escapeHtml(id)}" aria-label="${label}" data-teacher-tooltip data-floating-tooltip="${label}"${hidden ? ' hidden' : ''}>${icon(key)}</button>`;

export async function renderStudentsPage(classId) {
  leaveJoinRequests();
  leaveLeaveRequests();
  leaveStudentNotifications();
  const classDoc = await getDoc(doc(db, "classes", classId));
  if (!classDoc.exists() || classDoc.data().teacherId !== state.user.uid) {
    return navigate("/dashboard");
  }

  const classroom = { id: classDoc.id, ...classDoc.data() };
  const studentsSnap = await getDocs(
    collection(db, "classes", classId, "students"),
  );
  const students = studentsSnap.docs
    .map((studentDoc) => ({
      id: studentDoc.id,
      ...studentDoc.data(),
    }))
    .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

  page(
    "Students",
    `Manage enrollment and follow student learning in ${classroom.className}.`,
    "",
    {
      crumbs: [
        { label: "Classrooms", href: "#/dashboard" },
        { label: classroom.className, href: `#/classes/${encodeURIComponent(classId)}` },
      ],
    },
  );

  const rows = students
    .map((student) => {
      const name = student.fullName || "Student";
      const initial = name.trim().charAt(0).toUpperCase() || "S";

      return `
        <tr class="roster-row" data-student="${escapeHtml(name.toLowerCase())}">
          <th scope="row"><div class="roster-identity">
            <span class="roster-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
            <span class="roster-name">${escapeHtml(name)}<span class="teacher-notification-dot student-notification-dot" data-student-notice="${escapeHtml(student.id)}" data-teacher-tooltip data-floating-tooltip="Student updates" tabindex="0" role="img" aria-label="Student updates" hidden></span></span>
          </div></th>
          <td><span class="roster-membership${student.leaveRequest ? ' roster-membership--pending' : ''}">${student.leaveRequest ? 'Wants to leave' : 'Enrolled'}</span></td>
          <td><div class="roster-actions" role="group" aria-label="Actions for ${escapeHtml(name)}">
            ${studentAction('progress', 'View progress', 'data-view-progress', student.id)}
            ${studentAction('readings', 'Review readings', 'data-review-student', student.id, true)}
            ${studentAction('messages', 'Read class messages', 'data-message-student', student.id, true)}
            ${studentAction('remove', 'Remove from class', 'data-remove-student', student.id)}
          </div></td>
        </tr>`;
    })
    .join("");

  $("#page-content").innerHTML = `<div class="students-workspace">${enrollmentSummary(classroom, students.length)}` + (students.length
    ? `
      <section class="student-directory class-roster" aria-labelledby="roster-title">
        <div class="student-directory__toolbar">
          <div>
            <p class="eyebrow">Student directory</p>
            <h2 id="roster-title">Class roster <span class="roster-count">${students.length}</span></h2>
            <p class="roster-description">Every learner, with a clear path to their progress.</p>
          </div>
          <label class="student-search">
            <span class="sr-only">Search students</span>
            ${icon('search')}
            <input id="student-search" type="search" placeholder="Search by name" autocomplete="off" />
          </label>
        </div>
        <p class="muted" id="student-notification-status" role="status" hidden></p>
        <p class="roster-scroll-hint" id="roster-scroll-hint">Scroll across the table for student actions.</p>
        <div class="roster-table-wrap" role="region" aria-label="Class roster table" aria-describedby="roster-scroll-hint" tabindex="0">
          <table class="roster-table">
            <caption class="sr-only">Enrolled students and management actions. View progress opens academic results.</caption>
            <thead><tr><th scope="col">Student</th><th scope="col">Membership</th><th scope="col" class="roster-actions-heading">Actions</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p id="student-no-results" class="student-directory__empty" role="status" hidden>No students match that search. Try another name.</p>
      </section>`
    : `
      <section class="card empty student-empty">
        <p class="eyebrow">Class roster</p>
        <h3>No students yet</h3>
        <p>Students appear here once you approve their join requests below.</p>
        <code>${escapeHtml(classroom.classCode || "—")}</code>
      </section>`) + `<section class="roster-admissions" aria-labelledby="roster-admissions-title"><div class="roster-section-heading"><p class="eyebrow">Enrollment management</p><h2 id="roster-admissions-title">Class requests</h2><p>Review who joins and leaves your classroom.</p></div>${requestRibbons(pendingLeaves(students).length)}<div id="request-panel-join" role="tabpanel" aria-labelledby="request-tab-join">${joinRequestsPanel(classroom, students.length, { summary: false })}</div><div id="request-panel-leave" role="tabpanel" aria-labelledby="request-tab-leave" hidden>${leaveRequestsPanel()}</div></section></div>`;

  wireRequestRibbons(classId);
  watchTeacherTooltips();
  watchStudentNotifications(classId, notice => {
    const status = $('#student-notification-status');
    if (status) { status.hidden = !(notice.readingError || notice.messageError || notice.membershipError); status.textContent = status.hidden ? '' : 'Some notification updates are unavailable. Refresh to check.'; }
    document.querySelectorAll('[data-student-notice]').forEach(dot => {
      const item = notice.byStudent.get(dot.dataset.studentNotice);
      dot.hidden = !item?.labels.length;
      dot.setAttribute('aria-label', item?.labels.join(' · ') || 'No pending updates');
      dot.dataset.floatingTooltip = item?.labels.join(' · ') || '';
      const row = dot.closest('[data-student]');
      row.querySelector('[data-review-student]').hidden = !item?.readings;
      row.querySelector('[data-message-student]').hidden = !item?.messages;
    });
  }, students);
  document.querySelectorAll('[data-review-student]').forEach(button => button.addEventListener('click', () => navigate(`/classes/${encodeURIComponent(classId)}/readings/${encodeURIComponent(button.dataset.reviewStudent)}`)));
  document.querySelectorAll('[data-message-student]').forEach(button => button.addEventListener('click', () => navigate(`/messages/${encodeURIComponent(classId)}`)));
  const refreshStudents = () => {
    if (location.hash === `#/classes/${encodeURIComponent(classId)}/students`) return renderStudentsPage(classId);
  };
  wireLeaveRequests(classroom, students, refreshStudents);
  watchJoinRequests(classId, refreshStudents);

  $("#student-search")?.addEventListener("input", (event) => {
    const term = event.currentTarget.value.trim().toLowerCase();
    const rows = [...document.querySelectorAll("[data-student]")];
    let visible = 0;

    rows.forEach((row) => {
      const matches = row.dataset.student.includes(term);
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    $("#student-no-results").hidden = visible !== 0;
  });

  if (students.length) {
    const labelPagination = () => {
      document.querySelectorAll('.students-workspace .pagination__button--nav').forEach(button => {
        button.setAttribute('data-teacher-tooltip', '');
        button.dataset.floatingTooltip = button.getAttribute('aria-label');
      });
    };
    paginate({
      rows: () => [...document.querySelectorAll("[data-student]")],
      after: $(".roster-table-wrap"),
      search: $("#student-search"),
      label: ["student", "students"],
      onChange: labelPagination,
    });
    labelPagination();
  }

  document.querySelectorAll("[data-view-progress]").forEach((button) =>
    button.addEventListener("click", () =>
      navigate(
        `/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(button.dataset.viewProgress)}`,
      ),
    ),
  );

  document.querySelectorAll("[data-remove-student]").forEach((button) =>
    button.addEventListener("click", () => {
      const student = students.find((item) => item.id === button.dataset.removeStudent);
      if (student) openRemoveStudentModal(classroom, student, button);
    }),
  );
}

function openRemoveStudentModal(classroom, student, trigger) {
  const name = student.fullName || "this student";
  openModal(
    `<div class="roster-removal"><p class="eyebrow">Class membership</p><h2 id="roster-remove-title">Remove ${escapeHtml(name)}?</h2>
     <p>They'll be taken out of <strong>${escapeHtml(classroom.className)}</strong>. Their saved work will be archived:</p>
     <ul class="remove-student__list">
       <li>Lesson progress and scores are kept for this class</li>
       <li>Their active class link is removed</li>
     </ul>
     <p class="muted">Their account stays. Rejoining requires teacher approval. Saved progress can be restored, including completed assessments, or you can explicitly start a fresh record.</p>
     <p class="form-error" id="remove-student-error" role="alert"></p>
     <div class="modal-actions">
       <button type="button" class="button secondary" data-cancel>Keep student</button>
       <button type="button" class="button danger" data-confirm-remove>Remove student</button>
     </div></div>`,
    (modal, close) => {
      modal.classList.add('roster-modal');
      const dialog = modal.querySelector('[role="dialog"]');
      dialog.setAttribute('aria-labelledby', 'roster-remove-title');
      const closeButton = $('.modal-close', modal);
      closeButton.innerHTML = icon('close');
      closeButton.dataset.floatingTooltip = 'Close dialog';
      closeButton.setAttribute('aria-label', 'Close dialog');
      const stopTooltips = attachFloatingTooltips(modal);
      const app = $('#app-view');
      const wasInert = app.inert;
      app.inert = true;
      const observer = new MutationObserver(() => {
        if (!modal.isConnected) { observer.disconnect(); stopTooltips(); app.inert = wasInert; if (trigger?.isConnected) trigger.focus(); }
      });
      observer.observe(document.body, { childList: true });
      modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key !== 'Tab') return;
        const controls = [...dialog.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
      $("[data-cancel]", modal).focus();
      $("[data-cancel]", modal).addEventListener("click", close);
      const confirmButton = $("[data-confirm-remove]", modal);
      confirmButton.addEventListener("click", async () => {
        confirmButton.disabled = true;
        confirmButton.textContent = "Removing…";
        try {
          await removeStudent(classroom.id, student.id);
          close();
          toast(`${name} was removed from the class.`);
          await renderStudentsPage(classroom.id);
        } catch (error) {
          $("#remove-student-error", modal).textContent = `Couldn't remove the student: ${error.message}.`;
          confirmButton.disabled = false;
          confirmButton.textContent = "Remove student";
        }
      });
    },
  );
}
