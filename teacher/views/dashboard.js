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
  empty,
  openModal,
  joinCode,
} from "../../js/helpers.js";
import { renderRoute } from "../router.js";

export async function renderDashboard() {
  await getTeacherClasses();
  page(
    "Your classes",
    "A calm place to organize the learning.",
    `<button class="button primary" id="new-class">+ New class</button>`,
  );

  const renderClassGrid = (classes) =>
    classes.length
      ? `<div class="grid classes-grid stagger-in">${classes
          .map(
            (c) => `<a class="card class-card" href="#/classes/${c.id}">
              <div class="class-card-menu">
                <button type="button" class="icon-button--menu" data-menu-toggle="${c.id}" aria-label="Class options">⋮</button>
                <div class="class-card-menu-popup" data-menu="${c.id}" hidden>
                  <button type="button" data-edit="${c.id}">Edit Class</button>
                  <button type="button" class="danger" data-delete="${c.id}">Delete Class</button>
                </div>
              </div>
              <div><h3>${escapeHtml(c.className)}</h3><p>${escapeHtml(c.description || "No description yet.")}</p></div>
              <div class="code-stub code-stub--on-paper" title="Tap to copy"><span class="code-stub__label">Class code</span><code>${escapeHtml(c.classCode || "—")}</code><span class="code-stub__hint">Copy</span></div>
            </a>`,
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
        const popup = document.querySelector(`[data-menu="${id}"]`);
        // Close any other open menus first.
        document
          .querySelectorAll(".class-card-menu-popup")
          .forEach((p) => {
            if (p !== popup) p.hidden = true;
          });
        popup.hidden = !popup.hidden;
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
          .forEach((p) => (p.hidden = true));
      },
      { once: true },
    );
  };

  $("#page-content").innerHTML = state.classes.length
    ? `<div class="search-bar">
         <input type="search" id="class-search" placeholder="Search classes by name or section…" />
       </div>
       <div id="class-grid-container">${renderClassGrid(state.classes)}</div>`
    : empty(
        "Your first class is waiting",
        "Create a class to generate a class code and start adding lessons.",
        "Create a class",
        "new-class",
      );

  wireCardMenus();

  $("#new-class")?.addEventListener("click", () => openClassModal());
  $("#page-content .empty .button")?.addEventListener("click", () =>
    openClassModal(),
  );

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