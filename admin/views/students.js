import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "../../js/firebase.js";
import { state, getAllClasses } from "../../js/state.js";
import { $, escapeHtml, notify, initials, page, openModal } from "../../js/helpers.js";
import { paginate } from "../../js/pagination.js";
import { sendStudentPasswordReset, setTemporaryPassword } from "../../js/api.js";
import { MIN_LENGTH } from "../../js/password-rules.js";

// Admin → Students: every student account, searchable by name, email or class.
// Reset password offers two ways: email a reset link, or set a temporary password
// for a student whose email is fake or mistyped (they can't get the link).
// Reuses the teacher table's look (css/components/tables.css, menus.css).

const studentName = (student) => student.displayName || student.email || "this student";

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

export async function renderStudents() {
  const [students] = await Promise.all([getAllStudents(), getAllClasses()]);
  const classNames = new Map(
    state.allClasses.map((c) => [c.id, [c.className, c.section].filter(Boolean).join(" · ")]),
  );
  const classOf = (student) => classNames.get(student.classId) || "";

  page("Student accounts", "Find a student and help them back into their account.");

  $("#page-content").innerHTML = students.length
    ? `<section class="teacher-directory" aria-label="Student accounts">
        <div class="teacher-directory__intro">
          <div>
            <span class="teacher-directory__eyebrow">People</span>
            <h2>All students</h2>
            <p>Students create their own accounts. Reset a password here when they can't sign in.</p>
          </div>
          <span class="teacher-directory__count">
            <strong>${students.length}</strong>
            ${students.length === 1 ? "student" : "students"}
          </span>
        </div>
        <label class="admin-directory-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
          <span class="sr-only">Search students by name, email or class</span>
          <input type="search" id="student-search" placeholder="Search by name, email or class..." autocomplete="off" />
        </label>
        <div class="teacher-table-wrap">
        <table class="table teacher-table student-table">
          <thead>
            <tr><th scope="col">Student</th><th scope="col">Email address</th><th scope="col">Class</th><th scope="col" aria-label="Student actions"></th></tr>
          </thead>
          <tbody>
            ${students
              .map(
                (s) => `<tr data-student="${escapeHtml(s.id)}" data-search="${escapeHtml(
                  [s.displayName, s.email, classOf(s)].filter(Boolean).join(" ").toLowerCase(),
                )}">
                  <td>
                    <div class="teacher-table__person">
                      <span class="teacher-table__avatar" aria-hidden="true">${escapeHtml(initials(studentName(s)))}</span>
                      <span class="teacher-table__name">${escapeHtml(s.displayName || "Unnamed student")}</span>
                    </div>
                  </td>
                  <td class="teacher-table__email">${escapeHtml(s.email || "No email on file")}</td>
                  <td>${classOf(s) ? escapeHtml(classOf(s)) : `<span class="muted">No class yet</span>`}</td>
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
                        <button type="button" class="teacher-table__menu-item" data-send-link>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h17v11h-17z" /><path d="m3.5 7 8.5 6.5L20.5 7" /></svg>
                          <span>Send reset email</span>
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
              <td colspan="4">No students match that search.</td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>`
    : `<div class="card empty"><h3>No student accounts yet</h3><p>Students show up here once they create an account in the app or on the website.</p></div>`;

  $("#student-search")?.addEventListener("input", (event) => {
    const text = event.currentTarget.value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll(".student-table tbody tr[data-student]").forEach((row) => {
      row.hidden = !row.dataset.search.includes(text);
      if (!row.hidden) visible += 1;
    });
    const emptyRow = $(".student-table .admin-directory-search-empty");
    if (emptyRow) emptyRow.hidden = visible !== 0;
  });

  paginate({
    rows: () => [...document.querySelectorAll(".student-table tbody tr[data-student]")],
    after: $(".teacher-table-wrap"),
    search: $("#student-search"),
    label: ["student", "students"],
  });

  const byId = new Map(students.map((s) => [s.id, s]));
  document.querySelectorAll(".student-table tbody tr[data-student]").forEach((row) => {
    const student = byId.get(row.dataset.student);
    const toggle = row.querySelector(".teacher-table__menu-toggle");
    const popup = row.querySelector(".teacher-table__menu-popup");
    toggle.addEventListener("click", () => {
      const willOpen = popup.hidden;
      closeStudentMenus();
      popup.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
    row.querySelector("[data-send-link]").addEventListener("click", () => {
      closeStudentMenus();
      sendResetLink(student);
    });
    row.querySelector("[data-temp-password]").addEventListener("click", () => {
      closeStudentMenus();
      openTemporaryPasswordModal(student);
    });
  });
}

/**
 * Sends the BaSaya-branded reset email (notify-api). If the API can't send it
 * (e.g. Gmail isn't set up yet), falls back to Firebase's standard reset email.
 */
async function sendResetLink(student) {
  const name = studentName(student);
  if (!student.email) {
    return notify({ tone: "danger", title: "No email on file", message: `${name} has no email. Set a temporary password instead.` });
  }
  const sending = notify({
    tone: "info",
    avatar: initials(name),
    title: "Sending reset link…",
    message: student.email,
    duration: 20000,
  });
  try {
    const { email } = await sendStudentPasswordReset(student.id);
    sending.dismiss();
    notify({
      tone: "success",
      avatar: initials(name),
      title: "Reset link sent",
      message: `${name} will get an email at ${email}. The link works for 1 hour. If the email isn't real, set a temporary password instead.`,
    });
  } catch (error) {
    console.warn("Branded reset email failed, using Firebase's:", error);
    try {
      await sendPasswordResetEmail(auth, student.email);
      sending.dismiss();
      notify({
        tone: "success",
        avatar: initials(name),
        title: "Reset link sent",
        message: `Sent to ${student.email} with the standard Firebase email.`,
      });
    } catch (fallbackError) {
      sending.dismiss();
      notify({ tone: "danger", title: "Couldn't send the reset link", message: fallbackError.message });
    }
  }
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
     <p>For <strong>${escapeHtml(name)}</strong>${student.email ? ` (${escapeHtml(student.email)})` : ""}. Use this when the student can't get the reset email.</p>
     <form id="temp-password-form" class="form-card">
       <label>Temporary password
         <input name="password" type="text" required minlength="${MIN_LENGTH}" maxlength="128" autocomplete="off" spellcheck="false" />
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
        input.focus();
      });
      $("[data-cancel]", modal).addEventListener("click", close);
      setTimeout(() => input.select(), 50);

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = input.value.trim();
        error.textContent = "";
        if (password.length < MIN_LENGTH) {
          error.textContent = `The temporary password needs at least ${MIN_LENGTH} characters.`;
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
function showTemporaryPassword(student, password) {
  const name = studentName(student);
  openModal(
    `<h2>Password set</h2>
     <p><strong>${escapeHtml(name)}</strong> can now sign in with:</p>
     <dl class="temp-password">
       <dt>Email</dt><dd>${escapeHtml(student.email || "—")}</dd>
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
