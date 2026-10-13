// reset-password.html: the page the BaSaya reset email links to
// (notify-api/api/send-password-reset.js). Firebase made the one-time code
// (?oobCode=…, valid 1 hour); this page checks it and saves the new password.

import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./firebase.js";

const MIN_LENGTH = 8;
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
    ? "Open the link straight from your email, or ask your school admin to send a new one."
    : "Reset links work for 1 hour and only once. Ask your school admin to send you a new one.";
  show("invalid");
}

/** 0–4, plus which rules pass. */
function strength(value) {
  const rules = {
    length: value.length >= MIN_LENGTH,
    mix: /[a-z]/i.test(value) && /\d/.test(value),
    case: (/[a-z]/.test(value) && /[A-Z]/.test(value)) || /[^a-z\d]/i.test(value),
  };
  let score = Object.values(rules).filter(Boolean).length;
  if (rules.length && value.length >= 12) score += 1;
  if (!rules.length) score = Math.min(score, 1);
  return { score: Math.min(score, 4), rules };
}

const LABELS = ["Use at least 8 characters", "Weak", "Fair", "Good", "Strong"];

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
  if (password.value.length < MIN_LENGTH) {
    error.textContent = `Your password needs at least ${MIN_LENGTH} characters.`;
    password.focus();
    return;
  }
  if (strength(password.value).score < 2) {
    error.textContent = "Please make it stronger: mix letters and numbers.";
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
