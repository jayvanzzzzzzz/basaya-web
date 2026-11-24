// confirm-password-change.html: the page an admin's approval email links to
// (notify-api/api/request-admin-password-change.js). ?token=… is the one-time
// code and ?action=approve|cancel the email button that was clicked. Nothing
// changes until a button here is pressed, so a mail scanner opening the link is harmless.

import { postToApi } from "./api.js";

const params = new URLSearchParams(location.search);
const token = params.get("token");
const action = params.get("action") === "cancel" ? "cancel" : "approve";

function show(state) {
  document.querySelectorAll("[data-state]").forEach((element) => {
    element.hidden = element.dataset.state !== state;
  });
}

function showInvalid(missing) {
  document.querySelector("[data-invalid-title]").textContent = missing
    ? "This link is incomplete"
    : "This link has expired or was already used";
  document.querySelector("[data-invalid-text]").textContent = missing
    ? "Open the link straight from your email."
    : "Approval links work for 30 minutes and only once. If you didn't approve it, your password was not changed. Sign in and ask again from Account settings.";
  show("invalid");
}

const send = (step) => postToApi("confirm-admin-password-change", { token, action: step });
const isGone = (error) => /expired|already used|incomplete/i.test(error.message);

document.querySelectorAll("[data-confirm]").forEach((button) =>
  button.addEventListener("click", async () => {
    const step = button.dataset.confirm;
    const card = button.closest("[data-state]");
    const buttons = card.querySelectorAll("button");
    const error = card.querySelector("[data-error]");
    const label = button.textContent;
    buttons.forEach((each) => (each.disabled = true));
    button.textContent = step === "approve" ? "Approving…" : "Cancelling…";
    error.textContent = "";
    try {
      await send(step);
      const done = step === "approve" ? "approved" : "cancelled";
      show(done);
      document.querySelector(`[data-state="${done}"] .button`).focus();
    } catch (failure) {
      if (isGone(failure)) return showInvalid(false);
      error.textContent = failure instanceof TypeError
        ? "Couldn't reach the server. Check your internet connection and try again."
        : failure.message;
    } finally {
      buttons.forEach((each) => (each.disabled = false));
      button.textContent = label;
    }
  }),
);

if (!token) {
  showInvalid(true);
} else {
  send("check")
    .then(({ email }) => {
      document.querySelectorAll("[data-email]").forEach((element) => (element.textContent = email));
      show(action);
      document.querySelector(`[data-state="${action}"] [data-confirm]`).focus();
    })
    .catch((failure) => {
      if (isGone(failure)) return showInvalid(false);
      document.querySelector('[data-state="checking"] p').textContent =
        "Couldn't check the link. Check your internet connection and reload the page.";
    });
}
