// "Forgot password?" pop-up on the login page. notify-api emails a BaSaya-branded
// reset link (api/forgot-password); if the API can't be reached, Firebase sends its
// plain one (the Firebase console's template points it at reset-password.html).
// The answer is the same whether or not the email has an account, so the form
// can't be used to find out who is registered.

import { sendResetLink } from "./api.js";
import { clearFieldErrors, fieldError } from "./field-errors.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLOSE_MS = 200;

const dialog = document.getElementById("forgot-password");
const form = dialog?.querySelector('[data-forgot-state="form"]');
const input = form?.elements.email;
const error = dialog?.querySelector("[data-forgot-error]");
const submit = form?.querySelector(".forgot__submit");
let opener = null;

function show(state) {
  dialog.querySelectorAll("[data-forgot-state]").forEach((element) => {
    element.hidden = element.dataset.forgotState !== state;
  });
}

function open(button) {
  opener = button;
  show("form");
  error.textContent = "";
  clearFieldErrors(form);
  // Start from whatever they already typed in the sign-in form.
  input.value = document.getElementById("email")?.value.trim() || input.value;
  dialog.classList.remove("is-closing");
  dialog.showModal();
  input.focus();
}

function close() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  dialog.classList.add("is-closing");
  setTimeout(() => {
    dialog.classList.remove("is-closing");
    dialog.close();
    opener?.focus();
  }, CLOSE_MS);
}

function setSending(sending) {
  submit.disabled = sending;
  submit.setAttribute("aria-busy", String(sending));
  submit.textContent = sending ? "Sending…" : "Send reset link";
}

async function send(event) {
  event.preventDefault();
  const email = input.value.trim();
  error.textContent = "";
  if (!EMAIL_PATTERN.test(email)) {
    fieldError(
      input,
      email
        ? "That doesn't look like an email address. Check it has an @ and a domain, like name@gmail.com."
        : input.dataset.missing,
    );
    input.focus();
    return;
  }

  setSending(true);
  try {
    await sendResetLink(email);
  } catch (failure) {
    // No account for this email: answer the same as a sent link.
    if (failure.code === "auth/invalid-email") {
      fieldError(input, "That doesn't look like an email address. Check it has an @ and a domain.");
      input.focus();
      return;
    }
    if (failure.code !== "auth/user-not-found") {
      error.textContent =
        failure.code === "auth/too-many-requests"
            ? "Too many tries. Wait a few minutes, then try again."
            : failure.code === "auth/network-request-failed"
              ? "Couldn't reach the server. Check your internet connection and try again."
              : "Something went wrong. Please try again.";
      return;
    }
  } finally {
    setSending(false);
  }
  dialog.querySelector("[data-forgot-email]").textContent = email;
  show("sent");
  dialog.querySelector('[data-forgot-state="sent"] .button').focus();
}

if (dialog) {
  document.querySelectorAll("[data-forgot-open]").forEach((button) =>
    button.addEventListener("click", () => open(button)),
  );
  dialog.querySelectorAll("[data-forgot-close]").forEach((button) => button.addEventListener("click", close));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  form.addEventListener("submit", send);
}
