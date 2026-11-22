// Gives every password field in the portals one show/hide eye button, the same
// one the login page has (css/components/forms.css .password-field). Views are
// rendered after load, so new fields are picked up as they appear. Fields that
// already have their own eye (login, register, reset password) are left alone.

const filipino = document.documentElement.lang === "fil";
const LABEL_SHOW = filipino ? "Ipakita ang password" : "Show password";
const LABEL_HIDE = filipino ? "Itago ang password" : "Hide password";

const EYE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
  <circle cx="12" cy="12" r="2.5" />
  <path class="password-field__slash" d="M4 4l16 16" />
</svg>`;

function setVisible(input, button, visible) {
  input.type = visible ? "text" : "password";
  button.setAttribute("aria-pressed", String(visible));
  button.setAttribute("aria-label", visible ? LABEL_HIDE : LABEL_SHOW);
}

function addToggle(input) {
  if (input.closest(".password-field, .reset-password")) return;

  const field = document.createElement("span");
  field.className = "password-field";
  input.before(field);
  field.append(input);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "password-field__toggle";
  button.innerHTML = EYE_ICON;
  field.append(button);
  setVisible(input, button, false);

  button.addEventListener("click", () => {
    setVisible(input, button, input.type === "password");
    input.focus();
  });
  // Hide the password again whenever its form is cleared.
  input.form?.addEventListener("reset", () => setVisible(input, button, false));
}

function scan(root) {
  if (root.matches?.('input[type="password"]')) addToggle(root);
  root.querySelectorAll?.('input[type="password"]').forEach(addToggle);
}

scan(document);
new MutationObserver((mutations) => {
  for (const mutation of mutations) mutation.addedNodes.forEach(scan);
}).observe(document.body, { childList: true, subtree: true });
