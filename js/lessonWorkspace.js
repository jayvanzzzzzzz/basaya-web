import { state, getAllLessons } from './state.js';
import { $, escapeHtml as esc, page, toast } from './helpers.js';
import { confirmAction } from './action-confirmation.js';
import { captureRoute } from './route-lifecycle.js';
import { setLessonLeaveGuard } from './lessonNavigation.js';
import { loadModules, saveModule } from './modules.js';
import { nextCopyNumber, moveLesson } from './moduleModel.js';
import { openInlineLessonEditor, renderLessons } from '../admin/views/lessons.js';
import { openLessonViewer } from '../admin/views/lessonViewer.js';

const button = (label, action, primary = false) => `<button type="button" class="button ${primary ? 'primary' : 'secondary'}" data-action="${action}">${label}</button>`;

export async function renderLessonWorkspace() {
  const isCurrent = captureRoute('/lessons');
  await getAllLessons();
  const modules = await loadModules();
  if (!isCurrent()) return;
  const admin = state.profile?.role === 'admin';
  let draft = null, initial = '', busy = false, tab = 'modules', search = '';
  const authoredHere = new Set();
  const content = $('#page-content');
  const lesson = id => state.allLessons.find(item => item.id === id);
  const snapshot = () => draft ? JSON.stringify([draft.title, draft.description, draft.lessonIds]) : '';
  const dirty = () => snapshot() !== initial;
  const mayLeave = async () => !busy && (!dirty() || await confirmAction({ title: 'Discard module changes?', message: 'Your module details and lesson order have not been saved. Lessons already saved to the library will remain there.', confirm: 'Discard changes', danger: true }));
  const guard = () => setLessonLeaveGuard(mayLeave, () => busy || dirty(), state.user.uid);
  guard();
  const report = error => { console.error(error); toast(error.message || 'Could not complete this action. Please try again.'); };

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

  async function editLesson(item = null, inModule = false) {
    if (busy) return;
    const copy = Boolean(item && inModule && !authoredHere.has(`${draft.draftKey}:${item.id}`));
    const root = copy ? lesson(item.sourceLessonId || item.id) || item : null;
    let editorGuard = async () => true, editorDirty = () => false;
    busy = true;
    try {
      await openInlineLessonEditor(item, {
        copy, copyTitle: copy ? `${root.title} 1.${nextCopyNumber(root.title, state.allLessons)}` : undefined,
        isCurrent,
        mount(html, mountEditor) {
          page(copy ? 'Edit a lesson copy' : item ? 'Edit lesson' : 'Create lesson',
            draft ? `Lessons → ${draft.title || 'New module'}` : 'Lessons → Lesson library', button('Back', 'back'));
          content.innerHTML = `<section class="module-workspace"><p class="module-note">${copy ? 'Save an edited copy. The premade lesson stays unchanged; its copy number is assigned on save.' : 'Save this lesson to your library' + (inModule ? ' and add it to this module.' : '.')}</p><div class="lesson-inline-editor">${html}</div></section>`;
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
    const available = state.allLessons.filter(item => !q || `${item.title} ${item.description || ''}`.toLocaleLowerCase().includes(q));
    const host = content.querySelector('[data-picker]');
    host.innerHTML = available.length ? available.map(item => `<label class="module-choice"><input type="checkbox" data-pick="${esc(item.id)}" ${draft.lessonIds.includes(item.id) ? 'checked' : ''}><span><strong>${esc(item.title)}</strong><small>${esc(item.description || 'Premade lesson')}</small></span><button type="button" class="button secondary small" data-preview="${esc(item.id)}">Preview</button></label>`).join('') : '<p class="module-note">No lessons match your search.</p>';
  }

  function renderOrder(focusIndex = null) {
    const host = content.querySelector('[data-order]');
    host.innerHTML = draft.lessonIds.length ? draft.lessonIds.map((id, i) => {
      const item = lesson(id);
      return `<li class="module-order-row" draggable="true" data-index="${i}"><span class="module-number">${i + 1}</span><div class="module-lesson-name"><strong>${esc(item?.title || 'Lesson unavailable')}</strong><small>${item ? 'Lesson ' + (i + 1) : 'Remove this missing lesson before saving.'}</small></div><div class="module-row-actions"><button type="button" class="button secondary small" data-move="${i}" data-direction="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move lesson ${i + 1} up">↑</button><button type="button" class="button secondary small" data-move="${i}" data-direction="1" ${i === draft.lessonIds.length - 1 ? 'disabled' : ''} aria-label="Move lesson ${i + 1} down">↓</button>${item ? `<button type="button" class="button secondary small" data-edit="${esc(id)}">${authoredHere.has(`${draft.draftKey}:${id}`) ? 'Edit' : 'Edit a copy'}</button>` : ''}<button type="button" class="button secondary small" data-remove="${esc(id)}">Remove</button></div></li>`;
    }).join('') : '<li class="module-note">Select premade lessons or create a new lesson to begin.</li>';
    content.querySelector('[data-count]').textContent = `${draft.lessonIds.length} selected`;
    if (focusIndex !== null) host.querySelector(`[data-index="${focusIndex}"] button:not(:disabled)`)?.focus();
  }

  function render() {
    if (!isCurrent()) return;
    header();
    content.onclick = event => action(event);
    if (!draft) {
      content.innerHTML = `<section class="module-workspace"><div class="module-tabs" aria-label="Lesson views">${button('Modules', 'modules', tab === 'modules')}${button('Lesson library', 'library', tab === 'library')}</div>${tab === 'modules' ? `<div class="module-directory">${modules.length ? modules.map(item => `<article class="module-card"><div><span class="eyebrow">${item.lessonIds.length} lessons · Ordered module</span><h2>${esc(item.title)}</h2><p>${esc(item.description || 'A sequence of lessons for your students.')}</p><ol>${item.lessonIds.map(id => `<li>${esc(lesson(id)?.title || 'Lesson unavailable')}</li>`).join('')}</ol></div><button type="button" class="button secondary" data-module="${esc(item.id)}">${admin || item.ownerId === state.user.uid ? 'Edit module' : 'Use module'}</button></article>`).join('') : `<div class="module-empty"><h2>Create your first module</h2><p>Choose premade lessons, add your own, and set the learning order.</p>${button('Create module', 'new-module', true)}</div>`}</div>` : `<label>Search lessons<input data-library-search type="search" placeholder="Find a lesson"></label><div data-library-list></div>`}</section>`;
      if (tab === 'library') {
        const draw = query => {
          const items = state.allLessons.filter(item => `${item.title} ${item.description || ''}`.toLowerCase().includes(query.toLowerCase()));
          content.querySelector('[data-library-list]').innerHTML = items.length ? items.map(item => `<article class="module-library-row"><div><h3>${esc(item.title)}</h3><p>${esc(item.description || '')}</p></div><div class="module-row-actions"><button class="button secondary small" type="button" data-preview="${esc(item.id)}">Preview</button>${admin || item.teacherId === state.user.uid ? `<button class="button secondary small" type="button" data-library-edit="${esc(item.id)}">Edit lesson</button>` : ''}</div></article>`).join('') : '<p>No lessons found.</p>';
        };
        draw(''); content.querySelector('[data-library-search]').oninput = event => draw(event.target.value);
      }
      return;
    }
    content.innerHTML = `<section class="module-workspace"><form data-module-form><div class="module-details"><label>Module title<input name="title" maxlength="120" required value="${esc(draft.title)}" placeholder="e.g. Mga Bahagi ng Pananalita"></label><label>Description<textarea name="description" maxlength="1000" placeholder="What will students learn?">${esc(draft.description)}</textarea></label></div><div class="module-columns"><section class="module-panel"><div class="module-section-heading"><h2>Premade lessons</h2>${button('Create new lesson', 'module-lesson')}</div><p>Select as many lessons as you need. Editing one saves a separate copy to the library.</p><label>Find a lesson<input data-search type="search" value="${esc(search)}" placeholder="Search by title or description"></label><div class="module-picker" data-picker></div></section><section class="module-panel"><div class="module-section-heading"><h2>Learning order</h2><span data-count aria-live="polite"></span></div><p>Drag lessons or use the arrows to set their order.</p><ol class="module-order" data-order></ol><p class="module-note">Lesson order is saved with this module.</p></section></div><footer class="module-save-bar"><span data-save-status role="status">Review the lesson order before saving.</span>${button('Cancel', 'back')}<button type="submit" class="button primary">Save module</button></footer></form></section>`;
    renderPicker(); renderOrder();
    const form = content.querySelector('form');
    form.oninput = event => { if (event.target.name) draft[event.target.name] = event.target.value; };
    content.querySelector('[data-search]').oninput = event => { search = event.target.value; renderPicker(); };
    form.onchange = event => {
      const id = event.target.dataset.pick;
      if (!id) return;
      if (event.target.checked && draft.lessonIds.length >= 100) { event.target.checked = false; toast('A module can contain up to 100 lessons.'); return; }
      draft.lessonIds = event.target.checked ? [...draft.lessonIds, id] : draft.lessonIds.filter(value => value !== id);
      renderOrder();
    };
    let dragged = null;
    form.ondragstart = event => { const row = event.target.closest('[data-index]'); if (row) { dragged = Number(row.dataset.index); event.dataTransfer.setData('text/plain', String(dragged)); event.dataTransfer.effectAllowed = 'move'; } };
    form.ondragover = event => { if (dragged !== null && event.target.closest('[data-index]')) event.preventDefault(); };
    form.ondrop = event => { const row = event.target.closest('[data-index]'); if (row && dragged !== null) { event.preventDefault(); draft.lessonIds = moveLesson(draft.lessonIds, dragged, Number(row.dataset.index)); renderOrder(); } dragged = null; };
    form.ondragend = () => { dragged = null; };
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      busy = true; const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
      const status = form.querySelector('[data-save-status]'); status.textContent = 'Saving module…';
      try {
        const id = await saveModule(draft.id ? draft : null, draft);
        initial = snapshot();
        if (!isCurrent()) return;
        const saved = { ...draft, id, revision: (draft.revision || 0) + 1, ownerId: draft.ownerId || state.user.uid };
        const index = modules.findIndex(item => item.id === id);
        if (index >= 0) modules.splice(index, 1);
        modules.unshift(saved);
        draft = null; initial = ''; search = ''; toast('Module saved with its lesson order.');
        busy = false; guard(); render();
      } catch (error) { report(error); status.textContent = error.message; }
      finally { busy = false; submit.disabled = false; }
    };
  }

  async function action(event) {
    const target = event.target.closest('button'); if (!target || busy) return;
    try {
      if (target.dataset.action === 'new-module' || target.dataset.module) {
        const saved = modules.find(item => item.id === target.dataset.module);
        draft = saved ? (admin || saved.ownerId === state.user.uid ? { ...saved, lessonIds: [...saved.lessonIds] } : { title: saved.title, description: saved.description, lessonIds: [...saved.lessonIds] }) : { title: '', description: '', lessonIds: [] };
        draft.draftKey = crypto.randomUUID(); initial = snapshot(); search = ''; guard(); render();
      } else if (target.dataset.action === 'back') {
        if (await mayLeave()) { draft = null; initial = ''; guard(); render(); }
      } else if (target.dataset.action === 'new-lesson') await editLesson();
      else if (target.dataset.action === 'module-lesson') {
        if (draft.lessonIds.length >= 100) return toast('A module can contain up to 100 lessons.');
        await editLesson(null, true);
      } else if (target.dataset.edit) await editLesson(lesson(target.dataset.edit), true);
      else if (target.dataset.libraryEdit) await editLesson(lesson(target.dataset.libraryEdit));
      else if (target.dataset.preview) await openLessonViewer(lesson(target.dataset.preview));
      else if (target.dataset.move !== undefined) { const from = Number(target.dataset.move), to = from + Number(target.dataset.direction); draft.lessonIds = moveLesson(draft.lessonIds, from, to); renderOrder(to); }
      else if (target.dataset.remove) { draft.lessonIds = draft.lessonIds.filter(id => id !== target.dataset.remove); renderPicker(); renderOrder(); }
      else if (target.dataset.action === 'library' && admin) {
        busy = true;
        await renderLessons({ onEdit: item => editLesson(item), onRefresh: renderLessonWorkspace });
        if (!isCurrent()) return;
        $('#page-header .header-actions').insertAdjacentHTML('afterbegin', button('Modules', 'return-modules'));
        $('#page-header [data-action="return-modules"]').onclick = () => { tab = 'modules'; render(); };
        busy = false;
      } else if (['modules', 'library'].includes(target.dataset.action)) { tab = target.dataset.action; render(); }
    } catch (error) { busy = false; report(error); }
  }
  render();
}
