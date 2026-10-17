import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "../../js/firebase.js";
import { state } from "../../js/state.js";
import { $, escapeHtml, page, toast } from "../../js/helpers.js";
import { requestAdminPasswordChange, sendResetLink } from "../../js/api.js";
import { MIN_LENGTH, passwordProblem, passwordRulesMarkup, watchPasswordRules } from "../../js/password-rules.js";

// #/settings: the admin's own password. Unlike a teacher's, a new admin password
// doesn't apply right away: notify-api emails the admin an Approve link first
// (api/request-admin-password-change → confirm-password-change.html).

export function renderAccount() {
  page("Account settings", "Your admin sign-in details.");

  const email = state.user?.email || "";

  $("#page-content").innerHTML = `
    <section class="account-settings" aria-label="Account settings">
      <header class="account-settings__hero">
        <div class="account-settings__hero-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6Z" /><path d="m9 12 2 2 4-4" /></svg>
        </div>
        <div>
          <span class="account-settings__eyebrow">Your BaSaya account</span>
          <h2>${escapeHtml(state.profile?.displayName || "Admin")}</h2>
          <p>${escapeHtml(email)}</p>
        </div>
        <span class="account-settings__status"><span></span>Admin account</span>
      </header>

      <div class="account-settings__grid">
        <section class="account-settings__card account-settings__card--password">
          <div class="account-settings__card-heading">
            <span class="account-settings__step" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14.5v2" /><circle cx="12" cy="14" r=".5" /></svg>
            </span>
            <div>
              <h3>Change password</h3>
              <p>You'll approve it from your email before it works.</p>
            </div>
          </div>
          <form id="admin-password-form" class="account-settings__form">
            <label>
              Current password
              <input name="currentPassword" type="password" required autocomplete="current-password" placeholder="Enter current password" />
            </label>
            <label>
              New password
              <input name="newPassword" type="password" required minlength="${MIN_LENGTH}" autocomplete="new-password" placeholder="Enter new password" />
            </label>
            ${passwordRulesMarkup()}
            <label>
              Confirm new password
              <input name="confirmPassword" type="password" required minlength="${MIN_LENGTH}" autocomplete="new-password" placeholder="Type it again" />
            </label>
            <div class="account-settings__form-footer">
              <span>We'll email an Approve link to ${escapeHtml(email)}.</span>
              <button class="button secondary" type="submit">Send approval email</button>
            </div>
          </form>
          <div id="admin-password-sent" class="account-settings__form" hidden>
            <p><strong>Check your email.</strong> We sent an Approve link to <strong>${escapeHtml(email)}</strong>.</p>
            <p>Your current password keeps working until you approve. The link expires in <strong data-minutes>30</strong> minutes. After you approve, you'll be signed out and can sign in with the new password.</p>
            <div class="account-settings__form-footer">
              <span>No email? Check Spam, or send it again.</span>
              <button id="admin-password-again" class="button secondary" type="button">Start over</button>
            </div>
          </div>
        </section>

        <section class="account-settings__card">
          <div class="account-settings__card-heading">
            <span class="account-settings__step" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
            </span>
            <div>
              <h3>Forgot your current password?</h3>
              <p>Get a link to set a new one instead.</p>
            </div>
          </div>
          <div class="account-settings__form">
            <p>We'll email a password reset link to <strong>${escapeHtml(email)}</strong>. It works for 1 hour.</p>
            <div class="account-settings__form-footer">
              <span>Only someone who can open that inbox can use it.</span>
              <button id="admin-reset-link" class="button secondary" type="button">Email me a reset link</button>
            </div>
          </div>
        </section>
      </div>
    </section>
  `;

  const form = $("#admin-password-form");
  const sent = $("#admin-password-sent");
  watchPasswordRules(form.elements.newPassword, form.querySelector(".password-rules"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const currentPassword = values.get("currentPassword");
    const newPassword = values.get("newPassword");

    const problem = passwordProblem(newPassword);
    if (problem) return toast(problem);
    if (newPassword !== values.get("confirmPassword")) return toast("Your new passwords do not match.");
    if (newPassword === currentPassword) return toast("Choose a password different from your current one.");

    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const user = auth.currentUser;
      if (!user?.email) throw new Error("Your account has no sign-in email.");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      // The server only accepts a sign-in from the last few minutes.
      await user.getIdToken(true);
      const { minutes } = await requestAdminPasswordChange(newPassword);
      form.reset();
      sent.querySelector("[data-minutes]").textContent = minutes;
      form.hidden = true;
      sent.hidden = false;
    } catch (error) {
      toast(
        error.code === "auth/invalid-credential" || error.code === "auth/wrong-password"
          ? "Your current password is incorrect."
          : error.code === "auth/too-many-requests"
            ? "Too many tries. Wait a few minutes and try again."
            : error.message,
      );
    } finally {
      button.disabled = false;
      button.textContent = "Send approval email";
    }
  });

  $("#admin-password-again").addEventListener("click", () => {
    sent.hidden = true;
    form.hidden = false;
    form.elements.currentPassword.focus();
  });

  $("#admin-reset-link").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await sendResetLink(email);
      toast(`Reset link sent to ${email}.`);
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
}
