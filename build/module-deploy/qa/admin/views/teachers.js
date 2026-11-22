import { confirmAction } from "../../js/action-confirmation.js";
import { captureRoute } from "../../js/route-lifecycle.js";
import {
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "../../js/firebase.js";
import { state, getAllTeachers } from "../../js/state.js";
import { $, escapeHtml, toast, notify, initials, page, empty, openModal } from "../../js/helpers.js";
import { paginate } from "../../js/pagination.js";
import { fieldError } from "../../js/field-errors.js";
import { postToApi, sendPasswordReset } from "../../js/api.js";
import { MIN_LENGTH } from "../../js/password-rules.js";
import { genderMarkup, titleLabel } from "../../js/teacherTitle.js";
import { teacherNameFields, readTeacherName } from "../../js/teacher-name.js";

let pager = null;
let statusFilter = "all";
let teacherQuery = "";
const STATUS_TTL = 30_000;
const STATUS_TIMEOUT = 8_000;
const statusCache = new Map();
const accessVersions = new Map();
const changingAccess = new Set();
let cacheOwner = null;
let view = null;
let renderRevision = 0;

// Rows can appear after refresh, filtering or pagination; use one pulse clock.
document.addEventListener("animationstart", event => {
  if (event.animationName !== "teacher-status-pulse") return;
  event.target.getAnimations({ subtree: true }).forEach(animation => {
    if (animation.animationName === "teacher-status-pulse") animation.startTime = 0;
  });
}, true);

function setStatusNotice(context, message = "", retry = false) {
  if (!context.isCurrent()) return;
  const notice = $("#teacher-status-notice");
  if (!notice) return;
  notice.hidden = !message;
  notice.querySelector("[role=status]").textContent = message;
  notice.querySelector("button").hidden = !retry;
}

async function refreshStatuses(context, force = false) {
  if (!context.isCurrent() || context.refreshing) return;
  const targets = context.teachers.filter(t => !changingAccess.has(t.id) &&
    (force || !statusCache.has(t.id) || Date.now() - statusCache.get(t.id).checkedAt >= STATUS_TTL));
  if (!targets.length) return;
  context.refreshing = true;
  setStatusNotice(context, "Refreshing account statuses…");
  const controller = new AbortController();
  context.controller = controller;
  let timer;
  const versions = new Map(targets.map(t => [t.id, accessVersions.get(t.id) || 0]));
  try {
    const work = async () => {
      // Bound concurrency for larger directories; each API batch supports 100 users.
      let offset = 0;
      const worker = async () => {
        while (offset < targets.length && !controller.signal.aborted && context.isCurrent()) {
          const batch = targets.slice(offset, offset + 100);
          offset += 100;
          const { users } = await postToApi("teacher-onboarding", { action: "statuses", userIds: batch.map(t => t.id) }, { signal: controller.signal });
          if (controller.signal.aborted || !context.isCurrent()) return;
          for (const user of users) {
            if ((accessVersions.get(user.uid) || 0) !== versions.get(user.uid) || changingAccess.has(user.uid)) continue;
            const teacher = context.byId.get(user.uid);
            if (!teacher) continue;
            teacher.emailVerified = user.emailVerified;
            if (typeof user.disabled === "boolean") teacher.disabled = user.disabled;
            statusCache.set(user.uid, { emailVerified: teacher.emailVerified, disabled: teacher.disabled, checkedAt: Date.now() });
            context.updateRow(teacher);
          }
          context.updateFilters();
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, Math.ceil(targets.length / 100)) }, worker));
    };
    await Promise.race([work(), new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Status check timed out"));
      }, STATUS_TIMEOUT);
    })]);
    setStatusNotice(context);
  } catch {
    controller.abort();
    setStatusNotice(context, "Couldn’t refresh account statuses. The teacher list is still available; displayed statuses may be out of date.", true);
  } finally {
    clearTimeout(timer);
    context.refreshing = false;
  }
}

function accountStatusMarkup(teacher, mobile = false) {
  const inactive = teacher.disabled === true;
  return `<span class="teacher-account-status teacher-account-status--${inactive ? "deactivated" : "active"}${mobile ? " teacher-account-status--mobile" : ""}"><i aria-hidden="true"></i>${inactive ? "Deactivated" : "Active"}</span>`;
}

