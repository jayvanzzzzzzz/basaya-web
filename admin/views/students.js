import { captureRoute } from "../../js/route-lifecycle.js";
import { confirmAction } from "../../js/action-confirmation.js";
import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state, getAllClasses } from "../../js/state.js";
import { $, escapeHtml, notify, page, openModal } from "../../js/helpers.js";
import { paginate } from "../../js/pagination.js";
import { clearFieldError, fieldError } from "../../js/field-errors.js";
import { setTemporaryPassword, postToApi } from "../../js/api.js";
import { createStudent } from "./create-student.js";
import { MIN_LENGTH } from "../../js/password-rules.js";
import { studentStatus, wireStudentAccess } from "./student-access.js";

// Admin manages student creation and password recovery without student email.
// Existing profiles use firstName / middleName / lastName or fullName.
const fullNameOf = (student) =>
  [student.firstName, student.middleName, student.lastName]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ") ||
  (student.fullName || "").trim().replace(/^,\s*|,\s*$/g, "") ||
  (student.displayName || "").trim();

const studentName = (student) => fullNameOf(student) || student.username || student.lrn || "this student";

function classLabel(classroom) {
  const name = (classroom.className || "").trim();
  const section = (classroom.section || "").trim();
  if (!name) return section;
  if (!section) return name;
  const normalize = value => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const nameKey = normalize(name);
  const sectionKey = normalize(section);
  return !sectionKey || nameKey === sectionKey || nameKey.endsWith(` ${sectionKey}`)
    ? name
    : `${name} · ${section}`;
}

function closeStudentMenus() {
  document.querySelectorAll(".student-table .teacher-table__menu-popup").forEach((menu) => {
    menu.hidden = true;
    menu
      .closest(".teacher-table__menu")
      ?.querySelector(".teacher-table__menu-toggle")
      ?.setAttribute("aria-expanded", "false");
  });
}

async function getAllStudents() {
  const snapshot = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => studentName(a).localeCompare(studentName(b)));
}

// The class ribbon picked last ("all", "none" or a class id), kept when the page re-renders.
let selectedRibbon = "all";
let statusFilter = "all";
let lrnFilter = "all";
const hasLrn = student => String(student.lrn || "").trim().length > 0;

const countLabel = (count) => (count === 1 ? "student" : "students");

function openCreateStudentModal() {
  const isCurrent = captureRoute("/students");
  createStudent((account, password) => {
    showTemporaryPassword(account, password, true);
    if (isCurrent()) renderStudents().catch(() => notify({ tone: "info", title: "Account created", message: "Refresh the student list to see the new account." }));
  });
}

