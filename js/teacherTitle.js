import { escapeHtml } from "./helpers.js";
import { TEACHER_TITLES, teacherName } from "./chat.js?v=teacher-title";

// The "How should students address you?" chips (Ma'am / Sir / Name only), used by the
// teacher's Account settings and the admin's teacher forms. Saved as users/{uid}.title.
// Styles: .title-chips in css/components/forms.css.

const CHOICES = [...Object.entries(TEACHER_TITLES), ["", "Name only"]];

export function titleChipsMarkup(selected = "", legend = "How should students address the teacher?") {
  const current = TEACHER_TITLES[selected] ? selected : "";
  return `<fieldset class="title-chips">
    <legend>${escapeHtml(legend)}</legend>
    ${CHOICES.map(
      ([value, label]) => `<label class="title-chips__chip">
        <input type="radio" name="title" value="${value}"${value === current ? " checked" : ""} />
        <span>${escapeHtml(label)}</span>
      </label>`,
    ).join("")}
  </fieldset>`;
}

/** "Ma'am", "Sir" or "" for a saved title. */
export const titleLabel = (title) => TEACHER_TITLES[title] || "";

/** "Magandang umaga, Ma'am Reyes" by time of day; the full name when no title is picked. */
export function greeting({ displayName = "", title = "" } = {}) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "umaga" : hour < 18 ? "hapon" : "gabi";
  const name = TEACHER_TITLES[title] ? teacherName(displayName, title) : displayName.trim();
  return name ? `Magandang ${part}, ${name}` : `Magandang ${part}!`;
}
