import {
  collection,
  addDoc,
  doc,
  getCountFromServer,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state, getTeacherClasses, getAllLessons } from "../../js/state.js";
import { linkLessonId, linkMode } from "../../js/schedule.js";
import {
  $,
  escapeHtml,
  toast,
  navigate,
  page,
  openModal,
  joinCode,
} from "../../js/helpers.js";
import { renderRoute } from "../router.js";
import { paginate } from "../../js/pagination.js";
import {
  confirmCancelRequest,
  deletionChip,
  openRequestDeletionModal,
} from "./classDeletion.js";
import { hasUnreadChat, onChatSummaries } from "./messages.js";
import { attentionMarkup, watchDashboardNotifications } from './dashboardNotifications.js';
import { setRequestTab } from './requestRibbons.js';
import { greeting } from "../../js/teacherTitle.js";
import { watchTeacherTooltips } from './classActions.js';

// ---------- At a glance + "Due this week" ----------
// Cheap reads only: a student count per class and its lesson links (for deadlines).
// Scores stay on the Class Report, which loads each student's progress.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const dueDay = (millis) => new Date(millis).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const dueTime = (millis) => new Date(millis).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

async function loadOverview(classes) {
  if (!state.allLessons.length) await getAllLessons().catch(() => {});
  const titleOf = (id) => state.allLessons.find((lesson) => lesson.id === id)?.title || "Untitled lesson";
  const now = Date.now();
  return Promise.all(
    classes.map(async (classroom) => {
      const [students, links] = await Promise.all([
        getCountFromServer(collection(db, "classes", classroom.id, "students"))
          .then((snap) => snap.data().count)
          .catch(() => null),
        getDocs(collection(db, "classes", classroom.id, "classLessons"))
          .then((snap) => snap.docs.map((link) => ({ id: link.id, ...link.data() })))
          .catch(() => []),
      ]);
      // Upcoming deadlines (practice lessons have none that count)
      const upcoming = links
        .filter((link) => linkMode(link) === "assessment" && link.dueAt?.toMillis)
        .map((link) => ({ classroom, title: titleOf(linkLessonId(link)), dueAt: link.dueAt.toMillis() }))
        .filter((item) => item.dueAt > now)
        .sort((a, b) => a.dueAt - b.dueAt);
      return { classroom, students, upcoming };
    }),
  );
}

function fillOverview(overview) {
  const set = (key, value) => {
    const el = document.querySelector(`[data-stat="${key}"]`);
    if (el) el.textContent = value;
  };
  const counted = overview.filter((row) => row.students !== null);
  set("students", counted.length ? counted.reduce((sum, row) => sum + row.students, 0) : "—");

  const weekEnd = Date.now() + WEEK_MS;
  const thisWeek = overview
    .flatMap((row) => row.upcoming.filter((item) => item.dueAt <= weekEnd))
    .sort((a, b) => a.dueAt - b.dueAt);
  set("due", thisWeek.length);

  const list = document.querySelector("[data-due-list]");
  if (list) {
    list.innerHTML = thisWeek.length
      ? thisWeek
          .map(
            (item) => `<li>
              <a class="dash-due__item" href="#/classes/${encodeURIComponent(item.classroom.id)}">
                <span class="dash-due__date" aria-hidden="true">
                  <span>${escapeHtml(new Date(item.dueAt).toLocaleDateString(undefined, { month: "short" }))}</span>
                  <strong>${new Date(item.dueAt).getDate()}</strong>
                </span>
                <span class="dash-due__text">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.classroom.className || "Untitled class")}</span>
                  <small>Due ${escapeHtml(dueDay(item.dueAt))}, ${escapeHtml(dueTime(item.dueAt))}</small>
                </span>
              </a>
            </li>`,
          )
          .join("")
      : `<li class="dash-due__empty">Nothing due in the next 7 days.</li>`;
  }

  // Each card: how many students, and its next deadline
  overview.forEach(({ classroom, students, upcoming }) => {
    const meta = [...document.querySelectorAll("[data-class-meta]")].find((el) => el.dataset.classMeta === classroom.id);
    if (!meta) return;
    const next = upcoming[0];
    meta.innerHTML = `${students === null ? "" : `<span>${students} ${students === 1 ? "student" : "students"}</span>`}
      <span>${next ? `Next due ${escapeHtml(dueDay(next.dueAt))}` : "No upcoming deadline"}</span>`;
  });
}

const countUnreadChats = () => state.classes.filter((classroom) => hasUnreadChat(classroom.id)).length;

let stopCardMenus;
export function leaveDashboardMenus() { stopCardMenus?.(); stopCardMenus = null; }