function verificationMarkup(teacher) {
  if (teacher.emailVerificationRequired !== true) return "";
  const label = teacher.emailVerified === true
    ? (teacher.mustChangePassword ? "Verified · Password setup pending" : "Verified")
    : teacher.emailVerified === false ? "Pending verification" : "Verification status unavailable";
  const status = teacher.emailVerified === true ? "verified" : teacher.emailVerified === false ? "pending" : "unavailable";
  const mark = {
    verified: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    pending: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    unavailable: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  }[status];
  return `<span class="teacher-verification teacher-verification--${status}"><svg viewBox="0 0 24 24" aria-hidden="true">${mark}</svg><span>${label}</span></span>`;
}

function verificationActions(teacher) {
  if (teacher.emailVerificationRequired !== true || teacher.emailVerified === true) return "";
  return `<button type="button" class="teacher-table__menu-item" data-verify="${escapeHtml(teacher.id)}">Resend verification email</button>`;
}

function wireVerificationActions() {
  document.querySelectorAll("[data-verify]").forEach(button => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const result = await postToApi("teacher-onboarding", { action: "resend", userId: button.dataset.verify });
      toast(result.alreadyVerified ? "This email is already verified." : `Verification email sent to ${result.email}.`);
      await renderTeachers();
    } catch (error) { toast(error.message); } finally { button.disabled = false; }
  }));

}

function closeTeacherMenus() {
  document.querySelectorAll(".teacher-table__menu-popup").forEach((menu) => {
    menu.hidden = true;
    menu
      .closest(".teacher-table__menu")
      ?.querySelector(".teacher-table__menu-toggle")
      ?.setAttribute("aria-expanded", "false");
  });
}

