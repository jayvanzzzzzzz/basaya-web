// "Get the app" pop-up on the login page: QR code to download the Android app,
// a copy-link fallback, and a full-screen QR for showing a whole class.

const DOWNLOAD_URL = "https://github.com/jayvanzzzzzzz/BaSaya/releases/latest/download/BaSaya.apk";
const CLOSE_MS = 220;

const dialog = document.getElementById("get-app");
const presenter = dialog?.querySelector("[data-get-app-presenter]");
const copyButton = dialog?.querySelector("[data-get-app-copy]");
let opener = null;

function open(button) {
  opener = button;
  dialog.classList.remove("is-closing");
  dialog.showModal();
}

/** Plays the exit animation, then closes. */
function close() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  dialog.classList.add("is-closing");
  setTimeout(() => {
    dialog.classList.remove("is-closing");
    setPresenting(false);
    dialog.close();
    opener?.focus();
  }, CLOSE_MS);
}

function setPresenting(on) {
  presenter.hidden = !on;
  dialog.classList.toggle("is-presenting", on);
  if (on) presenter.querySelector("[data-get-app-present-close]")?.focus();
  else dialog.querySelector("[data-get-app-present]")?.focus({ preventScroll: true });
}

async function copyLink() {
  const label = copyButton.querySelector("span");
  try {
    await navigator.clipboard.writeText(DOWNLOAD_URL);
  } catch {
    // Older browsers / no permission: select the link so it can be copied by hand.
    const code = dialog.querySelector(".get-app__link code");
    const range = document.createRange();
    range.selectNodeContents(code);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    label.textContent = "Press Ctrl+C";
    return;
  }
  copyButton.classList.add("is-copied");
  label.textContent = "Copied!";
  clearTimeout(copyLink.timer);
  copyLink.timer = setTimeout(() => {
    copyButton.classList.remove("is-copied");
    label.textContent = "Copy link";
  }, 2000);
}

if (dialog) {
  document
    .querySelectorAll("[data-get-app-open]")
    .forEach((button) => button.addEventListener("click", () => open(button)));
  dialog.querySelector("[data-get-app-close]").addEventListener("click", close);
  dialog.querySelector("[data-get-app-present]").addEventListener("click", () => setPresenting(true));
  dialog
    .querySelector("[data-get-app-present-close]")
    .addEventListener("click", () => setPresenting(false));
  copyButton.addEventListener("click", copyLink);

  // Esc leaves full screen first, then closes (with the animation).
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    if (dialog.classList.contains("is-presenting")) setPresenting(false);
    else close();
  });

  // Click on the dimmed backdrop closes.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
}
