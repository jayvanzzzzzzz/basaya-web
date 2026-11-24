import { $, escapeHtml, openModal, time } from "../../js/helpers.js";
import { difficulty, icon } from "./lessonViewer.js";

// Before a lesson is saved under a title another lesson already has, the admin sees
// both lessons side by side and picks: rename, save under a free name, or save anyway.
// Styles: css/pages/duplicate-title.css.

const TITLE_MAX = 120;
const ICON_COPY = '<rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />';
const ICON_EQUAL = '<path d="M6 9.5h12M6 14.5h12" />';
const ICON_PEN = '<path d="m15 5 4 4M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" />';
const ICON_SPARK = '<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9 12 3.5Z" />';

/** "Pangngalan!", " pangngálan " and "PANGNGALAN" are the same title. */
const titleKey = (title = "") =>
  String(title)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();

export const sameTitle = (a, b) => Boolean(titleKey(a)) && titleKey(a) === titleKey(b);

/** Another lesson with this title (not `ignoreId`), or null. */
export function findDuplicate(title, lessons, ignoreId) {
  return lessons.find((lesson) => lesson.id !== ignoreId && sameTitle(lesson.title, title)) || null;
}

/** "Pangngalan (2)", or the next number nobody uses. */
function freeTitle(title, lessons) {
  const base = title.trim().replace(/\s*\(\d+\)$/, "");
  for (let n = 2; n < 100; n += 1) {
    const suffix = ` (${n})`;
    const candidate = base.slice(0, TITLE_MAX - suffix.length) + suffix;
    if (!findDuplicate(candidate, lessons)) return candidate;
  }
  return "";
}

function cardHtml(label, lesson, extra = "") {
  const meta = difficulty(lesson.difficulty);
  return `<article class="dup-card">
    <span class="dup-card__label">${escapeHtml(label)}</span>
    <div class="dup-card__body">
      <div class="dup-card__text">
        <strong title="${escapeHtml(lesson.title)}">${escapeHtml(lesson.title)}</strong>
        <span class="admin-lesson-difficulty ${meta.className}"><span aria-hidden="true"></span>${meta.label}</span>
      </div>
    </div>
    ${extra ? `<span class="dup-card__meta">${escapeHtml(extra)}</span>` : ""}
  </article>`;
}

/**
 * @param {{ title: string, difficulty: string }} draft  what's being saved
 * @param {object} match     the lesson that already has this title
 * @param {object[]} lessons every lesson, for finding a free name
 * @param {boolean} editing
 * @returns {Promise<{ action: "save" } | { action: "rename" } | { action: "save-as", title: string } | null>}
 *          null when the dialog is closed without a choice.
 */
export function confirmDuplicateTitle(draft, match, lessons, editing) {
  const verb = editing ? "Save" : "Publish";
  const suggestion = freeTitle(draft.title, lessons);

  return new Promise((resolve) => {
    openModal(
      `<div class="dup-title">
        <header class="dup-head">
          <span class="dup-head__icon">${icon(ICON_COPY)}</span>
          <div>
            <span class="dup-head__eyebrow">Duplicate title</span>
            <h2 id="dup-title-heading">“${escapeHtml(match.title)}” is already in the library</h2>
            <p>Teachers choose lessons by title, so two lessons with the same name are easy to mix up in class plans and reports.</p>
          </div>
        </header>

        <div class="dup-compare">
          ${cardHtml("Already in the library", match, match.updatedAt || match.createdAt ? `Last updated ${time(match.updatedAt || match.createdAt)}` : "")}
          <span class="dup-compare__equal" aria-label="Same title">${icon(ICON_EQUAL)}<small>Same title</small></span>
          ${cardHtml(editing ? "You're saving" : "You're publishing", draft, editing ? "Your changes" : "New lesson")}
        </div>

        ${
          suggestion
            ? `<button type="button" class="dup-fix" data-save-as>
                <span class="dup-fix__icon">${icon(ICON_SPARK)}</span>
                <span class="dup-fix__text">
                  <small>Quick fix · ${verb.toLowerCase()} under a new name</small>
                  <strong>${escapeHtml(suggestion)}</strong>
                </span>
                <span class="dup-fix__go" aria-hidden="true">${verb} →</span>
              </button>`
            : ""
        }

        <div class="modal-actions dup-actions">
          <button type="button" class="button secondary" data-proceed>${verb} anyway</button>
          <button type="button" class="button primary" data-rename>${icon(ICON_PEN)}Go back &amp; rename</button>
        </div>
      </div>`,
      (backdrop, close) => {
        const modal = backdrop.querySelector(".modal");
        modal.classList.add("dup-title-modal");
        modal.setAttribute("aria-labelledby", "dup-title-heading");

        let settled = false;
        const finish = (choice) => {
          if (settled) return;
          settled = true;
          watcher.disconnect();
          close();
          resolve(choice);
        };
        // Closing with × or the backdrop counts as "no choice".
        const watcher = new MutationObserver(() => {
          if (!backdrop.isConnected) finish(null);
        });
        watcher.observe(document.body, { childList: true });

        $("[data-rename]", modal).addEventListener("click", () => finish({ action: "rename" }));
        $("[data-proceed]", modal).addEventListener("click", () => finish({ action: "save" }));
        $("[data-save-as]", modal)?.addEventListener("click", () => finish({ action: "save-as", title: suggestion }));
        setTimeout(() => $("[data-rename]", modal).focus(), 50);
      },
    );
  });
}