document.addEventListener("click", (event) => {
  if (
    event.target instanceof Element &&
    !event.target.closest(".teacher-table__menu")
  ) {
    closeTeacherMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTeacherMenus();
});

export async function renderTeachers() {
  const revision = ++renderRevision;
  view?.controller?.abort();
  const routeCurrent = captureRoute("/teachers");
  const owner = auth.currentUser?.uid || "";
  const isCurrent = () => revision === renderRevision && routeCurrent() && (auth.currentUser?.uid || "") === owner;
  if (!isCurrent()) return;
  if (cacheOwner !== owner) {
    statusCache.clear();
    accessVersions.clear();
    cacheOwner = owner;
  }
  await getAllTeachers();
  if (!isCurrent()) return;
  for (const teacher of state.teachers) {
    const cached = statusCache.get(teacher.id);
    if (cached && typeof teacher.disabled === "boolean" && cached.disabled !== teacher.disabled) {
      statusCache.delete(teacher.id);
    } else if (cached) {
      teacher.emailVerified = cached.emailVerified;
      if (typeof cached.disabled === "boolean") teacher.disabled = cached.disabled;
    }
  }

  page(
    "Teacher accounts",
    [`${state.teachers.length} ${state.teachers.length === 1 ? "teacher" : "teachers"}`],
    `<button class="button primary admin-add-button" id="add-teacher" type="button" aria-label="Add teacher"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3.5"/><path d="M2.5 21v-2a6.5 6.5 0 0 1 10-5.5M18 12v8m-4-4h8"/></svg></button>`,
  );

  $("#page-content").innerHTML = state.teachers.length
    ? `<section class="teacher-directory" aria-label="Teacher accounts">
        <div class="teacher-directory__intro">
          <div>
            <span class="teacher-directory__eyebrow">People</span>
            <h2>Meet your teachers</h2>
            <p>Manage account details and access in one place.</p>
          </div>
          <span class="teacher-directory__count">
            <strong>${state.teachers.length}</strong>
            ${state.teachers.length === 1 ? "teacher" : "teachers"}
          </span>
        </div>
        <div class="teacher-status-filters" role="group" aria-label="Filter teachers by account status">
          ${[["all", "All"], ["active", "Active"], ["deactivated", "Deactivated"]].map(([value, label]) => `<button type="button" data-teacher-filter="${value}" aria-pressed="${statusFilter === value}"><span class="teacher-status-filters__label">${label}</span><span class="teacher-status-filters__count">${state.teachers.filter(t => value === "all" || (t.disabled === true ? "deactivated" : "active") === value).length}</span></button>`).join("")}
        </div>
        <label class="admin-directory-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
          <span class="sr-only">Search teachers by name</span>
          <input type="search" id="teacher-name-search" placeholder="Search by teacher name..." autocomplete="off" value="${escapeHtml(teacherQuery)}" />
        </label>
        <div id="teacher-status-notice" class="teacher-status-notice" hidden><span role="status"></span><button type="button" class="button secondary">Retry status check</button></div>
        <div class="teacher-table-wrap">
        <table class="table teacher-table">
          <thead>
            <tr><th scope="col">Teacher</th><th scope="col">Email address</th><th scope="col" class="teacher-table__status-column">Status</th><th scope="col" aria-label="Teacher actions"></th></tr>
          </thead>
          <tbody>
            ${state.teachers
              .map(
                (t) => `<tr data-teacher-id="${escapeHtml(t.id)}" data-teacher-name="${escapeHtml(t.displayName || "Unnamed teacher")}" data-teacher-status="${t.disabled === true ? "deactivated" : "active"}">
                  <td>
                    <div class="teacher-table__person">
                      <span class="teacher-table__name">${escapeHtml(t.displayName || "Unnamed teacher")}</span>
                      ${titleLabel(t.title) ? `<span class="teacher-table__title">${escapeHtml(titleLabel(t.title))}</span>` : ""}
                    </div>
                    ${accountStatusMarkup(t, true)}
                  </td>
                  <td class="teacher-table__email">${escapeHtml(t.email || "No email on file")}${verificationMarkup(t)}</td>
                  <td class="teacher-table__status-column">${accountStatusMarkup(t)}</td>
                  <td>
                    <div class="teacher-table__menu">
                      <button
                        type="button"
                        class="teacher-table__menu-toggle"
                        aria-label="Actions for ${escapeHtml(t.displayName || t.email || "teacher")}"
                        aria-haspopup="true"
                        aria-expanded="false"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
                      </button>
                      <div class="teacher-table__menu-popup" hidden>
                        ${verificationActions(t)}<button type="button" class="teacher-table__menu-item" data-reset="${escapeHtml(t.id)}">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8 2 2-2 2 2 2-3 3-2-2-3 3" /></svg>
                          <span>Reset password</span>
                        </button>
                        <button type="button" class="teacher-table__menu-item" data-toggle-access="${escapeHtml(t.id)}">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="${t.disabled === true ? "m8 12 3 3 5-6" : "M9 8v8M15 8v8"}"/></svg>
                          <span>${t.disabled === true ? "Reactivate teacher" : "Deactivate teacher"}</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>`,
              )
              .join("")}
            <tr class="admin-directory-search-empty" hidden>
              <td colspan="4">No teachers match this search and status.</td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>`
    : empty(
        "No teacher accounts yet",
        "Add your first teacher account to get started.",
        "Add teacher",
        "add-teacher-empty",
      );

  $("#add-teacher")?.addEventListener("click", openAddTeacherModal);
  $("#add-teacher-empty")?.addEventListener("click", openAddTeacherModal);

  function applyFilters() {
    const query = teacherQuery.trim().toLowerCase();
    const rows = [...document.querySelectorAll(".teacher-table tbody tr[data-teacher-name]")];
    let visibleCount = 0;
    rows.forEach((row) => {
      const matches = row.dataset.teacherName.toLowerCase().includes(query) &&
        (statusFilter === "all" || row.dataset.teacherStatus === statusFilter);
      row.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    const emptyRow = $(".admin-directory-search-empty");
    if (emptyRow) emptyRow.hidden = visibleCount !== 0;
  }
  $("#teacher-name-search")?.addEventListener("input", event => {
    teacherQuery = event.currentTarget.value;
    applyFilters();
  });
  document.querySelectorAll("[data-teacher-filter]").forEach(button => button.addEventListener("click", () => {
    statusFilter = button.dataset.teacherFilter;
    closeTeacherMenus();
    document.querySelectorAll("[data-teacher-filter]").forEach(tab => tab.setAttribute("aria-pressed", String(tab === button)));
    applyFilters();
    pager?.reset();
  }));
  applyFilters();

  pager = paginate({
    rows: () => [...document.querySelectorAll(".teacher-table tbody tr[data-teacher-name]")],
    after: $(".teacher-table-wrap"),
    search: $("#teacher-name-search"),
    label: ["teacher", "teachers"],
  });

  const rows = new Map([...document.querySelectorAll("tr[data-teacher-id]")].map(row => [row.dataset.teacherId, row]));
  const context = {
    isCurrent, owner, teachers: state.teachers, byId: new Map(state.teachers.map(t => [t.id, t])),
    updateRow(teacher) {
      if (!isCurrent()) return;
      const row = rows.get(teacher.id);
      if (!row) return;
      row.dataset.teacherStatus = teacher.disabled === true ? "deactivated" : "active";
      row.querySelectorAll(".teacher-account-status").forEach(mark => {
        mark.classList.toggle("teacher-account-status--deactivated", teacher.disabled === true);
        mark.classList.toggle("teacher-account-status--active", teacher.disabled !== true);
        mark.lastChild.textContent = teacher.disabled === true ? "Deactivated" : "Active";
      });
      row.querySelector(".teacher-table__email").innerHTML = escapeHtml(teacher.email || "No email on file") + verificationMarkup(teacher);
      const accessButton = row.querySelector("[data-toggle-access]");
      accessButton.querySelector("span").textContent = teacher.disabled === true ? "Reactivate teacher" : "Deactivate teacher";
      accessButton.querySelector("path").setAttribute("d", teacher.disabled === true ? "m8 12 3 3 5-6" : "M9 8v8M15 8v8");
      const resend = row.querySelector("[data-verify]");
      if (resend) resend.hidden = teacher.emailVerified === true;
    },
    updateFilters() {
      if (!isCurrent()) return;
      document.querySelectorAll("[data-teacher-filter]").forEach(tab => {
        const value = tab.dataset.teacherFilter;
        tab.querySelector(".teacher-status-filters__count").textContent = context.teachers.filter(t => value === "all" || (t.disabled === true ? "deactivated" : "active") === value).length;
      });
      applyFilters();
      pager?.refresh();
    },
  };
  view = context;
  $("#teacher-status-notice button")?.addEventListener("click", () => { void refreshStatuses(context, true); });

  wireVerificationActions();
  state.teachers.forEach((t) => {
    const resetButton = [...document.querySelectorAll("[data-reset]")].find(
      (button) => button.dataset.reset === t.id,
    );
    const accessButton = [...document.querySelectorAll("[data-toggle-access]")].find(
      (button) => button.dataset.toggleAccess === t.id,
    );
    const row = accessButton?.closest("tr");
    const toggle = row?.querySelector(".teacher-table__menu-toggle");
    const popup = row?.querySelector(".teacher-table__menu-popup");

    toggle?.addEventListener("click", () => {
      const willOpen = popup.hidden;
      closeTeacherMenus();
      popup.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
    resetButton?.addEventListener("click", () => {
      closeTeacherMenus();
      resetPassword(t);
    });
    accessButton?.addEventListener("click", () => {
      closeTeacherMenus();
      changeTeacherAccess(t, accessButton, context);
    });
  });
  void refreshStatuses(context);
}

function openAddTeacherModal() {
  openModal(
    `<h2>Add teacher</h2>
     <form id="add-teacher-form" class="form-card">
       ${teacherNameFields()}
       ${genderMarkup()}
       <label>Email<input name="email" type="email" required data-missing="Enter the email the teacher will sign in with." placeholder="teacher@school.edu" /></label>
       <label>Temporary password<input name="password" type="password" required autocomplete="new-password" maxlength="128" data-missing="Set a temporary password for the teacher's first sign-in." minlength="${MIN_LENGTH}" placeholder="At least ${MIN_LENGTH} characters" /></label>
       <p id="add-teacher-error" class="form-error" role="alert"></p>
       <div class="modal-actions"><button class="button primary" type="submit">Create account</button></div>
     </form>`,
    (modal, close) => {
      modal
        .querySelector("#add-teacher-form")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const name = readTeacherName(e.currentTarget);
          const gender = form.get("gender");
          const email = form.get("email").trim();
          const password = form.get("password");
          const errorEl = modal.querySelector("#add-teacher-error");
          errorEl.textContent = "";
          // Temporary password: length only, no small/capital/number rule.
          const fields = e.currentTarget.elements;
          if (password.length < MIN_LENGTH) {
            fieldError(fields.password, `The temporary password needs at least ${MIN_LENGTH} characters.`);
            fields.password.focus();
            return;
          }
          const submit = e.currentTarget.querySelector('[type="submit"]');
          if (submit.disabled) return;
          submit.disabled = true;
          try {
            const result = await postToApi("teacher-onboarding", { action: "create", ...name, gender, email, password });
            toast(result.emailSent ? 'Teacher account created. Verification email sent to ' + result.email + '.' : "Teacher account created, but verification email could not be sent. Use Resend verification email in the teacher menu.");
            close();
            await renderTeachers();
          } catch (error) {
            const field = {
              "auth/email-already-in-use": [fields.email, "An account with this email already exists."],
              "auth/invalid-email": [fields.email, "That doesn't look like an email address. Check it has an @ and a domain."],
              "auth/weak-password": [fields.password, "That password is too weak. Try a longer one."],
            }[error.code];
            if (field) {
              fieldError(...field);
              field[0].focus();
            } else {
              errorEl.textContent = error.message;
            }
          } finally { submit.disabled = false; }
        });
    },
  );
}

/** Sends the BaSaya-branded reset email (notify-api). If the API can't send it (e.g. Gmail isn't set up yet), falls back to Firebase's standard reset email. */
async function resetPassword(teacher) {
  const name = teacherName(teacher);
  if (!teacher.email) {
    return notify({ tone: "danger", title: "No email on file", message: `${name} has no email to send a reset link to.` });
  }
  if (!await confirmAction({ title: 'Send password reset link?', message: 'Email this teacher a link to choose a new password.', confirm: 'Send reset link' })) return;
  const sending = notify({
    tone: "info",
    avatar: initials(name),
    title: "Sending reset link…",
    message: teacher.email,
    duration: 20000,
  });
  try {
    const { email } = await sendPasswordReset(teacher.id);
    sending.dismiss();
    notify({
      tone: "success",
      avatar: initials(name),
      title: "Reset link sent",
      message: `${name} will get an email at ${email}. The link works for 1 hour.`,
    });
  } catch (error) {
    console.warn("Branded reset email failed, using Firebase's:", error);
    try {
      await sendPasswordResetEmail(auth, teacher.email);
      sending.dismiss();
      notify({
        tone: "success",
        avatar: initials(name),
        title: "Reset link sent",
        message: `Sent to ${teacher.email} with the standard Firebase email.`,
      });
    } catch (fallbackError) {
      sending.dismiss();
      notify({ tone: "danger", title: "Couldn't send the reset link", message: fallbackError.message });
    }
  }
}

const teacherName = (teacher) => teacher.displayName || teacher.email || "this teacher";

async function changeTeacherAccess(teacher, button, context) {
  if (button.disabled) return;
  const isCurrent = captureRoute('/teachers');
  const reactivate = teacher.disabled === true;
  button.disabled = true;
  try {
    if (!await confirmAction({
      title: reactivate ? 'Reactivate teacher?' : 'Deactivate teacher?',
      message: reactivate
        ? teacherName(teacher) + ' will be able to sign in again. Their classes and records stay assigned to them.'
        : teacherName(teacher) + ' will be signed out and unable to sign in. Their account, classes, lessons and student records will be kept. You can reactivate them later.',
      confirm: reactivate ? 'Reactivate teacher' : 'Deactivate teacher',
      danger: !reactivate,
    })) return;
    if (!context.isCurrent()) return;
    changingAccess.add(teacher.id);
    accessVersions.set(teacher.id, (accessVersions.get(teacher.id) || 0) + 1);
    const result = await postToApi('teacher-onboarding', { action: reactivate ? 'reactivate' : 'deactivate', userId: teacher.id });
    teacher.disabled = typeof result.disabled === "boolean" ? result.disabled : !reactivate;
    if (cacheOwner === context.owner) {
      accessVersions.set(teacher.id, (accessVersions.get(teacher.id) || 0) + 1);
      statusCache.set(teacher.id, { disabled: teacher.disabled, emailVerified: teacher.emailVerified, checkedAt: Date.now() });
    }
    toast(reactivate ? 'Teacher account reactivated.' : 'Teacher account deactivated. Classes and records have been kept.');
    if (isCurrent() && context.isCurrent()) {
      context.updateRow(teacher);
      context.updateFilters();
    }
  } catch (error) {
    toast(error.message || 'Could not update teacher access. Please try again.');
  } finally {
    changingAccess.delete(teacher.id);
    button.disabled = false;
  }
}
