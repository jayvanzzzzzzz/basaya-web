import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state, getTeacherClasses } from "../../js/state.js";
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

export async function renderDashboard() {
  await getTeacherClasses();
  page(
    "Your classrooms",
    "Everything you need to keep your learning spaces moving.",
    `<button class="button primary" id="new-class">+ New class</button>`,
  );
  const pageHeader = $("#page-header");
  pageHeader.classList.add("teacher-dashboard-header");
  pageHeader
    .querySelector("div")
    .insertAdjacentHTML(
      "afterbegin",
      '<span class="teacher-dashboard-header__eyebrow">Teacher dashboard</span>',
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
                    <button type="button" class="danger" data-delete="${escapeHtml(c.id)}">Delete Class</button>
                  </div>
                </div>
                <div class="class-card__heading">
                  <span class="class-card__eyebrow">Your classroom</span>
                </div>
                <div class="class-card__body">
                  <h3>${escapeHtml(className)}</h3>
                  <p>${escapeHtml(c.description || "A space for lessons, progress, and classroom learning.")}</p>
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
  $("#page-content").innerHTML = `
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
  `;

  wireCardMenus();

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
  });
}

export function openClassModal(existing) {
  openModal(
    `<h2>${existing ? "Edit class" : "Create a class"}</h2>
     <p>${existing ? "Update the class details students see." : "A unique class code is generated automatically."}</p>
     <form id="class-form">
       <label>Grade level
         <select name="gradeLevel" required>
           <option value="" disabled ${!existing?.gradeLevel ? "selected" : ""}>Select grade</option>
           <option value="7" ${existing?.gradeLevel === "7" ? "selected" : ""}>Grade 7</option>
           <option value="8" ${existing?.gradeLevel === "8" ? "selected" : ""}>Grade 8</option>
           <option value="9" ${existing?.gradeLevel === "9" ? "selected" : ""}>Grade 9</option>
           <option value="10" ${existing?.gradeLevel === "10" ? "selected" : ""}>Grade 10</option>
         </select>
       </label>
       <label>Section
         <input name="section" required maxlength="40" value="${escapeHtml(existing?.section)}" placeholder="e.g. Rizal" />
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

function openDeleteClassModal(classroom) {
  openModal(
    `<h2>Delete class?</h2>
     <p>You're about to permanently delete <strong>${escapeHtml(classroom.className)}</strong>.</p>
     <p class="muted">Students and any lessons linked to this class will no longer be accessible. This cannot be undone.</p>
     <div class="modal-actions">
       <button type="button" class="button secondary" data-cancel>Cancel</button>
       <button type="button" class="button danger" data-confirm-delete>Delete class</button>
     </div>`,
    (modal, close) => {
      $("[data-cancel]", modal).onclick = close;
      $("[data-confirm-delete]", modal).onclick = async () => {
        try {
          await deleteDoc(doc(db, "classes", classroom.id));
          close();
          toast("Class deleted.");
          await renderDashboard();
        } catch (err) {
          toast(err.message);
        }
      };
    },
  );
}