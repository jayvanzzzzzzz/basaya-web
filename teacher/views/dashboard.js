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
import { chatDot, hasUnreadChat, onChatSummaries } from "./messages.js";
import { greeting } from "../../js/teacherTitle.js";

// ---------- At a glance + "Due this week" ----------
// Cheap reads only: a student count per class and its lesson links (for deadlines).
// Scores stay on the Class Report, which loads each student's progress.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TINTS = 4;

/** A steady colour (0–3) per class, so its tile looks the same every visit. */
const tintOf = (id) => [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TINTS;

/** "4R" for Grade 4 – Rizal. */
const badgeOf = (classroom) =>
  `${classroom.gradeLevel || ""}${(classroom.section || classroom.className || "?").trim().charAt(0)}`.toUpperCase();

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

export async function renderDashboard() {
  await getTeacherClasses();
  page(
    "Your classrooms",
    state.classes.length
      ? `You have ${state.classes.length} ${state.classes.length === 1 ? "class" : "classes"}. Open one to see its lessons and progress.`
      : "Create your first class to start adding lessons.",
    `<button class="button primary" id="new-class">+ New class</button>`,
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
              return `<a class="card class-card" href="#/classes/${encodeURIComponent(c.id)}">
                <div class="class-card__glow" aria-hidden="true"></div>
                <div class="class-card-menu">
                  <button type="button" class="icon-button--menu" data-menu-toggle="${escapeHtml(c.id)}" aria-label="Class options" aria-haspopup="true" aria-expanded="false">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
                  </button>
                  <div class="class-card-menu-popup" data-menu="${escapeHtml(c.id)}" hidden>
                    <button type="button" data-edit="${escapeHtml(c.id)}">Edit Class</button>
                    <button type="button" class="danger" data-delete="${escapeHtml(c.id)}">${c.deletionRequest ? "Cancel deletion request" : "Request deletion"}</button>
                  </div>
                </div>
                <div class="class-card__heading">
                  <span class="class-card__badge" data-tint="${tintOf(c.id)}" aria-hidden="true">${escapeHtml(badgeOf(c))}</span>
                  ${deletionChip(c)}
                  <span data-chat-dot="${escapeHtml(c.id)}">${chatDot(c.id)}</span>
                </div>
                <div class="class-card__body">
                  <h3>${escapeHtml(className)}</h3>
                  <p>${escapeHtml(c.description || "A space for lessons, progress, and classroom learning.")}</p>
                  <div class="class-card__meta" data-class-meta="${escapeHtml(c.id)}"></div>
                </div>
                <div class="class-card__code code-stub code-stub--on-paper" title="Tap to copy">
                  <span class="code-stub__label">Class code</span>
                  <code>${escapeHtml(c.classCode || "—")}</code>
                  <span class="code-stub__hint">Copy</span>
                </div>
                <span class="class-card__open">Open classroom <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span>
              </a>`;
            },
          )
          .join("")}</div>`
      : `<p class="muted">No classes match your search.</p>`;

  const wireCardMenus = () => {
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
        // Close any other open menus first.
        document
          .querySelectorAll(".class-card-menu-popup")
          .forEach((p) => {
            if (p !== popup) {
              p.hidden = true;
              p
                .closest(".class-card-menu")
                ?.querySelector("[data-menu-toggle]")
                ?.setAttribute("aria-expanded", "false");
            }
          });
        popup.hidden = !popup.hidden;
        btn.setAttribute("aria-expanded", String(!popup.hidden));
      });
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

    // Clicking anywhere outside an open menu closes it.
    document.addEventListener(
      "click",
      () => {
        document
          .querySelectorAll(".class-card-menu-popup")
          .forEach((p) => {
            p.hidden = true;
            p
              .closest(".class-card-menu")
              ?.querySelector("[data-menu-toggle]")
              ?.setAttribute("aria-expanded", "false");
          });
      },
      { once: true },
    );
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
          <span class="class-directory__eyebrow">Learning spaces</span>
          <h2>Made for your classroom</h2>
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
      <h2 id="dash-due-title">Due this week</h2>
      <ul class="dash-due__list" data-due-list>
        <li class="dash-due__empty">Loading deadlines…</li>
      </ul>
    </section>
    </div>
  `;

  wireCardMenus();
  let overview = null;
  if (state.classes.length)
    loadOverview(state.classes).then((rows) => {
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

  // "New messages" dots follow the class chats live.
  onChatSummaries(() => {
    document.querySelectorAll("[data-chat-dot]").forEach((dot) => {
      dot.innerHTML = chatDot(dot.dataset.chatDot);
    });
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