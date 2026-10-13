// Light / dark theme toggle (the sun/moon buttons marked [data-theme-toggle]).
//
// Until someone clicks, the site follows the computer's setting. A click saves the
// choice in this browser. The <head> of each page sets the theme before anything is
// drawn (no flash); this file handles the button, the animation and system changes.

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

function syncButtons() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", `Switch to ${next} mode`);
    button.title = `Switch to ${next} mode`;
    button.setAttribute("aria-pressed", String(currentTheme() === "dark"));
  });
}

function applyTheme(theme, { save = false } = {}) {
  root.dataset.theme = theme;
  if (save) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private mode etc.: the switch still works for this visit.
    }
  }
  syncButtons();
}

/** Switches theme; the new one spreads in a circle from the button. */
function toggleTheme(button) {
  const next = currentTheme() === "dark" ? "light" : "dark";

  if (reducedMotion.matches) {
    applyTheme(next, { save: true });
    return;
  }

  if (!document.startViewTransition) {
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

document.querySelectorAll("[data-theme-toggle]").forEach((button) =>
  button.addEventListener("click", () => toggleTheme(button)),
);

// No choice saved yet: keep following the computer's setting live.
systemDark.addEventListener("change", (event) => {
  if (!savedTheme()) applyTheme(event.matches ? "dark" : "light");
});

syncButtons();
