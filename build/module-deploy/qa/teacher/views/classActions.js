import { attachFloatingTooltips } from '../../js/floatingTooltip.js';
let cleanup;
export const leaveTeacherTooltips = () => { cleanup?.(); cleanup = null; };
export function watchTeacherTooltips() {
  leaveTeacherTooltips();
  cleanup = attachFloatingTooltips(document.getElementById('app-view') || document.body, '[data-teacher-tooltip]');
}
const svg = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const addLessonAction = id => `<button class="button primary lesson-add-button teacher-class-action" id="${id}" type="button" aria-label="Add lesson" data-floating-tooltip="Add lesson" data-teacher-tooltip>${svg('<path d="M12 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8M12 3v5h5M12 3l5 5v4M16 17h6m-3-3v6"/>')}</button>`;
export const reviewReadingsAction = classId => `<a class="button secondary lesson-add-button teacher-class-action" href="#/classes/${encodeURIComponent(classId)}/readings" aria-label="Review readings" data-floating-tooltip="Review readings" data-teacher-tooltip>${svg('<path d="M4 13v-2a8 8 0 0 1 16 0v2M4 11H3v7h4v-7H4Zm16 0h1v7h-4v-7h3ZM13 21h4a3 3 0 0 0 3-3"/>')}<span class="class-reading-count" data-reading-notice-dot hidden aria-hidden="true"></span></a>`;
