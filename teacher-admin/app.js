import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
const state = { user: null, profile: null, classes: [], lessons: [] };

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
}

function setLoading(loading) {
  $("#loading-screen").hidden = !loading;
}

function navigate(path) {
  location.hash = path;
}

function displayName() {
  return (
    state.profile?.displayName || state.user?.email?.split("@")[0] || "Teacher"
  );
}

function time(value) {
  return value?.toDate ? value.toDate().toLocaleDateString() : "Recently";
}

function joinCode() {
  return Array.from(
    crypto
      .getRandomValues(new Uint32Array(1))[0]
      .toString(36)
      .toUpperCase()
      .padStart(6, "0"),
  )
    .slice(-6)
    .join("");
}

function currentRoute() {
  return location.hash.slice(1) || "/dashboard";
}

async function getTeacherClasses() {
  const snapshot = await getDocs(
    query(collection(db, "classes"), where("teacherId", "==", state.user.uid)),
  );
  state.classes = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}
async function getTeacherLessons() {
  const snapshot = await getDocs(
    query(collection(db, "lessons"), where("teacherId", "==", state.user.uid)),
  );
  state.lessons = snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort(
      (a, b) =>
        (b.updatedAt?.seconds || b.createdAt?.seconds || 0) -
        (a.updatedAt?.seconds || a.createdAt?.seconds || 0),
    );
}

function shell() {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#teacher-summary").innerHTML =
    `<strong>${escapeHtml(displayName())}</strong><span>${escapeHtml(state.user.email)}</span>`;
}

function page(title, subtitle, actions = "") {
  $("#page-header").innerHTML =
    `<div><h1>${title}</h1><p>${subtitle}</p></div><div class="header-actions">${actions}</div>`;
}

async function renderDashboard() {
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

async function renderLibrary() {
  await getTeacherLessons();
  page(
    "Lesson library",
    "Create reusable activities, then add them to any class.",
    `<button class="button primary" id="new-lesson">+ New lesson</button>`,
  );
  $("#page-content").innerHTML = state.lessons.length
    ? `<div class="card list">${state.lessons.map((l) => `<div class="lesson-row"><div><h3>${escapeHtml(l.title)}</h3><p>${escapeHtml(l.description || "No description")}</p><div class="lesson-meta"><span class="tag">${escapeHtml(l.difficulty || "Any level")}</span><span class="tag">${escapeHtml(l.activityType || "Lesson")}</span></div></div><button class="button secondary small" data-edit-lesson="${l.id}">Edit</button></div>`).join("")}</div>`
    : empty(
        "Build a reusable lesson",
        "Lessons you create here can be linked to one or more of your classes.",
        "Create a lesson",
        "new-lesson",
      );
  $("#new-lesson")?.addEventListener("click", () => openLessonModal());
  $("#page-content .empty .button")?.addEventListener("click", () =>
    openLessonModal(),
  );
  document
    .querySelectorAll("[data-edit-lesson]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        openLessonModal(
          state.lessons.find((l) => l.id === b.dataset.editLesson),
        ),
      ),
    );
}

