import { captureRoute } from "../../js/route-lifecycle.js";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth, db } from "../../js/firebase.js";
import { state } from "../../js/state.js";
import { $, escapeHtml, page, toast, shell } from "../../js/helpers.js";
import { fieldError, focusFirstError } from "../../js/field-errors.js";
import { MIN_LENGTH, passwordProblem, passwordRulesMarkup, watchPasswordRules } from "../../js/password-rules.js";
import { syncThemeButtons } from '../../js/theme-buttons.js';

import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { bindUsernameSettings } from "../../js/username-settings.js";
import { setupAccountSections } from "../../js/account-sections.js";
import { verifyProfilePassword, profilePasswordError } from "../../js/profile-password.js";

// Password changes apply immediately after verifying the current password.

export function renderAccount() {
  const isCurrent = captureRoute("/settings");
  if (!isCurrent()) return;
  page("Account settings", "");

  const email = state.user?.email || "";

  $("#page-content").innerHTML = `
    <section class="account-settings" aria-label="Account settings">
      <header class="account-settings__hero">
        <div class="account-settings__hero-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6Z" /><path d="m9 12 2 2 4-4" /></svg>
        </div>
        <div>
          <span class="account-settings__eyebrow">Your BASAya account</span>
          <h2>${escapeHtml(state.profile?.displayName || "Admin")}</h2>
          <p>${escapeHtml(email)}</p>
        </div>
        <span class="account-settings__status"><span></span>Admin account</span>
      </header>

      <section class="account-settings__card account-settings__appearance admin-appearance" aria-labelledby="admin-appearance-title">
        <span class="account-settings__eyebrow">Make it yours</span>
        <h3 id="admin-appearance-title">Appearance</h3>
        <p>A comfortable view for every school day.</p>
        <div class="theme-options" role="group" aria-labelledby="admin-appearance-title">
          <button class="theme-options__button" type="button" data-theme-choice="light" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg><span>Light</span>
          </button>
          <button class="theme-options__button" type="button" data-theme-choice="dark" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z"/></svg><span>Dark</span>
          </button>
        </div>
      </section>
      <div class="account-settings__grid">
        <section class="account-settings__card account-settings__card--profile">
          <div class="account-settings__card-heading"><div>
            <span class="account-settings__eyebrow">Personal details</span>
            <h3>Profile information</h3><p>Update the name shown across your admin workspace.</p>
          </div></div>
          <form id="admin-profile-form" class="account-settings__form">
            <label>Email Address<input type="email" readonly value="${escapeHtml(email)}" /><small>This email stays available for sign-in and password recovery.</small></label>
            <label>Full name<input name="displayName" required maxlength="240" autocomplete="name" value="${escapeHtml(state.profile?.displayName || '')}" /></label>
            <label>Current password<input name="currentPassword" type="password" required autocomplete="current-password" data-missing="Enter your current password to save your profile." placeholder="Confirm with your current password" /><small>Required each time you save profile information.</small></label>
            <p role="status" id="admin-profile-status"></p>
            <div class="account-settings__form-footer"><span>Updates your profile information only.</span><button class="button primary" type="submit">Save profile</button></div>
          </form>
        </section>
        <section class="account-settings__card" aria-labelledby="admin-username-heading">
          <div class="account-settings__card-heading"><div>
            <span class="account-settings__eyebrow">Sign-in details</span>
            <h3 id="admin-username-heading">Your username</h3><p>Add or change the username you use to sign in. Your email still works.</p>
          </div></div>
          <form id="account-username-form" class="account-settings__form">
            <label>Username<input name="username" required minlength="3" maxlength="30" pattern="[A-Za-z0-9_]{3,30}" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="admin-username-help" value="${escapeHtml(state.profile?.username || '')}" /><small id="admin-username-help">3–30 letters, numbers, or underscores. Usernames are saved in lowercase.</small></label>
            <label>Current password<input name="currentPassword" type="password" required autocomplete="current-password" placeholder="Confirm with your current password" /></label>
            <p role="status" id="username-status"></p>
            <div class="account-settings__form-footer"><span>Use your username and existing password to sign in.</span><button class="button primary" type="submit">Save username</button></div>
          </form>
        </section>
        <section class="account-settings__card account-settings__card--password">
          <div class="account-settings__card-heading">
            <span class="account-settings__step" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14.5v2" /><circle cx="12" cy="14" r=".5" /></svg>
            </span>
            <div>
              <span class="account-settings__eyebrow">Account security</span><h3>Change password</h3>
              <p>Confirm your current password to choose a new one.</p>
            </div>
          </div>
          <form id="admin-password-form" class="account-settings__form">
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
              <span>Your new password takes effect when you save.</span>
              <button class="button secondary" type="submit">Update password</button>
            </div>
          </form>
        </section>
      </div>
    </section>
  `;

  syncThemeButtons();
  setupAccountSections($('.account-settings'), [
    { key: 'profile', label: 'Profile Info', selectors: ['.account-settings__card--profile'] },
    { key: 'username', label: 'Username', selectors: ['.account-settings__card:has(#account-username-form)'] },
    { key: 'security', label: 'Account Security', selectors: ['.account-settings__card--password'] },
  ]);
  bindUsernameSettings($('#account-username-form'));
  $('#admin-profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const profileForm = event.currentTarget;
    const button = profileForm.querySelector('[type="submit"]');
    if (button.disabled) return;
    const displayName = profileForm.elements.displayName.value.trim();
    fieldError(profileForm.elements.displayName, displayName ? '' : 'Enter your full name.');
    if (focusFirstError(profileForm)) return;
    button.disabled = true;
    button.textContent = 'Saving…';
    const status = profileForm.querySelector('[role="status"]');
    status.textContent = '';
    try {
      await verifyProfilePassword(auth.currentUser, profileForm.elements.currentPassword);
      await updateDoc(doc(db, 'users', state.user.uid), { displayName });
      state.profile = { ...state.profile, displayName };
      if (!isCurrent()) return;
      shell("admin-summary", "Admin");
      $('.account-settings__hero h2').textContent = displayName;
      status.textContent = 'Profile information saved.';
    } catch (error) {
      const passwordError = profilePasswordError(error);
      if (passwordError) {
        fieldError(profileForm.elements.currentPassword, passwordError);
        profileForm.elements.currentPassword.focus();
      } else status.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Save profile';
    }
  });
  const form = $("#admin-password-form");
  watchPasswordRules(form.elements.newPassword, form.querySelector(".password-rules"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const currentPassword = values.get("currentPassword");
    const newPassword = values.get("newPassword");

    fieldError(
      form.elements.newPassword,
      passwordProblem(newPassword) ||
        (newPassword === currentPassword ? "Choose a password different from your current one." : ""),
    );
    fieldError(
      form.elements.confirmPassword,
      newPassword !== values.get("confirmPassword") ? "This doesn't match the new password above." : "",
    );
    if (focusFirstError(form)) return;

    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "Updating…";
    try {
      const user = auth.currentUser;
      if (!user?.email) throw new Error("Your account has no sign-in email.");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      form.reset();
      if (isCurrent()) toast("Password updated.");
    } catch (error) {
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
        fieldError(form.elements.currentPassword, "That isn't your current password. Check it and try again.");
        form.elements.currentPassword.focus();
        return;
      }
      toast(
        error.code === "auth/too-many-requests"
            ? "Too many tries. Wait a few minutes and try again."
            : error.message,
      );
    } finally {
      button.disabled = false;
      button.textContent = "Update password";
    }
  });

}
