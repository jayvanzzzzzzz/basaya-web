import { escapeHtml } from "../../js/helpers.js";

// When a lesson can't be published yet, this toast lists what's still empty, grouped by
// part. Selecting an item jumps to that field; the list shrinks as fields are filled and
// closes itself once nothing is left. Styles: css/pages/missing-checklist.css.

const ICON_ALERT = '<path d="M12 8v5M12 16.5v.01" /><circle cx="12" cy="12" r="9" />';
const ICON_CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5" />';
const ICON_CLOSE = '<path d="M6 6l12 12M18 6 6 18" />';
const ICON_ARROW = '<path d="M9 6l6 6-6 6" />';
const DONE_CLOSE_MS = 2600;

const svg = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * @param {HTMLElement} host  where the toast lives (the editor's backdrop, so it closes with it)
 * @param {{ verb: string, onJump: (item: object) => void }} options
 *        verb: "publish" or "save"; onJump: called with the item that was selected.
 * @returns {{ show: (items: object[]) => void, update: (items: object[]) => void }}
 *          items: [{ group, label }] in the order they appear in the editor.
 */
export function missingChecklist(host, { verb, onJump }) {
  let toast = null;
  let items = [];
  let doneTimer;

  const dismiss = () => {
    if (!toast) return;
    const leaving = toast;
    toast = null;
    clearTimeout(doneTimer);
    leaving.classList.add("is-leaving");
    leaving.addEventListener("animationend", () => leaving.remove(), { once: true });
    setTimeout(() => leaving.remove(), 400); // in case animations are off
  };

  const create = () => {
    toast = document.createElement("aside");
    toast.className = "missing-toast";
    toast.setAttribute("aria-labelledby", "missing-toast-title");
    toast.innerHTML = `
      <header class="missing-toast__head">
        <span class="missing-toast__icon" data-icon>${svg(ICON_ALERT)}</span>
        <div class="missing-toast__text">
          <strong id="missing-toast-title" data-title></strong>
          <span data-count aria-live="polite"></span>
        </div>
        <button type="button" class="missing-toast__close" data-close-checklist aria-label="Dismiss">${svg(ICON_CLOSE)}</button>
      </header>
      <div class="missing-toast__groups" data-groups></div>`;
    toast.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-checklist]")) {
        dismiss();
        return;
      }
      const button = event.target.closest("[data-jump]");
      if (button) onJump(items[Number(button.dataset.jump)]);
    });
    host.append(toast);
  };

  const render = () => {
    const groups = new Map();
    items.forEach((item, index) => {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group).push({ ...item, index });
    });

    toast.classList.remove("is-done");
    toast.querySelector("[data-icon]").innerHTML = svg(ICON_ALERT);
    toast.querySelector("[data-title]").textContent = `Fill these in to ${verb}`;
    toast.querySelector("[data-count]").textContent =
      `${plural(items.length, "field")} left · select one to go to it`;
    toast.querySelector("[data-groups]").innerHTML = [...groups]
      .map(
        ([group, list]) => `
          <section class="missing-group">
            <h3><span>${escapeHtml(group)}</span><b>${list.length}</b></h3>
            <ul>
              ${list
                .map(
                  (item) => `<li><button type="button" data-jump="${item.index}">
                    <span>${escapeHtml(item.label)}</span>${svg(ICON_ARROW)}
                  </button></li>`,
                )
                .join("")}
            </ul>
          </section>`,
      )
      .join("");
  };

  const showDone = () => {
    toast.classList.add("is-done");
    toast.querySelector("[data-icon]").innerHTML = svg(ICON_CHECK);
    toast.querySelector("[data-title]").textContent = "All set";
    toast.querySelector("[data-count]").textContent = `Everything is filled in. You can ${verb} now.`;
    toast.querySelector("[data-groups]").innerHTML = "";
    clearTimeout(doneTimer);
    doneTimer = setTimeout(dismiss, DONE_CLOSE_MS);
  };

  return {
    /** Opens the toast (or refreshes it) with these items. */
    show(next) {
      items = next;
      clearTimeout(doneTimer);
      if (!toast) create();
      render();
    },
    /** Refreshes an open toast; does nothing once it's closed. */
    update(next) {
      if (!toast) return;
      items = next;
      if (items.length) {
        clearTimeout(doneTimer);
        render();
      } else if (!toast.classList.contains("is-done")) {
        showDone();
      }
    },
  };
}
