// Light / dark theme toggle (the sun/moon buttons marked [data-theme-toggle]).
//
// Until someone clicks, the site follows the computer's setting. A click saves the
// choice in this browser. The <head> of each page sets the theme before anything is
// drawn (no flash); this file handles the button, the animation and system changes.

import { syncThemeButtons } from "./theme-buttons.js";
export { syncThemeButtons } from "./theme-buttons.js";

const STORAGE_KEY = "basaya-theme";
const root = document.documentElement;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function savedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const currentTheme = () => (root.dataset.theme === "dark" ? "dark" : "light");

function applyTheme(theme, { save = false } = {}) {
  root.dataset.theme = theme;
  if (save) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode etc.: the switch still works for this visit.
    }
  }
  syncThemeButtons();
}

/** Switches theme; the new one spreads in a circle from the button. */
function toggleTheme(button, next = currentTheme() === "dark" ? "light" : "dark") {
  if (next === currentTheme()) {
    applyTheme(next, { save: true });
    return;
  }

  if (reducedMotion.matches) {
    applyTheme(next, { save: true });
    return;
  }

  // Keep the segmented control live so its highlight can slide during the change.
  if (button.matches("[data-theme-choice]") || !document.startViewTransition) {
    root.classList.add("theme-switching");
    applyTheme(next, { save: true });
    setTimeout(() => root.classList.remove("theme-switching"), 500);
    return;
  }

  const box = button.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  const transition = document.startViewTransition(() => applyTheme(next, { save: true }));
  transition.ready
    .then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 650,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      ),
    )
    .catch(() => {});
}

// Delegation supports controls rendered later by account settings.
document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-theme-toggle]");
  if (button) toggleTheme(button);
  const choice = event.target.closest?.("[data-theme-choice]");
  if (choice && ["light", "dark"].includes(choice.dataset.themeChoice)) {
    toggleTheme(choice, choice.dataset.themeChoice);
  }
});

// No choice saved yet: keep following the computer's setting live.
systemDark.addEventListener("change", (event) => {
  if (!savedTheme()) applyTheme(event.matches ? "dark" : "light");
});

syncThemeButtons();
