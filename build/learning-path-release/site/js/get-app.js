// "Get the app" pop-up on the login page: QR code to download the Android app, a copy-link fallback, and a full-screen QR for showing a whole class.

const DOWNLOAD_URL = "https://github.com/jayvanzzzzzzz/BaSaya/releases/latest/download/BaSaya.apk";
const CLOSE_MS = 220;

const dialog = document.getElementById("get-app");
const presenter = dialog?.querySelector("[data-get-app-presenter]");
const copyButton = dialog?.querySelector("[data-get-app-copy]");
const card = dialog?.querySelector(".get-app__card");
const copyStatus = dialog?.querySelector("[data-get-app-status]");
let opener = null;
let previousOverflow = "";
let closeTimer = null;

function open(button) {
  if (!dialog || dialog.open) return;
  opener = button;
  clearTimeout(closeTimer);
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  dialog.classList.remove("is-closing");
  dialog.showModal();
}

/** Plays the exit animation, then closes. */
function close() {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  dialog.classList.add("is-closing");
  closeTimer = setTimeout(() => {
    dialog.classList.remove("is-closing");
    dialog.close();
  }, CLOSE_MS);
}

function setPresenting(on) {
  presenter.hidden = !on;
  card.hidden = on;
  dialog.classList.toggle("is-presenting", on);
  dialog.setAttribute("aria-labelledby", on ? "get-app-present-title" : "get-app-title");
  dialog.setAttribute("aria-describedby", on ? "get-app-present-description" : "get-app-description");
  if (on) presenter.querySelector("[data-get-app-present-close]")?.focus();
  else dialog.querySelector("[data-get-app-present]")?.focus({ preventScroll: true });
}

async function copyLink() {
  const label = copyButton.querySelector("span");
  clearTimeout(copyLink.timer);
  copyButton.classList.remove("is-copied");
  copyStatus.textContent = "";
  try {
    await navigator.clipboard.writeText(DOWNLOAD_URL);
  } catch {
    // Older browsers / no permission: select the link so it can be copied by hand.
    const code = dialog.querySelector(".get-app__link code");
    code.classList.remove("sr-only");
    const range = document.createRange();
    range.selectNodeContents(code);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    label.textContent = "Select link";
    copyStatus.textContent = "Download link selected. Use your device's Copy command to copy it.";
    return;
  }
  copyButton.classList.add("is-copied");
  label.textContent = "Copied!";
  copyStatus.textContent = "Download link copied.";
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
  dialog.addEventListener("close", () => {
    clearTimeout(closeTimer);
    dialog.classList.remove("is-closing");
    setPresenting(false);
    document.body.style.overflow = previousOverflow;
    opener?.focus({ preventScroll: true });
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const view = presenter.hidden ? card : presenter;
    const controls = [...view.querySelectorAll('button:not(:disabled), a[href]')]
      .filter((control) => control.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });

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
