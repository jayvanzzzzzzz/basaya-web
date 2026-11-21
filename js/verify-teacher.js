import { applyActionCode, onAuthStateChanged, reload, signOut, signInWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { postToApi } from "./api.js";
import { passwordProblem, passwordRulesMarkup, watchPasswordRules } from "./password-rules.js";

const $ = selector => document.querySelector(selector);
const message = $("#setup-message");
const form = $("#setup-password-form");
$("#setup-password-rules").innerHTML = passwordRulesMarkup();
watchPasswordRules(form.elements.password, $("#setup-password-rules"));
let ready = false;
let checking = false;
let resendUntil = 0;

async function showAccount() {
  if (checking) return;
  checking = true;
  try {
    const user = auth.currentUser;
    $("#verification-actions").hidden = true;
    form.hidden = true;
    $("#setup-signin").hidden = !!user;
    $("#setup-signout").hidden = !user;
    if (!user) {
      $("#setup-description").textContent = "Sign in with the email and temporary password provided by your administrator to finish account setup.";
      return;
    }
    await reload(user);
    await user.getIdToken(true);
    const profile = await getDoc(doc(db, "users", user.uid));
    if (profile.data()?.role !== "teacher") {
      $("#setup-description").textContent = "This page is for teacher accounts. Sign out to use your teacher account.";
      return;
    }
    if (profile.data().emailVerificationRequired !== true || (user.emailVerified && profile.data().mustChangePassword !== true)) {
      location.replace("teacher/index.html");
      return;
    }
    if (!user.emailVerified) {
      $("#setup-title").textContent = "Verify your email";
      $("#setup-description").textContent = `Open the verification email sent to ${user.email} and click the link. Check your spam folder too. If the address is incorrect, ask your administrator to correct it.`;
      $("#verification-actions").hidden = false;
    } else {
      $("#setup-title").textContent = "Choose your password";
      $("#setup-description").textContent = "Your email is verified. Replace the temporary password with a password only you know.";
      form.hidden = false;
    }
  } catch {
    message.textContent = "Could not check your account. Check your connection and reload this page.";
  } finally { checking = false; }
}

$("#check-verification").addEventListener("click", async event => {
  event.currentTarget.disabled = true;
  message.textContent = "";
  await showAccount();
  if (auth.currentUser && !auth.currentUser.emailVerified) message.textContent = "Your email is still pending verification. Open the email link, then try again.";
  $("#check-verification").disabled = false;
});
$("#resend-verification").addEventListener("click", async event => {
  const button = event.currentTarget;
  if (Date.now() < resendUntil) return;
  button.disabled = true;
  message.textContent = "";
  try {
    const result = await postToApi("teacher-onboarding", { action: "resend" });
    message.textContent = result.alreadyVerified ? "Your email is already verified. Select I’ve verified my email to continue." : `Verification email sent to ${result.email}.`;
    resendUntil = Date.now() + 60000;
  } catch (error) {
    message.textContent = error.message;
    if (error.status === 429) resendUntil = Date.now() + 60000;
  } finally { button.disabled = Date.now() < resendUntil; }
});
setInterval(() => {
  const remaining = Math.max(0, Math.ceil((resendUntil - Date.now()) / 1000));
  const button = $("#resend-verification");
  if (resendUntil) {
    button.disabled = remaining > 0;
    button.textContent = remaining ? `Resend available in ${remaining}s` : "Resend verification email";
  }
}, 1000);
$("#setup-signout").addEventListener("click", async () => {
  try { await signOut(auth); location.replace("index.html"); }
  catch { message.textContent = "Could not sign out. Please try again."; }
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  const password = form.elements.password.value;
  const temporaryPassword = form.elements.temporaryPassword.value;
  const problem = passwordProblem(password);
  if (problem) { message.textContent = problem; return; }
  if (password === temporaryPassword) { message.textContent = "Choose a password different from your temporary password."; return; }
  if (password !== form.elements.confirmPassword.value) { message.textContent = "The new passwords do not match."; return; }
  const button = form.querySelector("button");
  if (button.disabled) return;
  button.disabled = true;
  message.textContent = "";
  try {
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, temporaryPassword));
    await user.getIdToken(true);
    await postToApi("teacher-onboarding", { action: "complete", password });
    // An Admin SDK password change can invalidate the old refresh token.
    await signInWithEmailAndPassword(auth, user.email, password);
    form.reset();
    location.replace("teacher/index.html");
  } catch (error) {
    message.textContent = error.code === "auth/invalid-credential" ? "The current or temporary password is incorrect." : error.message;
  } finally { button.disabled = false; }
});
form.addEventListener("input", () => { message.textContent = ""; });

// Consume the Firebase code even when the email opens in a different browser.
const code = new URL(location.href).searchParams.get("oobCode");
if (code) {
  history.replaceState(null, "", location.pathname);
  try {
    await applyActionCode(auth, code);
    message.textContent = "Email verified successfully. You can continue here or return to the browser where you signed in.";
  } catch {
    message.textContent = "This verification link has expired or was already used. Sign in and check your verification status, or request another email.";
  }
}
ready = true;
onAuthStateChanged(auth, () => { if (ready) void showAccount(); });