async function renderClass(classId) {
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
      getDocs(
        query(
          collection(db, "classLessons"),
          where("teacherId", "==", state.user.uid),
        ),
      ),
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
  const links = linksSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((link) => link.classId === classId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const progress = progressSnap.docs
    .map((d) => d.data())
    .filter((item) => item.classId === classId);
  const average = progress.length
    ? Math.round(
        progress.reduce((sum, p) => sum + Number(p.percent || 0), 0) /
          progress.length,
      )
    : 0;
  const linkedLessons = links
    .map((link) => ({
      link,
      lesson: state.lessons.find((l) => l.id === link.lessonId),
    }))
    .filter((x) => x.lesson);
  page(
    escapeHtml(classroom.className),
    "",
    `<div class="code-stub code-stub--on-canvas" title="Tap to copy"><span class="code-stub__label">Class code</span><code>${escapeHtml(classroom.classCode || "—")}</code><span class="code-stub__hint">Copy</span></div><button class="button secondary" id="edit-class">Edit class</button><button class="button secondary" id="view-students">View Students</button><button class="button primary" id="add-lesson">+ Add lesson</button>`,
  );
  $("#page-content").innerHTML =
    `<div class="grid stats"><div class="card stat"><b>${students.length}</b><span>Students enrolled</span></div><div class="card stat"><b>${linkedLessons.length}</b><span>Lessons assigned</span></div><div class="card stat"><b>${average}%</b><span>Average progress</span></div></div><div class="card"><div class="section-title"><h2>Class lessons</h2><button class="link-button" id="add-lesson-inline">Add lesson</button></div>${linkedLessons.length ? `<div class="list stagger-in">${linkedLessons.map(({ link, lesson }, index) => `<div class="lesson-row"><div><span class="tag">Lesson ${index + 1}</span><h3>${escapeHtml(lesson.title)}</h3><p>${escapeHtml(lesson.description || "No description")}</p></div><button class="link-button danger" data-unlink="${link.id}">Remove</button></div>`).join("")}</div>` : `<p class="muted">No lessons yet. Add one from your library or create it now.</p>`}</div>`;
  $("#edit-class").addEventListener("click", () => openClassModal(classroom));
  $("#view-students").addEventListener("click", () =>
    navigate(`/classes/${classId}/students`),
  );
  const add = () => openAddLessonModal(classroom, links);
  $("#add-lesson").addEventListener("click", add);
  $("#add-lesson-inline")?.addEventListener("click", add);
  document.querySelectorAll("[data-unlink]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Remove this lesson from the class?")) return;
      await deleteDoc(doc(db, "classLessons", b.dataset.unlink));
      toast("Lesson removed from class.");
      renderClass(classId);
    }),
  );
}

function empty(title, description, button, id) {
  return `<div class="card empty"><h3>${title}</h3><p>${description}</p><button class="button primary" id="${id}">${button}</button></div>`;
}

function openModal(html, onMount) {
  const node = $("#modal-template").content.cloneNode(true);
  document.body.append(node);
  const backdrop = document.body.lastElementChild;
  backdrop.querySelector(".modal-content").innerHTML = html;
  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  onMount?.(backdrop, close);
}

