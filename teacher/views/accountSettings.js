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
import { $, escapeHtml, page, toast } from "../../js/helpers.js";
import { fieldError, focusFirstError } from "../../js/field-errors.js";
import { MIN_LENGTH, passwordProblem, passwordRulesMarkup, watchPasswordRules } from "../../js/password-rules.js";

export function renderAccountSettings() {
  page(
    "Account settings",
    "",
  );

  const profile = state.profile || {};
  const email = state.user?.email || "";
  const displayName = profile.displayName || "";

  $("#page-content").innerHTML = `
    <section class="account-settings" aria-label="Account settings">
      <header class="account-settings__hero">
        <div class="account-settings__hero-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
        </div>
        <div>
          <span class="account-settings__eyebrow">Your BaSaya account</span>
          <h2>A profile that feels like yours.</h2>
          <p>Update the details students and colleagues recognize.</p>
        </div>
        <span class="account-settings__status"><span></span>Teacher account</span>
      </header>

      <div class="account-settings__grid">
        <section class="account-settings__card account-settings__card--profile">
          <div class="account-settings__card-heading">
            <span class="account-settings__step" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.25" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0M19 5v4m-2-2h4" /></svg>
            </span>
            <div>
              <h3>Profile details</h3>
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
            <label>
              Contact email
              <input type="email" value="${escapeHtml(email)}" readonly />
              <small>This email stays available for password recovery.</small>
            </label>
            <div class="account-settings__form-footer">
              <span>Changes apply to your account immediately.</span>
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
              <h3>Change password</h3>
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
              <span>Your current password confirms it’s you.</span>
              <button class="button secondary" type="submit">Update password</button>
            </div>
          </form>
        </section>
      </div>
      <p class="account-settings__footnote">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /></svg>
        Your contact email remains private and is only used for account recovery.
      </p>
    </section>
  `;

  $("#account-profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const displayName = values.get("displayName").trim();

    try {
      await updateDoc(doc(db, "users", state.user.uid), {
        displayName,
      });
      state.profile = {
        ...state.profile,
        displayName,
      };
      toast("Profile details saved.");
      renderAccountSettings();
    } catch (error) {
      toast(error.message);
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
    }
  });
}
