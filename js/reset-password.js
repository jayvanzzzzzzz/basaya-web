// reset-password.html: the page the BaSaya reset email links to
// (notify-api/api/send-password-reset.js). Firebase made the one-time code
// (?oobCode=…, valid 1 hour); this page checks it and saves the new password.

import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./firebase.js";
import { passwordChecks, passwordProblem } from "./password-rules.js";
const code = new URLSearchParams(location.search).get("oobCode");
const form = document.getElementById("reset-form");
const password = document.getElementById("new-password");
const confirm = document.getElementById("confirm-password");
const error = document.getElementById("reset-error");
const submit = form.querySelector(".reset-submit");

function show(state) {
  document.querySelectorAll("[data-state]").forEach((element) => {
    element.hidden = element.dataset.state !== state;
  });
}

function showInvalid(firebaseError) {
  const used = firebaseError?.code === "auth/invalid-action-code";
  const missing = !code;
  document.querySelector("[data-invalid-title]").textContent = missing
    ? "This reset link is incomplete"
    : used
      ? "This link was already used"
      : "This link has expired";
  document.querySelector("[data-invalid-text]").textContent = missing
    ? "Open the link straight from your email, or ask for a new one from the sign-in page."
    : "Reset links work for 1 hour and only once. Ask for a new one from the sign-in page (Forgot password?), or ask your school admin.";
  show("invalid");
}

/** 0–4 (how many rules pass), plus which ones. */
function strength(value) {
  const rules = passwordChecks(value);
  return { score: Object.values(rules).filter(Boolean).length, rules };
}

const LABELS = ["Use at least 8 characters", "Weak", "Fair", "Almost there", "Strong"];

password.addEventListener("input", () => {
  const { score, rules } = strength(password.value);
  const meter = document.querySelector(".reset-strength");
  meter.dataset.strength = password.value ? String(score) : "0";
  document.querySelector("[data-strength-label]").textContent = password.value
    ? LABELS[score]
    : LABELS[0];
  Object.entries(rules).forEach(([rule, ok]) =>
    document.querySelector(`[data-rule="${rule}"]`).classList.toggle("is-met", ok),
  );
});

document.querySelectorAll("[data-reveal]").forEach((button) =>
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.reveal);
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.classList.toggle("is-revealed", reveal);
    button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
  }),
);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  const problem = passwordProblem(password.value);
  if (problem) {
    error.textContent = problem;
    password.focus();
    return;
  }
  if (confirm.value !== password.value) {
    error.textContent = "The two passwords don't match.";
    confirm.focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = "Saving…";
  try {
    await confirmPasswordReset(auth, code, password.value);
    show("done");
    document.querySelector('[data-state="done"] .button').focus();
  } catch (failure) {
    if (failure.code === "auth/expired-action-code" || failure.code === "auth/invalid-action-code") {
      showInvalid(failure);
      return;
    }
    error.textContent =
      failure.code === "auth/weak-password"
        ? "That password is too weak. Try a longer one."
        : failure.code === "auth/network-request-failed"
          ? "Couldn't reach the server. Check your internet connection and try again."
          : "Something went wrong. Please try again.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Save new password";
  }
});

if (!code) {
  showInvalid();
} else {
  verifyPasswordResetCode(auth, code)
    .then((email) => {
      document.querySelector("[data-email]").textContent = email;
      show("form");
      password.focus();
    })
    .catch(showInvalid);
}
