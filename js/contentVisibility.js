// Shared means visible in the BaSaya staff library, never anonymous access.
import { confirmAction } from './action-confirmation.js';

export function showCopyEditRequired(kind = 'lesson', restrictedVisibility = false) {
  return confirmAction({
    title: 'Edit required to save a copy',
    message: `You have not changed this ${kind}'s title or content. To save a copy, edit ${kind === 'module' ? 'its title, description, lessons, or lesson order' : 'its title or lesson content'} first. Changing only library visibility does not create a copy.${restrictedVisibility ? ' Only the owner or an admin can change the original’s visibility.' : ''}`,
    confirm: 'Got it',
  });
}

export const visibilityOf = item => item?.visibility === 'private' ? 'private' : 'shared';
export function visibilityBadge(item) {
  const privateItem = visibilityOf(item) === 'private';
  const icon = privateItem ? '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>' : '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>';
  return `<span class="content-visibility content-visibility--${privateItem ? 'private' : 'shared'}" title="${privateItem ? 'Visible only in your library. Assigned students retain access.' : 'Available to teachers and admins in BaSaya.'}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${privateItem ? 'Private' : 'Shared'}</span>`;
}
export function visibilityField(value = 'private') {
 return `<label class="content-visibility-field">Library visibility<select name="visibility" aria-describedby="visibility-help"><option value="private" ${value === 'private' ? 'selected' : ''}>Private - Only you</option><option value="shared" ${value === 'shared' ? 'selected' : ''}>Shared - Teachers and admins</option></select><small id="visibility-help">Assigned students can access lessons through their class.</small></label>`;
}
