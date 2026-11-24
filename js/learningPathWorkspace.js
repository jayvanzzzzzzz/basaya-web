import { state } from './state.js';
import { escapeHtml as esc, toast } from './helpers.js';
import { saveLearningPath } from './learningPaths.js';
import { previewModuleOrder } from './moduleOrderPreview.js';
import { moveLesson } from './moduleModel.js';
import { archiveBadge, archiveDetail, contentActionMenu, closeContentMenus, toggleContentMenu, matchesContentScope, updateContentArchive, contentOwner } from './contentArchive.js';
import { confirmAction } from './action-confirmation.js';
import { setButtonSaving } from './buttonSaving.js';
import { attachFloatingTooltips } from './floatingTooltip.js';
import { visibilityBadge, visibilityField } from './contentVisibility.js';

export function createLearningPathWorkspace({ paths, modules, lessons, refresh, isCurrent, redraw }) {
  let draft = null, initial = '', busy = false, requestKey = '', lastRequest = '';
  const snapshot = () => JSON.stringify(draft);
  const module = id => modules.find(item => item.id === id);
  const lessonTitle = id => lessons().find(item => item.id === id)?.title || 'Lesson unavailable';
  const preview = ids => ids.map(id => ({ title: module(id)?.title || 'Module unavailable', lessons: (module(id)?.lessonIds || []).map(lessonTitle) }));
  const start = (item = null) => { draft = { title: item?.title || '', visibility: item?.visibility || 'private', moduleIds: [...(item?.moduleIds || [])], ...(item ? { id: item.id, revision: item.revision } : {}) }; initial = snapshot(); requestKey = crypto.randomUUID(); };
  const reset = () => { draft = null; };
  let disposeRemoveTooltips, tooltipObserver;
  async function render(mount, scope) {
    disposeRemoveTooltips?.();
    tooltipObserver?.disconnect();
    if (!draft) {
      const items = paths.filter(item => matchesContentScope(item, 'learningPath', scope, state.user.uid, state.profile?.role));
      mount.innerHTML = `<section class="module-workspace learning-path-workspace"><div class="module-section-heading"><h2>Learning Paths</h2></div><p class="module-note">A learning path groups modules and their lessons. Set one deadline when assigning it to a class.</p><div class="module-directory">${items.length ? items.map(item => `<article class="module-card"><div><span class="eyebrow">${item.moduleIds.length} modules</span><h2>${esc(item.title)}</h2><div class="content-status-badges">${visibilityBadge(item)}${archiveBadge(item)}${item.everAssigned ? '<span class="content-visibility" title="Assigned paths cannot be deleted. Archive to preserve class access.">In use</span>' : ''}</div>${archiveDetail(item)}<ol>${item.moduleIds.map(id => `<li>${esc(module(id)?.title || 'Module unavailable')}</li>`).join('')}</ol></div><div class="module-row-actions">${contentActionMenu(item, 'learningPath')}</div></article>`).join('') : '<div class="module-empty"><h3>No learning paths here yet</h3><p>Create a path and select its modules.</p></div>'}</div></section>`;
      mount.onclick = async event => {
        event.stopPropagation(); if (busy) return;
        const target = event.target.closest('button'); if (!target) return;
        if (target.hasAttribute('data-content-menu-toggle')) { toggleContentMenu(target); return; }
        closeContentMenus();
        if (target.hasAttribute('data-new-path')) { start(); render(mount, scope); }
        else if (target.dataset.editPath) { start(paths.find(item => item.id === target.dataset.editPath)); render(mount, scope); }
        else if (target.dataset.contentLifecycle) {
          busy = true;
          try { if (await updateContentArchive(paths.find(item => item.id === target.dataset.id), 'learningPath', target.dataset.contentLifecycle)) { await refresh(); toast('Learning path updated.'); } }
          catch (error) { toast(error.message); } finally { busy = false; }
        }
      };
      return;
    }
    mount.innerHTML = `<section class="module-workspace learning-path-workspace"><form data-path-form><div class="module-details"><label>Learning Path Title<input name="title" required maxlength="120" value="${esc(draft.title)}" placeholder="e.g. Filipino 7 — Unang Markahan"></label>${visibilityField(draft.visibility)}<p class="module-note">Private paths stay in your library; admins can review them for moderation. Sharing a path requires Shared modules and lessons. Assigned classes retain access.</p></div><div class="module-columns"><section class="module-panel"><h2>Choose modules</h2><p>Add modules to this learning path.</p><div class="module-picker">${modules.filter(item => !item.archived).map(item => `<label class="module-choice"><input type="checkbox" data-path-pick="${esc(item.id)}" ${draft.moduleIds.includes(item.id) ? 'checked' : ''}><span><strong>${esc(item.title)}</strong><small>${item.lessonIds.length} lessons</small></span></label>`).join('') || '<p>Create a module first.</p>'}</div></section><section class="module-panel"><h2>Module and lesson order</h2><p>Use Move to to arrange modules. Lessons retain their saved order.</p><ol class="module-order">${draft.moduleIds.map((id, i) => `<li class="module-order-row"><span class="module-number">${i + 1}</span><div class="module-lesson-name"><strong>${esc(module(id)?.title || 'Module unavailable')}</strong><ol>${(module(id)?.lessonIds || []).map(lessonId => `<li>${esc(lessonTitle(lessonId))}</li>`).join('')}</ol></div><div class="path-order-controls"><label>Move to<select data-path-position="${i}" aria-label="Move module ${i + 1} to position">${draft.moduleIds.map((_, position) => `<option value="${position}" ${position === i ? 'selected' : ''}>Position ${position + 1}</option>`).join('')}</select></label><button type="button" class="button secondary path-remove-icon" data-path-remove="${i}" aria-label="Remove ${esc(module(id)?.title || 'module')} from learning path" data-floating-tooltip><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6m4-6v6"/></svg></button></div></li>`).join('') || '<li class="module-note">Choose at least one module.</li>'}</ol></section></div><footer class="module-save-bar"><span role="status" data-path-status>Review the full learning path before saving.</span><button type="button" class="button secondary" data-path-cancel>Cancel</button><button type="submit" class="button primary">Save learning path</button></footer></form></section>`;
    mount.onclick = async event => {
      event.stopPropagation(); if (busy) return;
      const target = event.target.closest('button'); if (!target) return;
      if (target.hasAttribute('data-path-cancel')) {
        if (snapshot() !== initial && !await confirmAction({ title: 'Discard learning path changes?', message: 'Your library modules and lessons remain available.', confirm: 'Discard changes', danger: true })) return;
        reset(); render(mount, scope);
      } else if (target.dataset.pathRemove !== undefined) { draft.moduleIds.splice(Number(target.dataset.pathRemove), 1); render(mount, scope); }
    };
    disposeRemoveTooltips = attachFloatingTooltips(mount, '[data-path-remove]');
    tooltipObserver = new MutationObserver(() => {
      if (!mount.isConnected || !mount.querySelector('[data-path-remove]')) { disposeRemoveTooltips?.(); tooltipObserver.disconnect(); }
    });
    tooltipObserver.observe(mount.parentElement, { childList: true, subtree: true });
    const form = mount.querySelector('form');
    form.oninput = event => { if (event.target.name === 'title') draft.title = event.target.value; };
    form.onchange = event => {
      if (busy) return;
      if (event.target.name === 'visibility') { draft.visibility = event.target.value; return; }
      const id = event.target.dataset.pathPick;
      if (id) {
        if (event.target.checked && draft.moduleIds.length >= 20) { event.target.checked = false; return toast('Choose up to 20 modules per learning path.'); }
        draft.moduleIds = event.target.checked ? [...draft.moduleIds, id] : draft.moduleIds.filter(item => item !== id); render(mount, scope);
      } else if (event.target.dataset.pathPosition !== undefined) { draft.moduleIds = moveLesson(draft.moduleIds, Number(event.target.dataset.pathPosition), Number(event.target.value)); render(mount, scope); }
    };
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      if (!draft.moduleIds.length || draft.moduleIds.some(id => !module(id) || module(id).archived)) return toast('Choose at least one available module.');
      const ids = draft.moduleIds.flatMap(id => module(id).lessonIds);
      if (draft.visibility === 'shared' && (draft.moduleIds.some(id => module(id).visibility === 'private') || ids.some(id => lessons().find(item => item.id === id)?.visibility === 'private'))) return toast('Share each private module and lesson first, or keep this learning path Private.');
      if (ids.length > 200 || new Set(ids).size !== ids.length) return toast('Use up to 200 lessons, with each lesson appearing once in the path.');
      if (!await previewModuleOrder(preview(draft.moduleIds), { title: draft.title, confirm: 'Save learning path', message: 'Review the modules and lessons in this learning path. Its class deadline is chosen during assignment.' }) || !isCurrent()) return;
      const fingerprint = snapshot();
      if (lastRequest !== fingerprint) requestKey = crypto.randomUUID();
      lastRequest = fingerprint;
      busy = true; setButtonSaving(form.querySelector('[type="submit"]'), true);
      form.querySelectorAll('input, select, button').forEach(control => control.disabled = true);
      try { await saveLearningPath({ ...draft, requestKey }); reset(); await refresh(); toast('Learning path saved.'); }
      catch (error) { toast(error.message); render(mount, scope); }
      finally { busy = false; }
    };
  }
  return { render, start, reset, dirty: () => Boolean(draft && snapshot() !== initial), busy: () => busy };
}