function openClassModal(existing) {
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

function openStudentsModal(classroom, students, progress) {
  const body = students.length
    ? `<div class="list stagger-in">${students
        .map((s) => {
          const p = progress.find((x) => x.studentId === s.id) || {};
          const value = Math.min(100, Number(p.percent || 0));
          return `<div class="student-row"><div class="student-info"><div class="student-avatar">${escapeHtml((s.displayName || s.name || "S").charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(s.displayName || s.name || "Student")}</strong><p>${escapeHtml(s.email || "")}</p></div></div><div class="progress"><small>${value}%</small><div class="progress-bar"><i style="width:${value}%"></i></div></div></div>`;
        })
        .join("")}</div>`
    : `<p class="muted">Students will appear here once they join with <code>${escapeHtml(classroom.classCode || "—")}</code>.</p>`;
  openModal(
    `<h2>Students</h2><p>${students.length} enrolled in ${escapeHtml(classroom.className)}.</p>${body}`,
  );
}

function lessonForm(lesson) {
  return `<h2>${lesson ? "Edit lesson" : "Create a lesson"}</h2><p>Keep the core activity structured. Rich game builders can sit on top of this model later.</p><form id="lesson-form"><label>Lesson title<input name="title" required maxlength="120" value="${escapeHtml(lesson?.title)}" placeholder="e.g. Nouns: people, places and things" /></label><div class="form-grid"><label>Difficulty<select name="difficulty"><option>${lesson?.difficulty || "Beginner"}</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Activity type<select name="activityType"><option>${lesson?.activityType || "Quiz"}</option><option>Quiz</option><option>Reading activity</option><option>Vocabulary practice</option><option>Pronunciation</option><option>Game</option></select></label></div><label>Overview<textarea name="description" placeholder="What will students learn?">${escapeHtml(lesson?.description)}</textarea></label><label>Lesson content / instructions<textarea name="content" placeholder="Add questions, instructions, or a structured JSON payload for a future activity builder.">${escapeHtml(lesson?.content)}</textarea></label><div class="modal-actions"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary">${lesson ? "Save lesson" : "Create lesson"}</button></div></form>`;
}

function openLessonModal(existing) {
  openModal(lessonForm(existing), (modal, close) => {
    $("[data-close]", modal).onclick = close;
    $("#lesson-form", modal).onsubmit = async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(e.currentTarget));
      try {
        if (existing)
          await updateDoc(doc(db, "lessons", existing.id), {
            ...values,
            updatedAt: serverTimestamp(),
          });
        else
          await addDoc(collection(db, "lessons"), {
            ...values,
            teacherId: state.user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        close();
        toast(existing ? "Lesson updated." : "Lesson saved to your library.");
        await renderRoute();
      } catch (err) {
        toast(err.message);
      }
    };
  });
}

async function openAddLessonModal(classroom, links) {
  await getTeacherLessons();
  const linked = new Set(links.map((l) => l.lessonId));
  const available = state.lessons.filter((l) => !linked.has(l.id));
  openModal(
    `<h2>Add lessons</h2><p>Choose from your library. Lessons appear in the order selected.</p>${available.length ? `<form id="link-form"><div class="check-list">${available.map((l) => `<label><input type="checkbox" name="lesson" value="${l.id}" /><span><strong>${escapeHtml(l.title)}</strong><br><small class="muted">${escapeHtml(l.activityType || "Lesson")} · ${escapeHtml(l.difficulty || "Any level")}</small></span></label>`).join("")}</div><div class="modal-actions"><button class="button secondary" type="button" data-close>Cancel</button><button class="button primary">Add selected</button></div></form>` : `<p>No unassigned lessons in your library.</p><div class="modal-actions"><button class="button primary" id="create-from-link">Create a lesson</button></div>`}`,
    (modal, close) => {
      $("[data-close]", modal)?.addEventListener("click", close);
      $("#create-from-link", modal)?.addEventListener("click", () => {
        close();
        openLessonModal();
      });
      $("#link-form", modal)?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const ids = new FormData(e.currentTarget).getAll("lesson");
        if (!ids.length) return toast("Select at least one lesson.");
        try {
          await Promise.all(
            ids.map((lessonId, index) =>
              addDoc(collection(db, "classLessons"), {
                classId: classroom.id,
                lessonId,
                teacherId: state.user.uid,
                order: links.length + index + 1,
                createdAt: serverTimestamp(),
              }),
            ),
          );
          close();
          toast(`${ids.length} lesson${ids.length > 1 ? "s" : ""} added.`);
          renderClass(classroom.id);
        } catch (err) {
          toast(err.message);
        }
      });
    },
  );
}

