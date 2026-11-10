// Shared by dynamically rendered account controls and the theme controller.
export function syncThemeButtons() {
  const dark = document.documentElement.dataset.theme === "dark";
  const next = dark ? "light" : "dark";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", `Switch to ${next} mode`);
    button.title = `Switch to ${next} mode`;
    button.setAttribute("aria-pressed", String(dark));
  });
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === (dark ? "dark" : "light")));
  });
}
