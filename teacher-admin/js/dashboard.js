import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { state, getTeacherClasses } from "./state.js";
import {
  $,
  escapeHtml,
  toast,
  navigate,
  page,
  empty,
  openModal,
  joinCode,
} from "./helpers.js";
import { renderRoute } from "./router.js";

export async function renderDashboard() {
  await getTeacherClasses();
  page(
    "Your classes",
    "A calm place to organize the learning.",
    `<button class="button primary" id="new-class">+ New class</button>`,
  );
  $("#page-content").innerHTML = state.classes.length
    ? `<div class="grid classes-grid stagger-in">${state.classes.map((c) => `<a class="card class-card" href="#/classes/${c.id}"><div><h3>${escapeHtml(c.className)}</h3><p>${escapeHtml(c.description || "No description yet.")}</p></div><div class="code-stub code-stub--on-paper" title="Tap to copy"><span class="code-stub__label">Class code</span><code>${escapeHtml(c.classCode || "—")}</code><span class="code-stub__hint">Copy</span></div></a>`).join("")}</div>`
    : empty(
        "Your first class is waiting",
        "Create a class to generate a class code and start adding lessons.",
        "Create a class",
        "new-class",
      );
  $("#new-class")?.addEventListener("click", () => openClassModal());
  $("#page-content .empty .button")?.addEventListener("click", () =>
    openClassModal(),
  );
}

export function openClassModal(existing) {
  openModal(
    `<h2>${existing ? "Edit class" : "Create a class"}</h2><p>${existing ? "Update the class details students see." : "A unique class code is generated automatically."}</p><form id="class-form"><label>Class name<input name="className" required maxlength="80" value="${escapeHtml(existing?.className)}" placeholder="e.g. Grade 7 - Rizal" /></label><label>Description<textarea name="description" placeholder="A short note for your students">${escapeHtml(existing?.description)}</textarea></label><div class="modal-actions"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary">${existing ? "Save changes" : "Create class"}</button></div></form>`,
    (modal, close) => {
      $("[data-close]", modal).onclick = close;
      $("#class-form", modal).onsubmit = async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const values = Object.fromEntries(form);
        try {
          if (existing)
            await updateDoc(doc(db, "classes", existing.id), {
              ...values,
              updatedAt: serverTimestamp(),
            });
          else
            await addDoc(collection(db, "classes"), {
              ...values,
              classCode: joinCode(),
              teacherId: state.user.uid,
              createdAt: serverTimestamp(),
            });
          close();
          toast(existing ? "Class updated." : "Class created.");
          navigate(existing ? `/classes/${existing.id}` : "/dashboard");
          renderRoute();
        } catch (err) {
          toast(err.message);
        }
      };
    },
  );
}