async function renderStudentsPage(classId) {
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
  .sort((a, b) =>
    (a.fullName || "").localeCompare(b.fullName || ""),
  );

  students.sort((a, b) => a.displayName.localeCompare(b.displayName));

  page(
    "Students",
    `${students.length} enrolled in ${escapeHtml(classroom.className)}.`,
    `<button class="button secondary" id="back-to-class">← Back to class</button>`,
  );

  const rows = students
    .map((student) => {
      const name = student.fullName || "Student";
      const email = student.email || "No email available";
      const searchable = `${name} ${email}`.toLowerCase();
      const initial = name.trim().charAt(0).toUpperCase() || "S";

      return `
        <article class="student-directory__row" data-student="${escapeHtml(searchable)}">
          <div class="student-directory__identity">
            <div class="student-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
            <div>
              <h3>${escapeHtml(name)}</h3>
              <p>${escapeHtml(email)}</p>
            </div>
          </div>
          <div class="student-directory__actions" aria-label="Student actions">
            <button class="button secondary small" type="button" title="Progress details will be available soon">
              View progress
            </button>
            <button class="icon-button icon-button--danger" type="button" title="Removing students will be available soon" aria-label="Delete ${escapeHtml(name)}">
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </article>`;
    })
    .join("");

  $("#page-content").innerHTML = students.length
    ? `
      <section class="student-directory card">
        <div class="student-directory__toolbar">
          <div>
            <p class="eyebrow">Class roster</p>
            <h2>Everyone in this class</h2>
          </div>
          <label class="student-search">
            <span class="sr-only">Search students</span>
            <span aria-hidden="true">⌕</span>
            <input id="student-search" type="search" placeholder="Search by name or email" autocomplete="off" />
          </label>
        </div>
        <div class="student-directory__list stagger-in">${rows}</div>
        <p id="student-no-results" class="student-directory__empty" hidden>No students match that search.</p>
      </section>`
    : `
      <section class="card empty student-empty">
        <p class="eyebrow">Class roster</p>
        <h3>No students yet</h3>
        <p>Students will appear here after they join this class using the class code.</p>
        <code>${escapeHtml(classroom.classCode || "—")}</code>
      </section>`;

  $("#back-to-class").addEventListener("click", () =>
    navigate(`/classes/${classId}`),
  );

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
}

async function renderRoute() {
  if (!state.user) return;
  shell();
  const route = currentRoute();
  document
    .querySelectorAll("[data-nav]")
    .forEach((a) =>
      a.classList.toggle("active", route.startsWith(`/${a.dataset.nav}`)),
    );
  try {
    if (route === "/dashboard") await renderDashboard();
    else if (route === "/lessons") await renderLibrary();
    else if (/^\/classes\/[^/]+\/students$/.test(route)) {
      await renderStudentsPage(route.split("/")[2]);
    } else if (route.startsWith("/classes/")) {
      await getTeacherLessons();
      await renderClass(route.split("/")[2]);
    } else navigate("/dashboard");
  } catch (error) {
    console.error(error);
    $("#page-content").innerHTML = empty(
      "Something needs attention",
      "We could not load this page. Check your Firebase configuration and Firestore rules, then try again.",
      "Try again",
      "retry",
    );
    $("#retry")?.addEventListener("click", renderRoute);
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#email").value.trim(),
    password = $("#password").value;
  $("#login-error").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    $("#login-error").textContent =
      error.code === "auth/invalid-credential"
        ? "Incorrect email or password."
        : error.message;
  }
});

document.addEventListener("click", async (event) => {
  const stub = event.target.closest(".code-stub");
  if (!stub) return;
  event.preventDefault();
  event.stopPropagation();
  const codeEl = stub.querySelector("code");
  const hintEl = stub.querySelector(".code-stub__hint");
  const codeText = codeEl?.textContent.trim();
  if (!codeText) return;
  try {
    await navigator.clipboard.writeText(codeText);
    toast("Class code copied.");
    stub.classList.add("is-copied");
    if (hintEl) hintEl.textContent = "Copied!";
    setTimeout(() => {
      stub.classList.remove("is-copied");
      if (hintEl) hintEl.textContent = "Copy";
    }, 1400);
  } catch {
    toast(`Class code: ${codeText}`);
  }
});

$("#logout-button").addEventListener("click", () => signOut(auth));
window.addEventListener("hashchange", renderRoute);
onAuthStateChanged(auth, async (user) => {
  setLoading(true);
  state.user = user;
  state.profile = null;
  if (!user) {
    $("#app-view").hidden = true;
    $("#login-view").hidden = false;
    setLoading(false);
    return;
  }
  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    if (!profile.exists() || profile.data().role !== "teacher") {
      await signOut(auth);
      $("#login-view").hidden = false;
      $("#login-error").textContent =
        "This account is not approved for teacher access.";
      return;
    }
    state.profile = profile.data();
    await renderRoute();
  } catch (error) {
    console.error(error);
    await signOut(auth);
    $("#login-view").hidden = false;
    $("#login-error").textContent = "Could not verify your teacher access.";
  } finally {
    setLoading(false);
  }
});
