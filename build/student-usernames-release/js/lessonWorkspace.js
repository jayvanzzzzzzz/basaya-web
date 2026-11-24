import { contentAvatar } from './contentAvatar.js';
import { canManageContent, isArchived, matchesContentScope, archiveBadge, archiveDetail, contentActionMenu, closeContentMenus, toggleContentMenu, updateContentArchive } from './contentArchive.js';
import { showCopyEditRequired, visibilityBadge, visibilityField } from './contentVisibility.js';
import { state, getAllLessons } from './state.js';
import { $, escapeHtml as esc, page, toast } from './helpers.js';
import { confirmAction } from './action-confirmation.js';
import { captureRoute } from './route-lifecycle.js';
import { setLessonLeaveGuard } from './lessonNavigation.js';
import { loadModules, saveModule } from './modules.js';
import { contentBaseTitle, moveLesson } from './moduleModel.js';
import { openInlineLessonEditor, renderLessons } from '../admin/views/lessons.js';
import { openLessonViewer } from '../admin/views/lessonViewer.js';
import { attachFloatingTooltips } from './floatingTooltip.js';
import { previewModuleOrder } from './moduleOrderPreview.js';
import { setButtonSaving } from './buttonSaving.js';
import { beginContentOperation } from './contentOperation.js';
import { loadLearningPaths } from './learningPaths.js';
import { createLearningPathWorkspace } from './learningPathWorkspace.js';

const button = (label, action, primary = false) => `<button type="button" class="button ${primary ? 'primary' : 'secondary'}" data-action="${action}">${label}</button>`;
const previewButton = item => `<button type="button" class="button secondary small module-preview" data-preview="${esc(item.id)}" aria-label="Preview ${esc(item.title || 'lesson')}" data-floating-tooltip><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button>`;