export async function renderStudents() {
  const isCurrent = captureRoute("/students");
  if (!isCurrent()) return;
  const [students] = await Promise.all([getAllStudents(), getAllClasses()]);
  if (!isCurrent()) return;
  const classNames = new Map(
    state.allClasses.map((c) => [c.id, classLabel(c)]),
  );
  const classOf = (student) => classNames.get(student.classId) || "";
  // A student whose class was deleted counts as "No class yet", as the Class column shows.
  const ribbonOf = (student) => (classNames.has(student.classId) ? student.classId : "none");

  // All students, every created class (A–Z, even with no students), then No class yet.
  const ribbons = [
    { id: "all", label: "All students", count: students.length },
    ...state.allClasses
      .map((c) => ({
        id: c.id,
        label: classNames.get(c.id) || "Untitled class",
        count: students.filter((s) => ribbonOf(s) === c.id).length,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    { id: "none", label: "No class yet", count: students.filter((s) => ribbonOf(s) === "none").length },
  ];
  if (!ribbons.some((ribbon) => ribbon.id === selectedRibbon)) selectedRibbon = "all";

  const noClass = ribbons[ribbons.length - 1].count;
  page(
    "Student accounts",
    [`${students.length} ${countLabel(students.length)}`, noClass && `${noClass} with no class yet`],
    `<button type="button" class="button primary" id="create-student"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="3.5" /><path d="M2.5 21v-2a6.5 6.5 0 0 1 10-5.5M18 12v8m-4-4h8" /></svg><span>Add student</span></button>`,
  );

  $("#page-content").innerHTML = students.length
    ? `<section class="teacher-directory" aria-label="Student accounts">
        <div class="teacher-directory__intro">
          <div>
            <span class="teacher-directory__eyebrow">People</span>
            <h2 id="student-ribbon-title">All students</h2>
            <p>Create student accounts with an LRN and username. No student email is required.</p>
          </div>
          <span class="teacher-directory__count" id="student-ribbon-count"></span>
        </div>
        <div class="teacher-status-filters student-status-filters" role="group" aria-label="Filter students by account status">
          ${[["all", "All"], ["active", "Active"], ["deactivated", "Deactivated"]].map(([value, label]) => `<button type="button" data-student-status-filter="${value}" aria-pressed="${statusFilter === value}"><span class="teacher-status-filters__label">${label}</span><span class="teacher-status-filters__count" data-status-count>${students.filter(student => value === "all" || (student.disabled === true ? "deactivated" : "active") === value).length}</span></button>`).join("")}
        </div>
        <div class="student-ribbons student-lrn-ribbons" role="group" aria-label="Filter students by LRN">
          ${[["all", "All"], ["with", "With LRN"], ["without", "Without LRN"]].map(([value, label]) => `<button type="button" class="student-ribbon" data-lrn-filter="${value}" aria-pressed="${lrnFilter === value}"><span class="student-ribbon__label">${label}</span><span class="student-ribbon__count">${students.filter(student => value === "all" || hasLrn(student) === (value === "with")).length}</span></button>`).join("")}
        </div>
        <div class="student-ribbons student-class-ribbons" role="group" aria-label="Show students by class">
          ${ribbons
            .map(
              (ribbon) => `<button type="button" class="student-ribbon" data-ribbon="${escapeHtml(ribbon.id)}" aria-pressed="false">
                <span class="student-ribbon__label">${escapeHtml(ribbon.label)}</span>
                <span class="student-ribbon__count" aria-label="${ribbon.count} ${countLabel(ribbon.count)}">${ribbon.count}</span>
              </button>`,
            )
            .join("")}
        </div>
        <label class="admin-directory-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
          <span class="sr-only">Search students by name, LRN, username or class</span>
          <input type="search" id="student-search" placeholder="Search by name, LRN, username or class..." autocomplete="off" />
        </label>
        <div id="student-bulk-actions" class="student-bulk-actions" aria-label="Selected student actions" hidden>
          <strong data-selected-count aria-live="polite"></strong>
          <div class="student-bulk-actions__buttons">
            <button type="button" class="button secondary small" data-bulk-deactivate>Deactivate selected</button>
            <button type="button" class="button secondary small" data-bulk-reactivate>Reactivate selected</button>
            <button type="button" class="button secondary small" data-clear-selection>Clear selection</button>
          </div>
        </div>
        <div class="teacher-table-wrap">
        <table class="table teacher-table student-table" id="student-accounts-table">
          <thead>
            <tr><th scope="col" class="student-select-cell" hidden><input id="student-select-page" type="checkbox" aria-label="Select students on this page" /></th><th scope="col"><span class="student-table-heading"><button type="button" class="student-multiselect-toggle" id="student-multiselect-toggle" aria-label="Multi-select students" aria-pressed="false" aria-controls="student-accounts-table">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 2 2 4-4M13 6h7M4 13l2 2 4-4M13 13h7M4 20h16" /></svg>
        </button><span>Student</span></span></th><th scope="col">LRN</th><th scope="col">Class</th><th scope="col" class="teacher-table__status-column">Status</th><th scope="col" aria-label="Student actions"></th></tr>
          </thead>
          <tbody>
            ${students
              .map(
                (s) => `<tr data-student="${escapeHtml(s.id)}" data-lrn-status="${hasLrn(s) ? "with" : "without"}" data-account-status="${s.disabled === true ? "deactivated" : "active"}" data-ribbon="${escapeHtml(ribbonOf(s))}" data-search="${escapeHtml(
                  [fullNameOf(s), s.lrn, s.username, classOf(s)].filter(Boolean).join(" ").toLowerCase(),
                )}">
                  <td class="student-select-cell" hidden><input type="checkbox" data-select-student aria-label="Select ${escapeHtml(studentName(s))}" /></td>
                  <td>
                    <div class="teacher-table__person">
                      <span class="teacher-table__avatar student-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-1a7 7 0 0 1 14 0v1" /></svg></span>
                      <span><span class="teacher-table__name">${escapeHtml(fullNameOf(s) || "Unnamed student")}</span>${s.username ? `<small class="student-username">${escapeHtml(s.username)}</small>` : ""}</span>
                    </div>
                    ${studentStatus(s, true)}
                  </td>
                  <td class="teacher-table__email">${escapeHtml(s.lrn || "No LRN on file")}</td>
                  <td>${classOf(s) ? escapeHtml(classOf(s)) : `<span class="muted">No class yet</span>`}</td>
                  <td class="teacher-table__status-column">${studentStatus(s)}</td>
                  <td>
                    <div class="teacher-table__menu">
                      <button
                        type="button"
                        class="teacher-table__menu-toggle"
                        aria-label="Actions for ${escapeHtml(studentName(s))}"
                        aria-haspopup="true"
                        aria-expanded="false"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                      </button>
                      <div class="teacher-table__menu-popup" hidden>
                        ${!hasLrn(s) ? `<button type="button" class="teacher-table__menu-item" data-assign-lrn>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 10h4M7 14h4M17 10v4M15 12h4" /></svg>
                          <span>Assign LRN</span>
                        </button>` : ""}
                        <button type="button" class="teacher-table__menu-item" data-student-access>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9 8v8M15 8v8" /></svg>
                          <span>${s.disabled === true ? "Reactivate student" : "Deactivate student"}</span>
                        </button>
                        <button type="button" class="teacher-table__menu-item" data-temp-password>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8 2 2-2 2 2 2-3 3-2-2-3 3" /></svg>
                          <span>Set temporary password</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>`,
              )
              .join("")}
            <tr class="admin-directory-search-empty" hidden>
              <td colspan="6"></td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>`
    : `<div class="card empty"><h3>No student accounts yet</h3><p>Create the first student account using their 12-digit LRN and a unique username.</p></div>`;

  $("#create-student").addEventListener("click", openCreateStudentModal);
  if (!students.length) return;

  // Loading previews contain copied tables outside this live content container.
  const view = $("#page-content");
  const searchInput = $("#student-search", view);
  const studentRows = [...view.querySelectorAll(".student-table tbody tr[data-student]")];
  let selection;

  // Rows show when they're in the selected ribbon and match the search.
  const applyFilters = () => {
    const text = searchInput.value.trim().toLowerCase();
    const ribbon = ribbons.find((item) => item.id === selectedRibbon);
    let visible = 0;
    studentRows.forEach((row) => {
      row.hidden =
        (selectedRibbon !== "all" && row.dataset.ribbon !== selectedRibbon) ||
        (statusFilter !== "all" && row.dataset.accountStatus !== statusFilter) ||
        (lrnFilter !== "all" && row.dataset.lrnStatus !== lrnFilter) ||
        !row.dataset.search.includes(text);
      if (!row.hidden) visible += 1;
    });

    view.querySelectorAll(".student-class-ribbons .student-ribbon").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.ribbon === selectedRibbon));
    });
    $("#student-ribbon-title").textContent = ribbon.label;
    $("#student-ribbon-count").innerHTML = `<strong>${ribbon.count}</strong> ${countLabel(ribbon.count)}`;

    const emptyRow = $(".student-table .admin-directory-search-empty", view);
    emptyRow.hidden = visible !== 0;
    emptyRow.querySelector("td").textContent =
      ribbon.count === 0
        ? selectedRibbon === "none"
          ? "Every student is in a class."
          : "No students in this class yet."
        : "No students match these filters.";
    selection?.refresh();
  };

  searchInput.addEventListener("input", applyFilters);
  applyFilters();

  const pager = paginate({
    rows: () => studentRows,
    after: $(".teacher-table-wrap", view),
    search: searchInput,
    label: ["student", "students"],
    onChange: () => selection?.refresh(),
  });
  selection = wireStudentAccess({ students, rows: studentRows, isCurrent, applyFilters, pager, nameOf: studentName, reload: renderStudents });
  searchInput.addEventListener("input", () => selection.clear());
  view.querySelectorAll("[data-lrn-filter]").forEach(button => button.addEventListener("click", () => {
    lrnFilter = button.dataset.lrnFilter;
    view.querySelectorAll("[data-lrn-filter]").forEach(tab => tab.setAttribute("aria-pressed", String(tab === button)));
    selection.clear(); closeStudentMenus(); applyFilters(); pager.reset();
  }));
  view.querySelectorAll("[data-student-status-filter]").forEach(button => button.addEventListener("click", () => {
    statusFilter = button.dataset.studentStatusFilter;
    view.querySelectorAll("[data-student-status-filter]").forEach(tab => tab.setAttribute("aria-pressed", String(tab === button)));
    selection.clear(); closeStudentMenus(); applyFilters(); pager.reset();
  }));

  // Picking a ribbon keeps the search text and goes back to page 1.
  view.querySelector(".student-class-ribbons").addEventListener("click", (event) => {
    const button = event.target.closest(".student-ribbon");
    if (!button || button.dataset.ribbon === selectedRibbon) return;
    selectedRibbon = button.dataset.ribbon;
    selection.clear();
    closeStudentMenus();
    applyFilters();
    pager.reset();
  });

  const byId = new Map(students.map((s) => [s.id, s]));
  view.querySelectorAll(".student-table tbody tr[data-student]").forEach((row) => {
    const student = byId.get(row.dataset.student);
    const toggle = row.querySelector(".teacher-table__menu-toggle");
    const popup = row.querySelector(".teacher-table__menu-popup");
    row.querySelector("[data-assign-lrn]")?.addEventListener("click", () => {
      closeStudentMenus();
      openAssignLrnModal(student);
    });
    toggle.addEventListener("click", () => {
      const willOpen = popup.hidden;
      closeStudentMenus();
      popup.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
    row.querySelector("[data-temp-password]").addEventListener("click", () => {
      closeStudentMenus();
      openTemporaryPasswordModal(student);
    });
  });
}

function openAssignLrnModal(student) {
  const isCurrent = captureRoute("/students");
  let busy = false;
  openModal(
    `<h2>Assign learner reference number</h2>
     <p>Add the official LRN for <strong>${escapeHtml(studentName(student))}</strong>.</p>
     <form id="assign-lrn-form" class="form-card">
       <label>Learner Reference Number (LRN)
         <input name="lrn" type="text" inputmode="numeric" pattern="[0-9]{12}" minlength="12" maxlength="12" required autocomplete="off" aria-describedby="assign-lrn-help" />
       </label>
       <p class="muted" id="assign-lrn-help">Enter the 12-digit LRN exactly as it appears in the student's school record. The student can then sign in using their LRN or existing username with their current password.</p>
       <p id="assign-lrn-error" class="form-error" role="alert"></p>
       <div class="modal-actions"><button type="button" class="button secondary" data-cancel>Cancel</button><button type="submit" class="button primary">Save LRN</button></div>
     </form>`,
    (modal, close) => {
      const form = $("#assign-lrn-form", modal);
      const input = form.elements.lrn;
      const submit = form.querySelector('[type="submit"]');
      const cancel = $("[data-cancel]", modal);
      const error = $("#assign-lrn-error", modal);
      const dialog = modal.querySelector('[role="dialog"]');
      dialog.setAttribute("aria-label", "Assign learner reference number");
      cancel.addEventListener("click", () => { if (!busy) close(); });
      modal.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); if (!busy) close(); }
        if (event.key !== "Tab") return;
        const controls = [...modal.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
      input.focus();
      form.addEventListener("submit", async event => {
        event.preventDefault();
        if (busy) return;
        error.textContent = "";
        const lrn = input.value.trim();
        if (!/^\d{12}$/.test(lrn)) { fieldError(input, "Enter exactly 12 digits."); input.focus(); return; }
        busy = true;
        submit.disabled = cancel.disabled = input.disabled = true;
        form.setAttribute("aria-busy", "true");
        submit.textContent = "Saving...";
        try {
          await postToApi("student-accounts", { action: "assign-lrn", studentId: student.id, lrn });
        } catch (failure) {
          error.textContent = failure.message;
          busy = false;
          submit.disabled = cancel.disabled = input.disabled = false;
          form.setAttribute("aria-busy", "false");
          submit.textContent = "Save LRN";
          input.focus();
          return;
        }
        busy = false;
        close();
        notify({ tone: "success", title: "LRN assigned", message: "The student can now sign in with their LRN or existing username and current password." });
        if (isCurrent()) renderStudents().catch(() => notify({ tone: "info", title: "Refresh student accounts", message: "The LRN was saved. Refresh the list to see the update." }));
      });
    },
    { beforeClose: () => !busy },
  );
}

