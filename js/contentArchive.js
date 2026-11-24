import { state } from './state.js';
import { postToApi } from './api.js';
import { escapeHtml as esc, openModal } from './helpers.js';
import { confirmAction } from './action-confirmation.js';

export const isArchived = item => item?.archived === true;
export const contentOwner = (item, kind) => kind === 'module'
  ? item?.ownerId || item?.createdBy : item?.teacherId || item?.createdBy || item?.ownerId;
export const isAdminLibraryContent = (item, kind, role) => kind === 'lesson' && role === 'admin' && item?.adminManaged === true && item.visibility !== 'private';
export const matchesContentScope = (item, kind, scope, uid, role = 'teacher') => scope === 'archived'
  ? isArchived(item) && (contentOwner(item, kind) === uid || role === 'admin') : !isArchived(item) && (scope !== 'mine' || contentOwner(item, kind) === uid || isAdminLibraryContent(item, kind, role));
export function canManageContent(item, kind) {
  return contentOwner(item, kind) === state.user.uid || (state.profile?.role === 'admin' && (kind === 'learningPath' || item.visibility !== 'private'));
}
export function archiveBadge(item) {
  return isArchived(item) ? '<span class="content-visibility content-visibility--archived"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/></svg>Archived</span>' : '';
}
export function archiveDetail(item) {
  return item.archiveModerated && isArchived(item) ? `<span class="content-moderation-note"><strong>Archived by an admin.</strong> ${esc(item.archiveReason || '')}${state.profile?.role === 'admin' ? '' : ' Contact an admin to request a review.'}</span>` : '';
}
export function archiveButtons(item, kind, { archiveOnly = false } = {}) {
  archiveOnly ||= kind === 'learningPath' && item.everAssigned === true;
  if (!canManageContent(item, kind)) return '';
  if (isArchived(item) && item.archiveModerated && state.profile?.role !== 'admin') return '';
  const icons = {
    archive: '<path d="M3 4h18v4H3zM5 8v12h14V8M10 12h4"/>',
    restore: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
    delete: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  };
  const entry = (action, label) => `<button type="button" role="menuitem" class="content-lifecycle-item${action === 'delete' ? ' content-lifecycle-item--danger' : ''}" data-content-lifecycle="${action}" data-kind="${kind}" data-id="${esc(item.id)}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[action]}</svg><span>${label}</span></button>`;
  return (item.deletionPending ? '' : entry(isArchived(item) ? 'restore' : 'archive', isArchived(item) ? 'Restore' : 'Archive')) + (archiveOnly ? '' : entry('delete', item.deletionPending ? 'Retry deletion' : 'Delete permanently'));
}
export function contentActionMenu(item, kind) {
  const entry = (attribute, label, icon) => `<button type="button" role="menuitem" class="content-lifecycle-item" ${attribute}="${esc(item.id)}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>${label}</span></button>`;
  const eye = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>';
  const pencil = '<path d="m15 5 4 4M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z"/>';
  const editModule = kind === 'module' && !isArchived(item)
    ? entry('data-module', 'Edit a copy', pencil) : '';
  const ownLesson = state.profile?.role === 'admin' || contentOwner(item, kind) === state.user.uid;
  const lessonActions = kind === 'lesson' ? entry('data-preview', 'Preview', eye) + (!isArchived(item) ? entry(ownLesson ? 'data-library-edit' : 'data-library-copy', ownLesson ? 'Edit lesson' : 'Edit a copy', pencil) : '') : '';
  const lifecycle = kind === 'module' ? contentOwner(item, kind) === state.user.uid ? archiveButtons(item, kind) : '' : archiveButtons(item, kind);
  const pathActions = kind === 'learningPath' && !isArchived(item) && contentOwner(item, kind) === state.user.uid ? entry('data-edit-path', 'Edit path', pencil) : '';
  const actions = pathActions + (kind === 'module' ? entry('data-preview-module', 'Preview', eye) : '') + editModule + lessonActions + lifecycle;
  return actions ? `<div class="content-actions"><button type="button" class="content-actions-toggle" data-content-menu-toggle data-floating-tooltip="More actions" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${esc(item.title || kind)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><div class="content-actions-popup" role="menu" hidden>${actions}</div></div>` : '';
}
export function closeContentMenus() {
  document.querySelectorAll('.content-actions-popup').forEach(menu => { menu.hidden = true; menu.previousElementSibling?.setAttribute('aria-expanded', 'false'); });
}
export function toggleContentMenu(button) {
  const menu = button.nextElementSibling, open = menu.hidden;
  closeContentMenus(); menu.hidden = !open; button.setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('button')?.focus();
}
document.addEventListener('click', event => { if (!event.target.closest('.content-actions')) closeContentMenus(); });
document.addEventListener('keydown', event => {
  const menu = event.target.closest('.content-actions-popup, .admin-lesson-menu-popup');
  if (!menu || menu.hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); const trigger = menu.previousElementSibling; closeContentMenus(); menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); }
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault(); const items = [...menu.querySelectorAll('button')]; const index = items.indexOf(document.activeElement);
    items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  }
});
async function moderationReason(item, action) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const label = action === 'delete' ? 'Delete permanently' : action === 'archive' ? 'Archive' : 'Restore';
    openModal(`<form data-moderation-form><h2 id="content-moderation-title">${label} Shared content</h2><p>Explain this action to the owner of “${esc(item.title || 'Untitled')}”.</p>${action === 'delete' ? '<p>Deletion cannot be undone. Content used by a class or student progress cannot be deleted.</p>' : ''}<label>Reason<textarea name="reason" required maxlength="500" rows="3"></textarea></label><div class="modal-actions"><button class="button secondary" type="button" data-cancel>Cancel</button><button class="button ${action === 'delete' ? 'danger' : 'primary'}" type="submit">${label}</button></div></form>`, (host, close) => {
      const form = host.querySelector('form');
      const modal = host.querySelector('.modal');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'content-moderation-title');
      const dismiss = () => { finish(null); close(); };
      host.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
        if (event.key === 'Tab') {
          const controls = [...modal.querySelectorAll('button:not(:disabled), textarea')];
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      });
      host.querySelector('[data-cancel]').onclick = dismiss;
      host.querySelector('.modal-close').addEventListener('click', () => finish(null));
      host.addEventListener('click', event => { if (event.target === host) finish(null); });
      form.onsubmit = event => { event.preventDefault(); const reason = form.elements.reason.value.trim(); if (!reason) return; finish(reason); close(); };
      form.elements.reason.focus();
    }, { beforeClose: () => { finish(null); return true; } });
  });
}
export async function updateContentArchive(item, kind, action, { onStart } = {}) {
  let reason = '';
  const label = action === 'delete' ? 'Delete permanently' : action === 'archive' ? 'Archive' : 'Restore';
  const ownerId = contentOwner(item, kind);
  if (ownerId && ownerId !== state.user.uid && !isAdminLibraryContent(item, kind, state.profile?.role)) {
    reason = await moderationReason(item, action);
    if (reason === null) return false;
  } else if (!await confirmAction({
    title: `${action === 'delete' ? 'Permanently delete' : label} this ${kind}?`,
    message: action === 'delete' ? `This cannot be undone. Deletion is blocked if a class, student progress or other content depends on it.${kind === 'module' ? ' Its lessons will not be deleted.' : ''}` : action === 'archive' ? `Hide it from the active library and new assignments. Existing classes and student progress remain available.${kind === 'module' ? ' Its lessons keep their own archive status.' : ''}` : 'Return it to the library with its previous Private or Shared visibility.',
    confirm: label,
    danger: action === 'delete',
  })) return false;
  onStart?.();
  await postToApi('content-lifecycle', { kind, id: item.id, action, reason });
  return true;
}