export async function renderDashboard() {
  leaveDashboardMenus();
  await getTeacherClasses();
  const notices = new Map();
  const expanded = new Set();
  const closeCardMenus = () => {
    expanded.clear();
    document.querySelectorAll('.class-attention[open]').forEach(details => {
      details.open = false;
      details.querySelector('summary').setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('[data-menu]').forEach(popup => { popup.hidden = true; });
    document.querySelectorAll('[data-menu-toggle]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  };
  const notificationMarkup = classroom => attentionMarkup(classroom.id, notices.get(classroom.id) || { className: classroom.className }, hasUnreadChat(classroom.id), expanded.has(classroom.id));
  const paintNotice = classId => {
    const classroom = state.classes.find(item => item.id === classId);
    const host = [...document.querySelectorAll('[data-class-attention]')].find(item => item.dataset.classAttention === classId);
    if (!classroom || !host) return;
    // Keep the summary focused and its disclosure open during live updates.
    const focused = host.contains(document.activeElement);
    const requestKind = document.activeElement?.dataset?.requestKind;
    const href = document.activeElement?.getAttribute('href');
    host.innerHTML = notificationMarkup(classroom);
    const details = host.querySelector('details');
    if (!details) expanded.delete(classId);
    else {
      const summary = details.querySelector('summary');
      summary.setAttribute('aria-expanded', String(details.open));
      summary.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const opening = !details.open;
        closeCardMenus();
        details.open = opening;
        summary.setAttribute('aria-expanded', String(opening));
        if (opening) expanded.add(classId);
      });
      if (focused) {
        const link = [...host.querySelectorAll('a')].find(item => item.getAttribute('href') === href && item.dataset.requestKind === requestKind);
        (link || host.querySelector('summary'))?.focus();
      }
    }
  };
  page(
    "Your classrooms",
    state.classes.length
      ? `You have ${state.classes.length} ${state.classes.length === 1 ? "class" : "classes"}. Open one to see its lessons and progress.`
      : "Create your first class to start adding lessons.",
    `<button class="button primary" id="new-class" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Create class</button>`,
  );
  const pageHeader = $("#page-header");
  pageHeader.classList.add("teacher-dashboard-header");
  pageHeader
    .querySelector(".page-header__text")
    .insertAdjacentHTML(
      "afterbegin",
      `<span class="teacher-dashboard-header__eyebrow">${escapeHtml(greeting(state.profile || {}))}</span>`,
    );

  const renderClassGrid = (classes) =>
    classes.length
      ? `<div class="grid classes-grid stagger-in">${classes
          .map(
            (c) => {
              const className = c.className || "Untitled class";
              return `<article class="card class-card" data-class-open="${escapeHtml(c.id)}">
                <div class="class-card__glow" aria-hidden="true"></div>
                <div class="class-card-menu">
                  <div data-class-attention="${escapeHtml(c.id)}"></div>
                  <button type="button" class="icon-button--menu" data-menu-toggle="${escapeHtml(c.id)}" aria-label="Options for ${escapeHtml(className)}" data-teacher-tooltip aria-haspopup="true" aria-expanded="false">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
                  </button>
                  <div class="class-card-menu-popup" data-menu="${escapeHtml(c.id)}" hidden>
                    <button type="button" data-edit="${escapeHtml(c.id)}">Edit Class</button>
                    <button type="button" class="danger" data-delete="${escapeHtml(c.id)}">${c.deletionRequest ? "Cancel deletion request" : "Request deletion"}</button>
                  </div>
                </div>
                <div class="class-card__body">
                  <div class="class-card__heading">
                    <h3><a href="#/classes/${encodeURIComponent(c.id)}">${escapeHtml(className)}</a></h3>
                    ${deletionChip(c)}
                  </div>
                  <p>${escapeHtml(c.description || "A space for lessons, progress, and classroom learning.")}</p>
                  <div class="class-card__meta" data-class-meta="${escapeHtml(c.id)}"></div>
                </div>
                <div class="class-card__code">
                  <span class="code-stub__label">Class code</span>
                  <code>${escapeHtml(c.classCode || "—")}</code>
                  <button type="button" class="class-card__copy code-stub" aria-label="Copy class code for ${escapeHtml(className)}" data-teacher-tooltip ${c.classCode ? '' : 'disabled'}>
                    <code class="sr-only">${escapeHtml(c.classCode || '')}</code>
                    <span class="code-stub__hint sr-only" role="status">Copy</span>
                    <svg class="class-card__copy-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M15 8V4H4v11h4" /></svg>
                  </button>
                </div>
                <a class="class-card__open" href="#/classes/${encodeURIComponent(c.id)}">Open classroom <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></a>
              </article>`;
            },
          )
          .join("")}</div>`
      : `<p class="muted" role="status">No classes match your search. Try a different name or section.</p>`;

  const wireCardMenus = () => {
    document.querySelectorAll('[data-class-open]').forEach(card => {
      card.addEventListener('click', event => {
        const request = event.target.closest('[data-request-kind]');
        if (request) setRequestTab(card.dataset.classOpen, request.dataset.requestKind);
        if (event.target.closest('a, button, details, .code-stub')) return;
        navigate(`/classes/${encodeURIComponent(card.dataset.classOpen)}`);
      });
      paintNotice(card.dataset.classOpen);
    });
    // Open/close the ⋮ popup for each card, without triggering the card's own navigation.
    document.querySelectorAll("[data-menu-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.menuToggle;
        const popup = [...document.querySelectorAll("[data-menu]")].find(
          (menu) => menu.dataset.menu === id,
        );
        if (!popup) return;
        const opening = popup.hidden;
        closeCardMenus();
        popup.hidden = !opening;
        btn.setAttribute("aria-expanded", String(!popup.hidden));
        if (!popup.hidden) {
          popup.querySelector('button')?.focus();
        }
      });
    });

    document.querySelectorAll('.class-card-menu').forEach(menu => {
      menu.onkeydown = event => {
        const popup = menu.querySelector('[data-menu]');
        const details = menu.querySelector('.class-attention[open]');
        if (event.key !== 'Escape' || (popup.hidden && !details)) return;
        event.preventDefault();
        event.stopPropagation();
        const toggle = details?.querySelector('summary') || menu.querySelector('[data-menu-toggle]');
        closeCardMenus();
        toggle.focus();
      };
      menu.onfocusout = event => {
        if (menu.contains(event.relatedTarget)) return;
        menu.querySelector('[data-menu]').hidden = true;
        menu.querySelector('[data-menu-toggle]').setAttribute('aria-expanded', 'false');
        const details = menu.querySelector('.class-attention');
        if (details) {
          details.open = false;
          details.querySelector('summary').setAttribute('aria-expanded', 'false');
          expanded.delete(menu.closest('[data-class-open]').dataset.classOpen);
        }
      };
    });

    // Edit Class
    document.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const classroom = state.classes.find((c) => c.id === btn.dataset.edit);
        if (classroom) openClassModal(classroom);
      });
    });

    // Delete Class
    document.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const classroom = state.classes.find((c) => c.id === btn.dataset.delete);
        if (classroom) openDeleteClassModal(classroom);
      });
    });


  };

  $("#page-content").classList.add("teacher-dashboard");
  const statTile = (key, label, value, icon) => `<div class="dash-stat dash-stat--${key}">
      <span class="dash-stat__icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span>
      <span class="dash-stat__text"><strong data-stat="${key}">${value}</strong><span>${label}</span></span>
    </div>`;

  $("#page-content").innerHTML = `
    <section class="dash-stats" aria-label="At a glance">
      ${statTile("classes", state.classes.length === 1 ? "Class" : "Classes", state.classes.length, '<rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 20V9" />')}
      ${statTile("students", "Students enrolled", "—", '<circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />')}
      ${statTile("due", "Lessons due this week", "—", '<rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />')}
      ${statTile("chats", "Chats with new messages", countUnreadChats(), '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />')}
    </section>
    <div class="dash-columns">
    <section class="class-directory" aria-label="Your classrooms">
      <div class="class-directory__toolbar">
        <div class="class-directory__heading">
          <span class="class-directory__eyebrow">Your teaching space</span>
          <h2>Classroom directory</h2>
          <p>Open a class to manage its students, lessons, and progress.</p>
        </div>
        <span class="class-directory__count">
          <strong>${state.classes.length}</strong>
          ${state.classes.length === 1 ? "class" : "classes"}
        </span>
      </div>
      ${
        state.classes.length
          ? `<label class="class-directory__search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
              <span class="sr-only">Search your classes</span>
              <input type="search" id="class-search" placeholder="Find a class by name or section..." autocomplete="off" />
            </label>
            <div id="class-grid-container">${renderClassGrid(state.classes)}</div>`
          : `<div class="class-directory__empty">
              <div class="class-directory__empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 5.5v16M8 7h8m-8 4h7" /></svg>
              </div>
              <span class="class-directory__eyebrow">A fresh start</span>
              <h3>Your first classroom is waiting.</h3>
              <p>Create a class to get a unique class code and a home for lessons and student progress.</p>
              <button class="button primary" id="new-class-empty" type="button">Create your first class</button>
            </div>`
      }
    </section>
    <section class="dash-due" aria-labelledby="dash-due-title">
      <div class="dash-due__heading"><span class="class-directory__eyebrow">Looking ahead</span><h2 id="dash-due-title">Due this week</h2><p>Assessment deadlines in the next 7 days.</p></div>
      <ul class="dash-due__list" data-due-list>
        <li class="dash-due__empty">Loading deadlines…</li>
      </ul>
    </section>
    </div>
  `;

  document.querySelectorAll('.sidebar button[aria-label]').forEach(button => button.setAttribute('data-teacher-tooltip', ''));
  watchTeacherTooltips();
  wireCardMenus();
  const dismissCardMenus = event => {
    if (!event.target.closest('.class-card-menu') || event.target.closest('.class-attention a')) closeCardMenus();
  };
  document.addEventListener('click', dismissCardMenus);
  stopCardMenus = () => document.removeEventListener('click', dismissCardMenus);
  const dashboardRoot = $('#class-grid-container');
  if (state.classes.length) watchDashboardNotifications(state.classes, (classId, notice) => {
    if (!dashboardRoot?.isConnected) return;
    notices.set(classId, notice);
    paintNotice(classId);
  });
  let overview = null;
  if (state.classes.length)
    loadOverview(state.classes).then((rows) => {
      if (!dashboardRoot?.isConnected) return;
      overview = rows;
      fillOverview(rows);
    });
  else fillOverview([]);

  $("#new-class")?.addEventListener("click", () => openClassModal());
  $("#new-class-empty")?.addEventListener("click", () => openClassModal());

  $("#class-search")?.addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    const filtered = state.classes.filter((c) =>
      [c.className, c.section, c.description]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(term)),
    );
    $("#class-grid-container").innerHTML = renderClassGrid(filtered);
    wireCardMenus();
    if (overview) fillOverview(overview);
  });

  // The attention badge follows class chats live.
  onChatSummaries(() => {
    state.classes.forEach(classroom => paintNotice(classroom.id));
    const chats = document.querySelector('[data-stat="chats"]');
    if (chats) chats.textContent = countUnreadChats();
  });

  if (state.classes.length) {
    paginate({
      rows: () => [...document.querySelectorAll("#class-grid-container .class-card")],
      after: $("#class-grid-container"),
      search: $("#class-search"),
      label: ["class", "classes"],
      pageSizes: [9, 18, 36],
    });
  }
}