/** Easy to read out loud: no 0/O or 1/l/I. */
function suggestPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (set, count) =>
    Array.from(crypto.getRandomValues(new Uint32Array(count)), (n) => set[n % set.length]).join("");
  return `${pick(letters, 5)}${pick(digits, 4)}`;
}

function openTemporaryPasswordModal(student) {
  const name = studentName(student);
  openModal(
    `<h2>Set a temporary password</h2>
     <p>For <strong>${escapeHtml(name)}</strong>. Give the new password to the student in person.</p>
     <form id="temp-password-form" class="form-card">
       <label>Temporary password
         <input name="password" type="text" required data-missing="Type a temporary password, or press “Suggest another”." minlength="${MIN_LENGTH}" maxlength="128" autocomplete="off" spellcheck="false" />
       </label>
       <button type="button" class="button secondary small" data-suggest>Suggest another</button>
       <p class="muted">Tell the student this password in person. They can change it in Profile → Change password. They'll be signed out on their other devices.</p>
       <p id="temp-password-error" class="form-error" role="alert"></p>
       <div class="modal-actions">
         <button type="button" class="button secondary" data-cancel>Cancel</button>
         <button class="button primary" type="submit">Set password</button>
       </div>
     </form>`,
    (modal, close) => {
      const form = $("#temp-password-form", modal);
      const input = form.elements.password;
      const error = $("#temp-password-error", modal);
      const submit = form.querySelector('[type="submit"]');
      input.value = suggestPassword();
      $("[data-suggest]", modal).addEventListener("click", () => {
        input.value = suggestPassword();
        clearFieldError(input);
        input.focus();
      });
      $("[data-cancel]", modal).addEventListener("click", close);
      setTimeout(() => input.select(), 50);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = input.value.trim();
        error.textContent = "";
        if (password.length < MIN_LENGTH) {
          fieldError(input, `The temporary password needs at least ${MIN_LENGTH} characters.`);
          input.focus();
          return;
        }
        submit.disabled = true;
        submit.textContent = "Setting…";
        try {
          await setTemporaryPassword(student.id, password);
          close();
          showTemporaryPassword(student, password);
        } catch (failure) {
          error.textContent = `Couldn't set the password: ${failure.message}`;
          submit.disabled = false;
          submit.textContent = "Set password";
        }
      });
    },
  );
}

/** Shows the new password once, so the admin can pass it on. */
function showTemporaryPassword(student, password, created = false) {
  const name = studentName(student);
  openModal(
    `<h2>${created ? "Student account created" : "Password set"}</h2>
     <p><strong>${escapeHtml(name)}</strong> can now sign in with:</p>
     <dl class="temp-password">
       <dt>LRN</dt><dd>${escapeHtml(student.lrn || "Not assigned")}</dd>
       <dt>Username</dt><dd>${escapeHtml(student.username || "Not assigned")}</dd>
       <dt>Password</dt><dd><code>${escapeHtml(password)}</code></dd>
     </dl>
     <p class="muted">This is the only time it's shown. Ask them to change it after signing in.</p>
     <div class="modal-actions">
       <button type="button" class="button secondary" data-copy>Copy password</button>
       <button type="button" class="button primary" data-done>Done</button>
     </div>`,
    (modal, close) => {
      $("[data-done]", modal).addEventListener("click", close);
      const copy = $("[data-copy]", modal);
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(password);
          copy.textContent = "Copied!";
        } catch {
          copy.textContent = "Copy it by hand";
        }
      });
    },
  );
}
