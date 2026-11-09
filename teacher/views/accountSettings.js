import { syncThemeButtons } from "../../js/theme.js";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "../../js/firebase.js";
import { state } from "../../js/state.js";
import { $, escapeHtml, page, toast, shell } from "../../js/helpers.js";
import { watchTeacherTooltips } from './classActions.js';
import { fieldError, focusFirstError } from "../../js/field-errors.js";
import { MIN_LENGTH, passwordProblem, passwordRulesMarkup, watchPasswordRules } from "../../js/password-rules.js";
import { teacherName } from "../../js/chat.js?v=removed-preview";
import { titleChipsMarkup } from "../../js/teacherTitle.js";

export function renderAccountSettings() {
  page(
    "Account settings",
    "Your profile, your preferences, your space to teach.",
  );

  const profile = state.profile || {};
  const email = state.user?.email || "";
  const displayName = profile.displayName || "";
  const title = profile.title || "";

  $("#page-content").innerHTML = `
    <section class="account-settings" aria-label="Account settings">
      <aside class="account-settings__hero" aria-label="Your teacher profile">
        <div>
          <h2>${escapeHtml(displayName || 'Your profile')}</h2>
          <p>${escapeHtml(email)}</p>
        </div>
        <span class="account-settings__status"><span class="teacher-status-dot" aria-hidden="true"></span>Teacher account</span>
        <nav class="account-settings__nav" aria-label="Settings sections">
          <a href="#account-profile-form" data-settings-section="account-profile-form"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg> Profile details <span aria-hidden="true">↗</span></a>
          <a href="#account-password-form" data-settings-section="account-password-form"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg> Password &amp; security <span aria-hidden="true">↗</span></a>
        </nav>
      </aside>

      <div class="account-settings__grid">
        <section class="account-settings__card account-settings__card--profile">
          <div class="account-settings__card-heading">
            <span class="account-settings__step" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.25" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0M19 5v4m-2-2h4" /></svg>
            </span>
            <div>
              <span class="account-settings__eyebrow">Personal details</span>
              <h3>How your classroom knows you</h3>
              <p>Keep the name on your teacher profile up to date.</p>
            </div>
          </div>
          <form id="account-profile-form" class="account-settings__form">
            <label>
              Full name
              <input
                name="displayName"
                required
                data-missing="Enter your full name as it should appear on your profile."
                maxlength="80"
                autocomplete="name"
                value="${escapeHtml(displayName)}"
                placeholder="Your full name"
              />
            </label>
            ${titleChipsMarkup(title, "How should students address you?")}
            <p class="title-chips__preview" data-title-preview></p>
            <label>
              Contact email
              <input type="email" value="${escapeHtml(email)}" readonly />
              <small>This email stays available for password recovery.</small>
            </label>
            <div class="account-settings__form-footer">
              <span>Used across your BaSaya classrooms.</span>
              <button class="button primary" type="submit">Save profile</button>
            </div>
          </form>
        </section>

        <section class="account-settings__card account-settings__card--password">
          <div class="account-settings__card-heading">
            <span class="account-settings__step" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14.5v2" /><circle cx="12" cy="14" r=".5" /></svg>
            </span>
            <div>
              <span class="account-settings__eyebrow">Account security</span>
              <h3>A fresh password, a secure account</h3>
              <p>Choose a strong password you haven't used elsewhere.</p>
            </div>
          </div>
          <form id="account-password-form" class="account-settings__form">
            <label>
              Current password
              <input name="currentPassword" type="password" required data-missing="Enter your current password to confirm it's you." autocomplete="current-password" placeholder="Enter current password" />
            </label>
            <label>
              New password
              <input name="newPassword" type="password" required data-missing="Choose a new password." minlength="${MIN_LENGTH}" autocomplete="new-password" placeholder="Enter new password" />
            </label>
            ${passwordRulesMarkup()}
            <label>
              Confirm new password
              <input name="confirmPassword" type="password" required data-missing="Type the new password again to confirm it." autocomplete="new-password" placeholder="Type it again" />
            </label>
            <div class="account-settings__form-footer">
              <span>Confirm your identity with your current password.</span>
              <button class="button secondary" type="submit">Update password</button>
            </div>
          </form>
        </section>
      </div>
      <section class="account-settings__card account-settings__appearance" aria-labelledby="appearance-heading">
        <div><span class="account-settings__eyebrow">Make it yours</span><h3 id="appearance-heading">Appearance</h3><p>A comfortable view for every teaching day.</p></div>
        <div class="theme-options" role="group" aria-labelledby="appearance-heading">
          <button class="theme-options__button" type="button" data-theme-choice="light" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
            <span>Light</span>
          </button>
          <button class="theme-options__button" type="button" data-theme-choice="dark" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" /></svg>
            <span>Dark</span>
          </button>
        </div>
      </section>
      <p class="account-settings__footnote">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></svg>
        Your contact email is used for sign-in and account recovery.
      </p>
    </section>
  `;

  syncThemeButtons();
  document.querySelectorAll('[data-settings-section]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const form = document.getElementById(link.dataset.settingsSection);
      form.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      form.querySelector('input').focus({ preventScroll: true });
    });
  });
  document.querySelectorAll('#account-password-form input[type="password"]').forEach(input => {
    const wrapper = document.createElement('span');
    wrapper.className = 'account-settings__password-field';
    input.before(wrapper);
    wrapper.append(input);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'account-settings__reveal';
    toggle.setAttribute('aria-label', `Show ${input.name === 'currentPassword' ? 'current password' : input.name === 'newPassword' ? 'new password' : 'password confirmation'}`);
    toggle.dataset.teacherTooltip = '';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="account-settings__eye-slash" d="m3 3 18 18"/></svg>';
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', toggle.getAttribute('aria-label').replace(show ? 'Show' : 'Hide', show ? 'Hide' : 'Show'));
    });
    wrapper.append(toggle);
  });
  watchTeacherTooltips();
  $('#account-password-form').addEventListener('reset', () => {
    document.querySelectorAll('.account-settings__reveal').forEach(toggle => {
      toggle.previousElementSibling.type = 'password';
      toggle.setAttribute('aria-pressed', 'false');
      toggle.setAttribute('aria-label', toggle.getAttribute('aria-label').replace('Hide', 'Show'));
    });
  });

  // "Students will see: Ma'am Reyes", kept in step with the name and the chosen title.
  const profileForm = $("#account-profile-form");
  const preview = $("[data-title-preview]", profileForm);
  const showPreview = () => {
    const name = teacherName(profileForm.elements.displayName.value, profileForm.elements.title.value);
    preview.hidden = !name;
    preview.innerHTML = `Students will see: <strong>${escapeHtml(name)}</strong>`;
  };
  profileForm.addEventListener("input", showPreview);
  showPreview();

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const displayName = values.get("displayName").trim();
    const title = values.get("title") || "";
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Saving…';

    try {
      await updateDoc(doc(db, "users", state.user.uid), {
        displayName,
        title,
      });
      state.profile = {
        ...state.profile,
        displayName,
        title,
      };
      shell();
      toast("Profile details saved.");
      renderAccountSettings();
    } catch (error) {
      toast(error.message);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Save profile';
    }
  });

  watchPasswordRules(
    $("#account-password-form").elements.newPassword,
    $("#account-password-form .password-rules"),
  );
  $("#account-password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const currentPassword = values.get("currentPassword");
    const newPassword = values.get("newPassword");
    const confirmPassword = values.get("confirmPassword");

    fieldError(
      form.elements.newPassword,
      passwordProblem(newPassword) ||
        (newPassword === currentPassword ? "Choose a password different from your current one." : ""),
    );
    fieldError(
      form.elements.confirmPassword,
      newPassword !== confirmPassword ? "This doesn't match the new password above." : "",
    );
    if (focusFirstError(form)) return;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Updating…';

    try {
      const user = auth.currentUser;
      if (!user?.email) throw new Error("Your account has no sign-in email.");
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword,
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      form.reset();
      toast("Password updated.");
    } catch (error) {
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
        fieldError(form.elements.currentPassword, "That isn't your current password. Check it and try again.");
        form.elements.currentPassword.focus();
        return;
      }
      toast(error.message);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Update password';
    }
  });
}