export function openClassModal(existing) {
  openModal(
    `<h2>${existing ? "Edit class" : "Create a class"}</h2>
     <p>${existing ? "Update the class details students see." : "A unique class code is generated automatically."}</p>
     <form id="class-form">
       <label>Grade level
         <select name="gradeLevel" required data-missing="Choose the grade level for this class.">
           <option value="" disabled ${!existing?.gradeLevel ? "selected" : ""}>Select grade</option>
           <option value="7" ${existing?.gradeLevel === "7" ? "selected" : ""}>Grade 7</option>
           <option value="8" ${existing?.gradeLevel === "8" ? "selected" : ""}>Grade 8</option>
           <option value="9" ${existing?.gradeLevel === "9" ? "selected" : ""}>Grade 9</option>
           <option value="10" ${existing?.gradeLevel === "10" ? "selected" : ""}>Grade 10</option>
         </select>
       </label>
       <label>Section
         <input name="section" required data-missing="Enter the section name, like Rizal." maxlength="40" value="${escapeHtml(existing?.section)}" placeholder="e.g. Rizal" />
       </label>
       <label>Description
         <textarea name="description" placeholder="A short note for your students">${escapeHtml(existing?.description)}</textarea>
       </label>
       <div class="modal-actions">
         <button type="button" class="button secondary" data-close>Cancel</button>
         <button class="button primary">${existing ? "Save changes" : "Create class"}</button>
       </div>
     </form>`,
    (modal, close) => {
      $("[data-close]", modal).onclick = close;
      $("#class-form", modal).onsubmit = async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const values = Object.fromEntries(form);
        const className = `Grade ${values.gradeLevel} - ${values.section}`;
        try {
          if (existing)
            await updateDoc(doc(db, "classes", existing.id), {
              ...values,
              className,
              updatedAt: serverTimestamp(),
            });
          else
            await addDoc(collection(db, "classes"), {
              ...values,
              className,
              classCode: joinCode(),
              teacherId: state.user.uid,
              createdAt: serverTimestamp(),
            });
          close();
          toast(existing ? "Class updated." : "Class created.");
          navigate("/dashboard");
          renderRoute();
        } catch (err) {
          toast(err.message);
        }
      };
    },
  );
}

// Deleting needs an admin's approval: the teacher sends a request (classDeletion.js).
function openDeleteClassModal(classroom) {
  if (classroom.deletionRequest) confirmCancelRequest(classroom, renderDashboard);
  else openRequestDeletionModal(classroom, renderDashboard);
}