export async function renderLessonWorkspace() {
  const isCurrent = captureRoute('/lessons');
  const [, modules, paths] = await Promise.all([getAllLessons(), loadModules({ includeArchived: true }), loadLearningPaths({ includeArchived: true })]);
  if (!isCurrent()) return;
  const admin = state.profile?.role === 'admin';
  let draft = null, moduleSource = null, initial = '', busy = false, tab = 'modules', search = '', scope = 'all';
  let moduleDrafts = [], activeModule = 0;
  const authoredHere = new Set();
  const orderChanges = new WeakMap();
  const content = $('#page-content');
  const pathWorkspace = createLearningPathWorkspace({ paths, modules, lessons: () => state.allLessons, refresh: refreshContent, isCurrent });
  const lesson = id => state.allLessons.find(item => item.id === id);
  const snapshot = () => draft ? JSON.stringify(moduleDrafts.map(({ values }) => [values.title, values.description, values.visibility, values.lessonIds])) : '';
  const dirty = () => snapshot() !== initial || pathWorkspace.dirty();
  const mayLeave = async () => !busy && !pathWorkspace.busy() && (!dirty() || await confirmAction({ title: 'Discard unsaved changes?', message: 'Your learning path or module changes have not been saved. Lessons already saved to the library will remain there.', confirm: 'Discard changes', danger: true }));
  const guard = () => setLessonLeaveGuard(mayLeave, () => busy || dirty(), state.user.uid);
  guard();
  const report = error => { console.error(error); toast(error.message || 'Could not complete this action. Please try again.'); };
  const ribbons = () => `<div class="module-tabs student-ribbons" role="group" aria-label="Lesson views">${[['paths','Learning Paths'],['modules','Modules'],['library','Lesson library']].map(([id,label]) => `<button type="button" class="student-ribbon module-ribbon" data-action="${id}" aria-pressed="${tab === id}"><span class="student-ribbon__label">${label}</span></button>`).join('')}</div>`;

  const inScope = (item, kind) => matchesContentScope(item, kind, scope, state.user.uid, state.profile?.role);
  const scopeRibbons = () => {
    const kind = tab === 'paths' ? 'learningPath' : tab === 'modules' ? 'module' : 'lesson';
    const collection = kind === 'learningPath' ? paths : kind === 'module' ? modules : state.allLessons;
    return '<nav class="content-scope-ribbons student-ribbons" aria-label="Library collection">' + [['all','All'],['mine','Created by me'],['archived','Archived']].map(([id,label]) => '<button type="button" class="student-ribbon module-ribbon" data-scope="'+id+'" aria-pressed="'+(scope === id)+'"><span class="student-ribbon__label">'+label+'</span><span class="content-scope-count">'+collection.filter(item => matchesContentScope(item,kind,id,state.user.uid,state.profile?.role)).length+'</span></button>').join('') + '</nav>';
  };
  const moderationNotices = () => {
    const notices = [...modules.map(item => ({...item, kind:'module'})), ...state.allLessons.map(item => ({...item,kind:'lesson'}))].filter(item => item.archived && item.archiveModerated && (item.ownerId || item.teacherId) === state.user.uid);
    return notices.length ? '<aside class="content-moderation-notices" aria-label="Content moderation updates"><strong>Content updates from your admin</strong>' + notices.map(item => '<p>'+esc(item.title)+' — '+esc(item.archiveReason || 'Archived for review.')+'</p>').join('') + [...new Set(notices.map(item => item.kind))].map(kind => '<button type="button" class="button secondary small" data-notice-kind="'+kind+'">Review archived '+(kind === 'module' ? 'modules' : 'lessons')+'</button>').join(' ') + '</aside>' : '';
  };
  async function refreshContent() {
    const [, freshModules, freshPaths] = await Promise.all([getAllLessons({ includeArchived: true }), loadModules({ includeArchived: true }), loadLearningPaths({ includeArchived: true })]);
    modules.splice(0, modules.length, ...freshModules);
    paths.splice(0, paths.length, ...freshPaths);
    if (isCurrent()) render();
  }
  async function archiveContent(item, kind, actionName, source) {
    busy = true;
    let feedback;
    try {
      if (await updateContentArchive(item, kind, actionName, {
        onStart: () => { feedback = beginContentOperation(source, actionName, item.title); },
      })) {
        await feedback?.complete();
        await refreshContent();
        toast(actionName === 'delete' ? 'Content permanently deleted.' : actionName === 'archive' ? 'Moved to Archived. Existing classes keep access.' : 'Content restored.');
      }
    } finally { feedback?.dispose(); busy = false; }
  }

  function previewTooltips() {
    const host = content.querySelector('[data-workspace-body] .module-workspace') || content.querySelector('.module-workspace');
    if (!host?.querySelector('.module-preview, .content-actions-toggle')) return;
    const dispose = attachFloatingTooltips(host, '.module-preview[data-floating-tooltip], .content-actions-toggle[data-floating-tooltip]');
    const observer = new MutationObserver(() => {
      if (!host.isConnected) { dispose(); observer.disconnect(); }
    });
    observer.observe(content, { childList: true, subtree: true });
  }

  // The navigation owns its DOM; list renderers may only replace this body.
  function directoryBody() {
    let shell = content.querySelector('[data-workspace-directory]');
    if (!shell) {
      header();
      content.innerHTML = '<section data-workspace-directory><section class="module-workspace module-library-tabs" data-workspace-navigation>'+ribbons()+scopeRibbons()+'<div data-workspace-notices></div></section><div data-workspace-body></div></section>';
      shell = content.querySelector('[data-workspace-directory]');
    }
    const kind = tab === 'paths' ? 'learningPath' : tab === 'modules' ? 'module' : 'lesson';
    const items = kind === 'learningPath' ? paths : kind === 'module' ? modules : state.allLessons;
    shell.querySelectorAll('.module-tabs [data-action]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.action === tab)));
    shell.querySelectorAll('[data-scope]').forEach(control => {
      control.setAttribute('aria-pressed', String(control.dataset.scope === scope));
      control.querySelector('.content-scope-count').textContent = items.filter(item => matchesContentScope(item, kind, control.dataset.scope, state.user.uid, state.profile?.role)).length;
    });
    const notices = shell.querySelector('[data-workspace-notices]');
    const html = moderationNotices();
    if (notices.innerHTML !== html) notices.innerHTML = html;
    return shell.querySelector('[data-workspace-body]');
  }

  function renderAdminLibrary(mount) {
    // Loaded once on entry and refreshed after mutations, never on filter clicks.
    renderLessons({ items: state.allLessons, mount, preserveHeader: true,
      onEdit: item => editLesson(item), onRefresh: refreshContent,
      filter: item => inScope(item, 'lesson') }).catch(report);
  }

  function header() {
    page(draft ? (draft.id ? 'Edit module' : 'Create module') : 'Lessons',
      draft ? 'Choose lessons, then arrange their learning order.' : 'Organize reusable lessons into modules.',
      draft ? button('Back to Lessons', 'back') : button('Create module', 'new-module', true) + button('Create lesson', 'new-lesson'),
      draft ? { crumbs: [{ label: 'Lessons', href: '#/lessons' }] } : {});
    $('#page-header').onclick = event => {
      if (draft && event.target.closest('a[href="#/lessons"]')) {
        event.preventDefault();
        const back = $('#page-header [data-action="back"]');
        back?.click();
      } else action(event);
    };
  }

  async function editLesson(item = null, inModule = false, forceCopy = false) {
    if (busy) return;
    if (isArchived(item)) return toast('Restore this lesson before editing or copying it.');
    const copy = Boolean(item && (forceCopy || (inModule && !authoredHere.has(`${draft.draftKey}:${item.id}`))));
    let editorGuard = async () => true, editorDirty = () => false;
    busy = true;
    try {
      await openInlineLessonEditor(item, {
        copy,
        isCurrent,
        mount(html, mountEditor) {
          page(copy ? 'Edit a lesson copy' : item ? 'Edit lesson' : 'Create lesson',
            draft ? `Lessons → ${draft.title || 'New module'}` : 'Lessons → Lesson library', button('Back', 'back'));
          content.innerHTML = `<section class="module-workspace"><p class="module-note">${copy ? 'Content changes save a new lesson. Keeping its title adds the next - 1.x suffix; a new title is saved as entered. The source stays unchanged.' : 'Save this lesson to your library' + (inModule ? ' and add it to this module.' : '.')}</p><div class="lesson-inline-editor">${html}</div></section>`;
          const host = content.querySelector('.lesson-inline-editor');
          mountEditor(host, () => host.remove());
        },
        onGuard(check, changed) { editorGuard = check; editorDirty = changed; },
        onCancel() { busy = false; guard(); render(); },
        async onSaved(id) {
          await getAllLessons();
          if (!isCurrent()) return;
          if (inModule) {
            // Session-only marker: later module edits copy again, preserving prior reuse.
            authoredHere.add(`${draft.draftKey}:${id}`);
            const index = item ? draft.lessonIds.indexOf(item.id) : -1;
            if (index >= 0) draft.lessonIds[index] = id;
            else if (!draft.lessonIds.includes(id)) draft.lessonIds.push(id);
          }
          busy = false; guard(); render();
        },
      });
      busy = false;
      if (!isCurrent()) return;
      // Leaving Lessons checks both the nested editor and its parent module.
      setLessonLeaveGuard(async () => await editorGuard() && await mayLeave(), () => editorDirty() || dirty(), state.user.uid);
      $('#page-header').onclick = async event => {
        const target = event.target.closest('[data-action="back"], a');
        if (!target) return;
        event.preventDefault();
        if (await editorGuard()) { guard(); render(); }
      };
    } catch (error) { busy = false; report(error); guard(); render(); }
  }

  function renderPicker() {
    const q = search.toLocaleLowerCase();
    const available = state.allLessons.filter(item => !isArchived(item) && (!q || `${item.title} ${item.description || ''}`.toLocaleLowerCase().includes(q)));
    const host = content.querySelector('[data-picker]');
    host.innerHTML = available.length ? available.map(item => `<label class="module-choice"><input type="checkbox" data-pick="${esc(item.id)}" ${draft.lessonIds.includes(item.id) ? 'checked' : ''}><span><strong>${esc(item.title)}</strong>${visibilityBadge(item)}<small>${esc(item.description || 'Premade lesson')}</small></span>${previewButton(item)}</label>`).join('') : '<p class="module-note">No lessons match your search.</p>';
  }

  function renderOrder(focusIndex = null, message = null) {
    const host = content.querySelector('[data-order]');
    let change = orderChanges.get(draft);
    if (change && JSON.stringify(change.after) !== JSON.stringify(draft.lessonIds)) {
      orderChanges.delete(draft);
      change = null;
    }
    host.innerHTML = draft.lessonIds.length ? draft.lessonIds.map((id, i) => {
      const item = lesson(id);
      const positions = draft.lessonIds.map((_, position) => `<option value="${position}" ${position === i ? 'selected' : ''}>Position ${position + 1}${position === 0 ? ' — First' : position === draft.lessonIds.length - 1 ? ' — Last' : ''}</option>`).join('');
      return `<li class="module-order-row${focusIndex === i ? ' is-moved' : ''}" data-index="${i}"><span class="module-number">${i + 1}</span><div class="module-lesson-name"><strong>${esc(item?.title || 'Lesson unavailable')}</strong><small>${item ? 'Lesson ' + (i + 1) : 'Remove this missing lesson before saving.'}</small></div><div class="module-row-actions"><label class="module-move-control">Move to<select data-move-to="${i}" aria-label="Move ${esc(item?.title || 'lesson ' + (i + 1))} to position" ${draft.lessonIds.length < 2 ? 'disabled' : ''}>${positions}</select></label>${item ? `<button type="button" class="button secondary small" data-edit="${esc(id)}">${authoredHere.has(`${draft.draftKey}:${id}`) ? 'Edit' : 'Edit a copy'}</button>` : ''}<button type="button" class="button secondary small" data-remove="${esc(id)}">Remove</button></div></li>`;
    }).join('') : '<li class="module-note">Select premade lessons or create a new lesson to begin.</li>';
    content.querySelector('[data-count]').textContent = `${draft.lessonIds.length} ${draft.lessonIds.length === 1 ? 'lesson' : 'lessons'}`;
    content.querySelector('[data-order-status]').textContent = message ?? change?.message ?? '';
    content.querySelector('[data-undo-order]').hidden = !change;
    if (focusIndex !== null) host.querySelector(`[data-move-to="${focusIndex}"]`)?.focus();
  }

  function render() {
    if (!isCurrent()) return;
    content.onclick = event => action(event);
    if (!draft) {
      const body = directoryBody();
      body.onclick = null;
      if (tab === 'paths') { pathWorkspace.render(body, scope); return; }
      if (admin && tab === 'library') { renderAdminLibrary(body); return; }
      const visibleModules = modules.filter(item => inScope(item, 'module'));
      body.innerHTML = `<section class="module-workspace">${scope === 'archived' ? '<p class="module-note">Archived content is hidden from new assignments. Existing classes and student progress remain available.</p>' : ''}${tab === 'modules' ? `<div class="module-directory">${visibleModules.length ? visibleModules.map(item => `<article class="module-card"><div><div class="content-item-heading">${contentAvatar('module')}<div class="content-item-heading__text"><span class="eyebrow">${item.lessonIds.length} lessons</span><h2>${esc(item.title)}</h2><div class="content-status-badges">${visibilityBadge(item)}${archiveBadge(item)}</div></div></div><p>${esc(item.description || 'A sequence of lessons for your students.')}</p>${archiveDetail(item)}<ol>${item.lessonIds.map(id => `<li>${esc(lesson(id)?.title || 'Lesson unavailable')}</li>`).join('')}</ol></div><div class="module-row-actions">${contentActionMenu(item, 'module')}</div></article>`).join('') : `<div class="module-empty"><h2>${scope === 'archived' ? 'No archived modules' : scope === 'mine' ? 'No modules created by you yet' : 'Create your first module'}</h2><p>${scope === 'archived' ? 'Modules you archive will appear here. Archiving a module keeps its lessons unchanged.' : 'Choose lessons and arrange their learning order.'}</p>${scope !== 'archived' ? button('Create module', 'new-module', true) : ''}</div>`}</div>` : '<label>Search lessons<input data-library-search type="search" placeholder="Find a lesson"></label><div data-library-list></div>'}</section>`;
      if (tab === 'library') {
        const draw = query => {
          const items = state.allLessons.filter(item => inScope(item, 'lesson') && `${item.title} ${item.description || ''}`.toLowerCase().includes(query.toLowerCase()));
          content.querySelector('[data-library-list]').innerHTML = items.length ? items.map(item => `<article class="module-library-row"><div class="content-item-heading">${contentAvatar('lesson')}<div class="content-item-heading__text"><h3>${esc(item.title)}</h3>${visibilityBadge(item)}${archiveBadge(item)}${archiveDetail(item)}<p>${esc(item.description || '')}</p></div></div><div class="module-row-actions">${previewButton(item)}${!isArchived(item) ? (admin || item.teacherId === state.user.uid ? `<button class="button secondary small" type="button" data-library-edit="${esc(item.id)}">Edit lesson</button>` : `<button class="button secondary small" type="button" data-library-copy="${esc(item.id)}">Edit a copy</button>`) : ''}${contentActionMenu(item, 'lesson')}</div></article>`).join('') : '<p>No lessons found.</p>';
        };
        draw(''); content.querySelector('[data-library-search]').oninput = event => draw(event.target.value);
      }
      previewTooltips();
      return;
    }
    header();
    content.innerHTML = `<section class="module-workspace"><form data-module-form><div class="module-details"><label>Module title<input name="title" maxlength="120" required value="${esc(draft.title)}" placeholder="e.g. Mga Bahagi ng Pananalita"></label><label>Description<textarea name="description" maxlength="1000" placeholder="What will students learn?">${esc(draft.description)}</textarea></label>${visibilityField(draft.visibility)}</div><div class="module-columns"><section class="module-panel"><div class="module-section-heading"><h2>Premade lessons</h2>${button('Create new lesson', 'module-lesson')}</div><p>Select as many lessons as you need. Editing one saves a separate copy to the library.</p><label>Find a lesson<input data-search type="search" value="${esc(search)}" placeholder="Search by title or description"></label><div class="module-picker" data-picker></div></section><section class="module-panel"><div class="module-section-heading"><h2>Learning order</h2><span data-count aria-live="polite"></span></div><p>Choose a position to change the lesson sequence.</p><ol class="module-order" data-order></ol><div class="module-order-feedback"><span data-order-status role="status" aria-atomic="true"></span><button type="button" class="button secondary small" data-undo-order hidden>Undo</button></div><p class="module-note">Lesson order is saved with this module.</p></section></div><footer class="module-save-bar"><span data-save-status role="status">Review the lesson order before saving.</span>${button('Cancel', 'back')}<button type="submit" class="button primary">${moduleSource ? 'Save changes' : 'Save module'}</button></footer></form></section>`;
    const formHost = content.querySelector('[data-module-form]');
    formHost.insertAdjacentHTML('afterbegin', `<section class="module-panel module-batch"><div class="module-section-heading"><h2>Module order</h2>${button('Add another module', 'another-module')}</div><p>Choose a module to edit its lessons. New modules go at the end.</p><ol class="module-batch-list">${moduleDrafts.map(({ values }, i) => `<li><button type="button" class="button secondary" data-switch-module="${i}" aria-pressed="${i === activeModule}">${i + 1}. ${esc(values.title || 'Untitled module')}</button><button type="button" class="button secondary small" data-move-module="${i}" data-direction="-1" aria-label="Move module ${i + 1} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="button secondary small" data-move-module="${i}" data-direction="1" aria-label="Move module ${i + 1} down" ${i === moduleDrafts.length - 1 ? 'disabled' : ''}>↓</button>${moduleDrafts.length > 1 ? `<button type="button" class="button secondary small" data-remove-module="${i}">Remove</button>` : ''}</li>`).join('')}</ol></section>`);
    if (moduleDrafts.length > 1) formHost.querySelector('[type="submit"]').textContent = 'Save modules';
    renderPicker(); renderOrder();
    previewTooltips();
    const form = content.querySelector('form');
    form.oninput = event => { if (event.target.name) { draft[event.target.name] = event.target.value; if (event.target.name === 'title') form.querySelector(`[data-switch-module="${activeModule}"]`).textContent = `${activeModule + 1}. ${draft.title || 'Untitled module'}`; } };
    content.querySelector('[data-search]').oninput = event => { search = event.target.value; renderPicker(); };
    const moduleContentChanged = () => moduleSource && (draft.title.trim() !== contentBaseTitle(moduleSource) || draft.description.trim() !== (moduleSource.description || '') || JSON.stringify(draft.lessonIds) !== JSON.stringify(moduleSource.lessonIds));
    form.onchange = event => {
      if (busy) return;
      if (event.target.hasAttribute('data-move-to')) {
        const from = Number(event.target.dataset.moveTo), to = Number(event.target.value);
        if (!Number.isInteger(to) || to < 0 || to >= draft.lessonIds.length || from === to) return;
        const before = [...draft.lessonIds];
        const title = lesson(before[from])?.title || 'Lesson';
        draft.lessonIds = moveLesson(before, from, to);
        orderChanges.set(draft, { before, after: [...draft.lessonIds], from, message: `${title} moved to position ${to + 1} of ${draft.lessonIds.length}.` });
        renderOrder(to);
        return;
      }
      if (event.target.name === 'visibility') {
        draft.visibility = event.target.value;
        return;
      }
      const id = event.target.dataset.pick;
      if (!id) return;
      if (event.target.checked && draft.lessonIds.length >= 100) { event.target.checked = false; toast('A module can contain up to 100 lessons.'); return; }
      draft.lessonIds = event.target.checked ? [...draft.lessonIds, id] : draft.lessonIds.filter(value => value !== id);
      renderOrder();
    };
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      for (let i = 0; i < moduleDrafts.length; i++) {
        const values = moduleDrafts[i].values;
        if (!values.title.trim() || !values.lessonIds.length || values.lessonIds.some(id => !lesson(id) || isArchived(lesson(id)))) {
          activeModule = i; draft = values; moduleSource = moduleDrafts[i].source; render();
          toast('Each module needs a title and at least one available lesson.'); return;
        }
      }
      if (moduleSource && moduleDrafts.length === 1) {
        const changed = moduleContentChanged();
        if (!changed && (draft.visibility === (moduleSource.visibility || 'shared') || !canManageContent(moduleSource, 'module'))) {
          await showCopyEditRequired('module', draft.visibility !== (moduleSource.visibility || 'shared') && !canManageContent(moduleSource, 'module'));
          return;
        }
      }
      if (!await previewModuleOrder(moduleDrafts.map(({ values }) => ({ title: values.title, lessons: values.lessonIds.map(id => lesson(id).title) })), {
        confirm: moduleDrafts.length > 1 ? 'Save modules' : moduleSource ? (moduleContentChanged() ? 'Save new version' : 'Update visibility') : 'Save module',
        message: 'Review the module order and lessons below. Content edits save separate versions; existing class assignments keep their content. Class order is chosen when assigning these modules.'
      }) || !isCurrent()) return;
      busy = true; const submit = form.querySelector('[type="submit"]'); setButtonSaving(submit, true);
      form.querySelectorAll('input, textarea, select, button').forEach(field => field.disabled = true);
      const status = form.querySelector('[data-save-status]'); status.textContent = 'Saving module…';
      try {
        let outcome;
        while (moduleDrafts.length) {
          const entry = moduleDrafts[0];
          status.textContent = `Saving ${entry.values.title}…`;
          const id = await saveModule(entry.source, entry.values);
          const saved = { ...entry.values, id };
          const index = modules.findIndex(item => item.id === id);
          if (index >= 0) modules.splice(index, 1);
          modules.unshift(saved);
          outcome = entry.values.changeKind;
          moduleDrafts.shift(); // Successful writes are never repeated after a later failure.
        }
        if (!isCurrent()) return;
        draft = null; moduleSource = null; initial = ''; search = ''; toast(outcome === 'none' ? 'No changes to save.' : outcome === 'visibility' ? 'Library visibility updated.' : 'Module saved. The source and existing class assignments stay unchanged.');
        busy = false; guard(); render();
      } catch (error) {
        report(error); activeModule = 0; draft = moduleDrafts[0].values; moduleSource = moduleDrafts[0].source;
        busy = false; render(); content.querySelector('[data-save-status]').textContent = `${error.message} Saved modules are in the library; remaining modules are kept here for retry.`;
      }
      finally { busy = false; setButtonSaving(submit, false); }
    };
  }

  async function action(event) {
    const target = event.target.closest('button'); if (!target || busy) return;
    try {
      if (target.hasAttribute('data-content-menu-toggle')) { toggleContentMenu(target); }
      else if (target.dataset.noticeKind) { tab = target.dataset.noticeKind === 'module' ? 'modules' : 'library'; scope = 'archived'; render(); }
      else if (target.dataset.scope) { if (scope !== target.dataset.scope && await mayLeave()) { pathWorkspace.reset(); scope = target.dataset.scope; render(); } }
      else if (target.dataset.contentLifecycle) {
        const genericTrigger = target.closest('.content-actions')?.querySelector('[data-content-menu-toggle]');
        closeContentMenus(); genericTrigger?.focus();
        const adminPopup = target.closest('.admin-lesson-menu-popup');
        if (adminPopup) { adminPopup.hidden = true; adminPopup.previousElementSibling?.setAttribute('aria-expanded', 'false'); adminPopup.previousElementSibling?.focus(); }
        const kind = target.dataset.kind;
        const item = (kind === 'module' ? modules : state.allLessons).find(entry => entry.id === target.dataset.id);
        if (item) await archiveContent(item, kind, target.dataset.contentLifecycle, target);
      }
      else if (target.dataset.action === 'new-module' || target.dataset.module) {
        if (!await mayLeave()) return;
        pathWorkspace.reset();
        const saved = modules.find(item => item.id === target.dataset.module);
        if (isArchived(saved)) return toast('Restore this module before editing or reusing it.');
        moduleSource = saved || null;
        draft = saved ? { ...saved, title: contentBaseTitle(saved), lessonIds: [...saved.lessonIds] } : { title: '', description: '', lessonIds: [] };
        delete draft.saveRequestKey;
        draft.visibility ||= 'private'; draft.draftKey = crypto.randomUUID(); moduleDrafts = [{ values: draft, source: moduleSource }]; activeModule = 0; initial = snapshot(); search = ''; guard(); render();
      } else if (target.dataset.action === 'another-module') {
        if (!content.querySelector('[data-module-form]').reportValidity()) return;
        if (!draft.lessonIds.length) return toast('Add a lesson to this module first.');
        if (moduleDrafts.length >= 20) return toast('Save this set before adding more modules.');
        draft = { title: '', description: '', visibility: 'private', lessonIds: [], draftKey: crypto.randomUUID() };
        moduleSource = null; moduleDrafts.push({ values: draft, source: null }); activeModule = moduleDrafts.length - 1; search = ''; render();
      } else if (target.dataset.switchModule !== undefined) {
        activeModule = Number(target.dataset.switchModule); draft = moduleDrafts[activeModule].values; moduleSource = moduleDrafts[activeModule].source; search = ''; render();
      } else if (target.dataset.moveModule !== undefined) {
        const current = moduleDrafts[activeModule]; const from = Number(target.dataset.moveModule);
        moduleDrafts = moveLesson(moduleDrafts, from, from + Number(target.dataset.direction)); activeModule = moduleDrafts.indexOf(current); render();
      } else if (target.dataset.removeModule !== undefined) {
        if (!await confirmAction({ title: 'Remove this module from the draft?', message: 'Saved library lessons will remain available.', confirm: 'Remove module', danger: true })) return;
        moduleDrafts.splice(Number(target.dataset.removeModule), 1); activeModule = Math.min(activeModule, moduleDrafts.length - 1); draft = moduleDrafts[activeModule].values; moduleSource = moduleDrafts[activeModule].source; render();
      } else if (target.dataset.action === 'back') {
        if (await mayLeave()) { draft = null; initial = ''; guard(); render(); }
      } else if (target.dataset.action === 'new-lesson') { if (!await mayLeave()) return; pathWorkspace.reset(); await editLesson(); }
      else if (target.dataset.action === 'module-lesson') {
        if (draft.lessonIds.length >= 100) return toast('A module can contain up to 100 lessons.');
        await editLesson(null, true);
      } else if (target.dataset.edit) await editLesson(lesson(target.dataset.edit), true);
      else if (target.dataset.libraryCopy) await editLesson(lesson(target.dataset.libraryCopy), false, true);
      else if (target.dataset.libraryEdit) await editLesson(lesson(target.dataset.libraryEdit));
      else if (target.dataset.preview) await openLessonViewer(lesson(target.dataset.preview));
      else if (target.hasAttribute('data-undo-order')) {
        const change = orderChanges.get(draft);
        if (!change || JSON.stringify(change.after) !== JSON.stringify(draft.lessonIds)) return;
        draft.lessonIds = [...change.before];
        orderChanges.delete(draft);
        renderOrder(change.from, 'Lesson move undone.');
      }
      else if (target.dataset.remove) { draft.lessonIds = draft.lessonIds.filter(id => id !== target.dataset.remove); renderPicker(); renderOrder(); }
      else if (['paths', 'modules', 'library'].includes(target.dataset.action)) { if (tab !== target.dataset.action && await mayLeave()) { pathWorkspace.reset(); tab = target.dataset.action; render(); } }
    } catch (error) { busy = false; report(error); }
  }
  render();
}
