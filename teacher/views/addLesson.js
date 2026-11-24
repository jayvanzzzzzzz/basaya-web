import { captureRoute } from '../../js/route-lifecycle.js';
import { loadModules, saveModule } from '../../js/modules.js';
import { moveLesson, contentBaseTitle } from '../../js/moduleModel.js';
import { loadLearningPaths, assignLearningPath } from '../../js/learningPaths.js';
import { openInlineLessonEditor } from '../../admin/views/lessons.js';
import { openLessonViewer } from '../../admin/views/lessonViewer.js';
import { confirmAction } from '../../js/action-confirmation.js';
import { setLessonLeaveGuard } from '../../js/lessonNavigation.js';
import { previewModuleOrder } from '../../js/moduleOrderPreview.js';
import { collection, doc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { state, getAllLessons } from '../../js/state.js';
import { $, escapeHtml, toast, navigate, page, openModal } from '../../js/helpers.js';
import { readSchedule, wireLessonSchedule, wirePathOpeningDates, notifyStudents, linkLessonId, linkMode } from '../../js/schedule.js';

import { orderedPathAssignments } from '../../js/learningPathSequence.js';

const MODE_LABEL = { assessment: 'Assessment', practice: 'Practice' };
const lessonsLabel = n => `${n} ${n === 1 ? 'lesson' : 'lessons'}`;

export async function renderAddLessonPage(classId) {
  const isCurrent = captureRoute(`/classes/${encodeURIComponent(classId)}/add-lesson`);
  if (!isCurrent()) return;
  if (!state.user) return navigate('/login');
  const classDoc = await getDoc(doc(db, 'classes', classId));
  if (!isCurrent()) return;
  if (!classDoc.exists() || classDoc.data().teacherId !== state.user.uid) return navigate('/dashboard');
  const classroom = { id: classDoc.id, ...classDoc.data() };
  const [linksSnap, , modules, paths, assignedSnap] = await Promise.all([
    getDocs(collection(db, 'classes', classId, 'classLessons')),
    getAllLessons({ includeArchived: false }), loadModules(), loadLearningPaths(), getDocs(collection(db, 'classes', classId, 'learningPaths')),
  ]);
  if (!isCurrent()) return;
  paths.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }) || a.id.localeCompare(b.id));
  const links = linksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  let assignedPaths = orderedPathAssignments(assignedSnap.docs.map(d => ({ id: d.id, ...d.data() })), links);
  const inClass = { assessment: new Set(), practice: new Set() };
  links.forEach(link => inClass[linkMode(link)].add(linkLessonId(link)));
  let queuedModules = [], selectedPaths = [], assignmentBusy = false;
  let editorDirty = () => false, editorMayLeave = async () => true;
  const pathSettings = new Map(), requests = new Map(), completed = new Set();
  const settings = { mode: 'assessment' };
  const guard = () => setLessonLeaveGuard(async () => !assignmentBusy && await editorMayLeave() && (!queuedModules.length || await confirmAction({ title: 'Leave this assignment?', message: completed.size ? 'Paths already assigned will stay in the class. Remaining selections will be discarded.' : 'Nothing will be assigned. Saved lesson and module copies remain in your library.', confirm: 'Leave assignment' })), () => assignmentBusy || editorDirty() || queuedModules.length > 0, state.user.uid);
  guard();
  page('Add Lesson Path', `Choose lesson paths for ${classroom.className}`, '', {
    crumbs: [{ label: 'Classrooms', href: '#/classes' }, { label: classroom.className, href: `#/classes/${encodeURIComponent(classId)}` }],
  });
  $('#page-header').classList.add('teacher-add-lesson-header');
  $('#page-content').classList.add('teacher-add-lesson-page');
  $('#page-content').innerHTML = paths.length ? `<div class="lesson-workspace">
    <section class="lesson-picker" aria-labelledby="module-picker-title">
      <div class="lesson-picker__toolbar"><div><span class="lesson-picker__eyebrow">01 / Lesson path collection</span><h2 id="module-picker-title">Choose what to teach</h2><p>Select lesson paths, then set their deadlines together.</p></div><span class="lesson-picker__count"><strong>${paths.length}</strong> in collection</span></div>
      <section class="module-panel module-class-sequence" aria-labelledby="class-path-title">
        <div class="class-path-heading"><div><h3 id="class-path-title">Lesson paths</h3><p>Choose paths below, then arrange the teaching sequence.</p></div><button type="button" class="button secondary small" id="select-all-paths">Select all</button></div>
        <div class="class-path-choices">${paths.map(path => `<label class="class-path-choice"><input type="checkbox" data-class-path="${escapeHtml(path.id)}"><span><strong>${escapeHtml(path.title)}</strong><small>${path.moduleIds.length} ${path.moduleIds.length === 1 ? 'module' : 'modules'}</small></span></label>`).join('')}</div>
        <div class="class-path-heading"><p id="selected-class-path" role="status"></p><button type="button" class="button secondary small" id="clear-class-path" hidden>Clear selection</button></div>
        <h3>Lesson path sequence</h3><p>Students finish each assessment path before the next path unlocks. Practice paths do not block progression. New paths follow those already assigned.</p><ol id="class-path-order" class="class-path-order" aria-label="Lesson path assignment order"></ol><h3>Module order</h3><p>You can adjust module order within each path.</p>
        <p id="class-module-empty">Select lesson paths above to review their modules and lessons.</p>
        <ol class="module-batch-list" id="class-module-order" aria-live="polite"></ol>
        <button type="button" class="button primary" id="assign-class-modules" disabled>Set dates and assign paths</button>
      </section>
    </section>
    <aside class="lesson-guide" aria-labelledby="lesson-guide-title"><span class="lesson-picker__eyebrow">For your classroom</span><h2 id="lesson-guide-title">${escapeHtml(classroom.className)}</h2><p>Add multiple lesson paths with a separate schedule and deadline for each.</p>
      <ol class="lesson-guide__steps"><li><span>01</span><div><strong>Choose your lesson paths</strong><p>Select saved paths and use Move up or Move down to arrange the teaching sequence.</p></div></li><li><span>02</span><div><strong>Decide how students learn</strong><p>Add as an assessment for recorded scores, or practice for unlimited retries.</p></div></li><li><span>03</span><div><strong>Set dates together</strong><p>Choose a schedule for each path in one form and review before assigning.</p></div></li></ol>
      <div class="lesson-guide__note"><p>Each lesson must appear only once across the selected paths and be available as the selected type. Edit a copy if a lesson is already assigned.</p></div>
    </aside></div>` : `<section class="lesson-picker__empty"><span class="lesson-picker__eyebrow">Your lesson path collection</span><h2>No lesson paths to add yet</h2><p>Create a lesson path in Lessons, then return here to add it to ${escapeHtml(classroom.className)}.</p><button class="button primary" id="create-module-empty" type="button">Go to lesson paths</button></section>`;
  $('#create-module-empty')?.addEventListener('click', () => navigate('/lessons'));
  if (!paths.length) return;

  const drawQueue = () => {
    $('#class-path-order').innerHTML = selectedPaths.map((path, i) => `<li><strong>${i + 1}. ${escapeHtml(path.title)}</strong><div><button type="button" class="button secondary small" data-path-move="${i}" data-direction="-1" aria-label="Move ${escapeHtml(path.title)} up" ${completed.size || i === 0 ? 'disabled' : ''}>Move up</button><button type="button" class="button secondary small" data-path-move="${i}" data-direction="1" aria-label="Move ${escapeHtml(path.title)} down" ${completed.size || i === selectedPaths.length - 1 ? 'disabled' : ''}>Move down</button></div></li>`).join('');
    $('#class-module-order').innerHTML = queuedModules.map((module, i) => `<li><div><strong>${i + 1}. ${escapeHtml(module.title)}</strong><small class="class-path-module-label">${escapeHtml(paths.find(path => path.id === module.pathId)?.title || '')}${completed.has(module.pathId) ? ' · Already assigned' : ''}</small>${module.customized ? '<span class="content-visibility">Customized module copy</span>' : ''}<details class="assignment-module-lessons"><summary>Preview or customize ${lessonsLabel(module.lessonIds.length)}</summary><ol>${module.lessonIds.map(id => `<li><span>${escapeHtml(state.allLessons.find(lesson => lesson.id === id)?.title || 'Unavailable lesson')}${module.editedLessons?.includes(id) ? ' · Edited lesson copy' : ''}</span><div class="module-row-actions"><button type="button" class="button secondary small" data-assign-preview="${escapeHtml(id)}">Preview</button><button type="button" class="button secondary small" data-assign-edit="${escapeHtml(id)}" data-module-index="${i}" ${completed.size ? 'disabled' : ''}>Edit a copy</button></div></li>`).join('')}</ol></details></div><button type="button" class="button secondary small" data-queue-move="${i}" data-direction="-1" aria-label="Move module ${i + 1} up" ${completed.size || i === 0 || queuedModules[i - 1].pathId !== module.pathId ? 'disabled' : ''}>↑</button><button type="button" class="button secondary small" data-queue-move="${i}" data-direction="1" aria-label="Move module ${i + 1} down" ${completed.size || i === queuedModules.length - 1 || queuedModules[i + 1].pathId !== module.pathId ? 'disabled' : ''}>↓</button></li>`).join('');
    $('#class-module-empty').hidden = Boolean(queuedModules.length);
    $('#selected-class-path').textContent = `${selectedPaths.length} lesson paths selected · Teaching sequence${completed.size ? ` · ${completed.size} already assigned` : ''}`;
    $('#clear-class-path').hidden = !selectedPaths.length || completed.size > 0;
    $('#assign-class-modules').disabled = !selectedPaths.some(path => !completed.has(path.id));
    $('#assign-class-modules').textContent = completed.size ? 'Retry remaining paths' : 'Set dates and assign paths';
  };
  const selectPaths = ids => {
    const chosenPaths = [...selectedPaths.filter(path => ids.includes(path.id)), ...paths.filter(path => ids.includes(path.id) && !selectedPaths.some(selected => selected.id === path.id))];
    for (const path of chosenPaths) {
      const chosen = path.moduleIds.map(id => modules.find(item => item.id === id));
      if (!chosen.length || chosen.some(item => !item || item.archived || item.lessonIds.some(id => !state.allLessons.some(lesson => lesson.id === id && !lesson.archived)))) {
        toast(`${path.title} contains unavailable modules or lessons. Ask its creator to update it.`); return false;
      }
    }
    selectedPaths = chosenPaths;
    queuedModules = chosenPaths.flatMap(path => {
      const existing = queuedModules.filter(module => module.pathId === path.id);
      return existing.length ? existing : path.moduleIds.map(id => {
        const item = modules.find(module => module.id === id);
        return { ...item, lessonIds: [...item.lessonIds], source: item, pathId: path.id };
      });
    });
    drawQueue(); return true;
  };
  $('.class-path-choices').onchange = event => {
    if (assignmentBusy || completed.size) return;
    if (!selectPaths([...document.querySelectorAll('[data-class-path]:checked')].map(input => input.dataset.classPath))) event.target.checked = false;
  };
  $('#select-all-paths').onclick = () => {
    if (assignmentBusy || completed.size) return;
    if (selectPaths(paths.map(path => path.id))) document.querySelectorAll('[data-class-path]').forEach(input => input.checked = true);
  };
  $('#clear-class-path').onclick = () => {
    if (assignmentBusy || completed.size) return;
    selectPaths([]); document.querySelectorAll('[data-class-path]').forEach(input => input.checked = false);
  };
  $('#class-path-order').onclick = event => {
    const button = event.target.closest('[data-path-move]');
    if (!button || assignmentBusy || completed.size) return;
    const from = Number(button.dataset.pathMove), to = from + Number(button.dataset.direction);
    if (to < 0 || to >= selectedPaths.length) return;
    selectedPaths = moveLesson(selectedPaths, from, to);
    queuedModules = selectedPaths.flatMap(path => queuedModules.filter(module => module.pathId === path.id));
    drawQueue();
  };
  $('#class-module-order').onclick = async event => {
    if (assignmentBusy) return;
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.assignPreview) return openLessonViewer(state.allLessons.find(item => item.id === target.dataset.assignPreview));
    if (completed.size) return;
    if (target.dataset.assignEdit) return editAssignmentLesson(Number(target.dataset.moduleIndex), target.dataset.assignEdit);
    if (target.dataset.queueMove !== undefined) {
      const from = Number(target.dataset.queueMove), to = from + Number(target.dataset.direction);
      if (queuedModules[from]?.pathId !== queuedModules[to]?.pathId) return;
      queuedModules = moveLesson(queuedModules, from, to); drawQueue();
    }
  };
  $('#assign-class-modules').onclick = () => { if (!assignmentBusy && selectedPaths.length) openAddModal(); };
  drawQueue();

  async function editAssignmentLesson(moduleIndex, lessonId) {
    const module = queuedModules[moduleIndex], original = state.allLessons.find(item => item.id === lessonId);
    if (!original) return toast('This lesson is unavailable.');
    const view = $('#page-content').firstElementChild;
    const host = document.createElement('section'); host.className = 'module-workspace';
    let editorHost;
    const restore = () => { host.remove(); view.hidden = false; view.style.display = ''; editorDirty = () => false; editorMayLeave = async () => true; guard(); drawQueue(); };
    try {
      await openInlineLessonEditor(original, {
        copy: true, isCurrent,
        mount(html, mountEditor) {
          view.hidden = true; view.style.display = 'none';
          host.innerHTML = '<p class="module-note">Save an edited lesson copy, then return to your assignment. The customized module version is saved when you confirm the assignment.</p><div class="lesson-inline-editor">' + html + '</div>';
          $('#page-content').append(host); editorHost = host.querySelector('.lesson-inline-editor'); mountEditor(editorHost, () => host.remove());
        },
        onGuard(check, changed) { editorMayLeave = check; editorDirty = changed; guard(); },
        onCancel: restore,
        async onSaved(id) {
          await getAllLessons({ includeArchived: false });
          module.lessonIds = module.lessonIds.map(value => value === lessonId ? id : value);
          module.editedLessons = [...(module.editedLessons || []).filter(value => value !== lessonId), id];
          module.customized = true; module.savedCopy = null; delete module.saveRequestKey; delete module.copyValues;
          restore(); toast('Lesson copy saved to your library. Review the customized module before assigning.');
        },
      });
    } catch (error) { restore(); toast(error.message); }
  }



  function openAddModal() {
    const pending = selectedPaths.filter(path => !completed.has(path.id));
    const selectedModules = queuedModules.filter(module => !completed.has(module.pathId));
    const ids = selectedModules.flatMap(module => module.lessonIds);
    if (!pending.length) return;
    if (!ids.some(id => !inClass[settings.mode].has(id)) && !completed.size) settings.mode = settings.mode === 'practice' ? 'assessment' : 'practice';
    openModal(`<h2>Assign ${pending.length} lesson ${pending.length === 1 ? 'path' : 'paths'}</h2><p>Set a schedule for each path. Paths will be added in the order shown.</p>
      <form id="add-lessons-form" class="lesson-add-form">
        <fieldset class="lesson-mode"><legend>Lesson type</legend><div class="lesson-mode__options">${['assessment', 'practice'].map(mode => `<label class="lesson-mode__option"><input type="radio" name="mode" value="${mode}" ${mode === settings.mode ? 'checked' : ''}><span><strong>${MODE_LABEL[mode]}</strong><small>${mode === 'assessment' ? 'Scores are saved and count in reports' : 'Students can retry anytime; nothing is saved'}</small></span></label>`).join('')}</div><p class="lesson-schedule__hint">Applies to all selected paths. This cannot be changed after assignment.</p><p class="lesson-add-form__skipped" id="add-lessons-skipped" role="status" hidden></p></fieldset>
        <div class="class-path-schedules">${pending.map((path, i) => {
          const dates = pathSettings.get(path.id) || {};
          return `<fieldset class="lesson-schedule" data-path-schedule="${escapeHtml(path.id)}"><legend>${i + 1}. ${escapeHtml(path.title)}</legend><label>Opens on<input type="datetime-local" name="openAt" value="${escapeHtml(dates.openAt || '')}"></label><label>Due on<input type="datetime-local" name="dueAt" value="${escapeHtml(dates.dueAt || '')}"></label><p class="lesson-schedule__hint">Opening dates must be on later calendar days than the preceding path (Philippine time). The first path may open immediately. Deadlines are optional. Students must also finish the preceding assessment paths.</p></fieldset>`;
        }).join('')}</div>
        <div class="modal-actions"><button class="button secondary" type="button" data-cancel>Cancel</button><button class="button primary" type="submit" data-confirm>Assign paths</button></div>
      </form>`, (backdrop, close) => {
      const form = backdrop.querySelector('#add-lessons-form'), submit = form.querySelector('[data-confirm]');
      const fields = [...form.querySelectorAll('[data-path-schedule]')];
      const scheduleForm = fieldset => ({ elements: { openAt: fieldset.querySelector('[name="openAt"]'), dueAt: fieldset.querySelector('[name="dueAt"]') } });
      fields.forEach(fieldset => wireLessonSchedule(scheduleForm(fieldset)));
      const validateOpeningOrder = wirePathOpeningDates(fields.map(fieldset => ({ path: { id: fieldset.dataset.pathSchedule, title: paths.find(path => path.id === fieldset.dataset.pathSchedule).title, sequenceOpenAt: Date.now() }, form: scheduleForm(fieldset) })), { previous: assignedPaths.at(-1) || null });
      const selectedMode = () => form.elements.mode.value === 'practice' ? 'practice' : 'assessment';
      const sync = () => {
        settings.mode = selectedMode();
        fields.forEach(fieldset => {
          const { openAt, dueAt } = scheduleForm(fieldset).elements;
          pathSettings.set(fieldset.dataset.pathSchedule, { openAt: openAt.value, dueAt: dueAt.value });
        });
        const conflicts = ids.filter(id => inClass[settings.mode].has(id));
        const overlaps = ids.filter((id, i) => ids.indexOf(id) !== i);
        const note = form.querySelector('#add-lessons-skipped');
        note.hidden = !conflicts.length && !overlaps.length;
        note.textContent = overlaps.length ? 'Selected paths share a lesson. Select different paths or edit a lesson copy so each path can have its own deadline.' : conflicts.length ? `${lessonsLabel(conflicts.length)} already assigned as ${MODE_LABEL[settings.mode]}. Choose the other type or edit a lesson copy before assigning these paths.` : '';
        submit.disabled = !ids.length || conflicts.length > 0 || overlaps.length > 0;
        submit.textContent = `Assign ${pending.length} ${pending.length === 1 ? 'path' : 'paths'}`;
      };
      form.addEventListener('change', sync); form.addEventListener('input', sync); sync();
      backdrop.querySelector('[data-cancel]').onclick = close;
      const setBusy = busy => {
        submit.setAttribute('aria-busy', String(busy));
        form.querySelectorAll('input, button').forEach(field => field.disabled = busy);
        backdrop.querySelector('.modal-close').disabled = busy;
        if (busy) submit.innerHTML = '<span class="button-spinner" aria-hidden="true"></span>Assigning paths…';
        else sync();
      };
      form.onsubmit = async event => {
        event.preventDefault();
        if (assignmentBusy || submit.disabled) return;
        const openingError = validateOpeningOrder();
        if (openingError) return toast(openingError);
        const mode = selectedMode(), schedules = new Map();
        for (const fieldset of fields) {
          const schedule = readSchedule(scheduleForm(fieldset), { newLesson: true });
          if (schedule.error) return toast(`${paths.find(path => path.id === fieldset.dataset.pathSchedule).title}: ${schedule.error}`);
          schedules.set(fieldset.dataset.pathSchedule, schedule);
        }
        const existing = [...links].sort((a, b) => (a.order || 0) - (b.order || 0)).map(link => ({ title: link.moduleTitle || 'Assigned lesson', lessons: [state.allLessons.find(lesson => lesson.id === linkLessonId(link))?.title || 'Assigned lesson'], existing: true }));
        const planned = selectedModules.map(module => ({ title: `${paths.find(path => path.id === module.pathId).title} / ${module.title}${module.customized ? ' — Customized copy' : ''}`, lessons: module.lessonIds.map(id => state.allLessons.find(lesson => lesson.id === id)?.title || 'Unavailable lesson') }));
        assignmentBusy = true; setBusy(true);
        try {
          const confirmed = await previewModuleOrder([...existing, ...planned], { title: 'Review lesson path teaching sequence', confirm: selectedModules.some(module => module.customized) ? 'Save copies and assign' : 'Assign lesson paths', message: 'Each path keeps its own schedule and deadline. Customized modules are saved as separate versions.' });
          if (!confirmed || !isCurrent()) { assignmentBusy = false; setBusy(false); return; }
          for (const path of pending) {
            const resolvedModules = [];
            for (const module of selectedModules.filter(module => module.pathId === path.id)) {
              if (module.customized && !module.savedCopy) {
                module.copyValues ||= { title: contentBaseTitle(module.source), description: module.description || '', lessonIds: [...module.lessonIds], visibility: module.lessonIds.some(id => state.allLessons.find(item => item.id === id)?.visibility === 'private') ? 'private' : module.visibility || 'shared' };
                const id = await saveModule(module.source, module.copyValues);
                module.savedCopy = { ...module.copyValues, id };
              }
              resolvedModules.push(module.savedCopy || module);
            }
            const schedule = schedules.get(path.id);
            const payload = { pathId: path.id, revision: path.revision, classId, moduleIds: resolvedModules.map(module => module.id), mode, openAt: schedule.openAt?.toMillis?.() ?? null, dueAt: schedule.dueAt?.toMillis?.() ?? null };
            const fingerprint = JSON.stringify(payload);
            let request = requests.get(path.id);
            if (!request || request.fingerprint !== fingerprint) { request = { fingerprint, key: crypto.randomUUID() }; requests.set(path.id, request); }
            const result = await assignLearningPath({ ...payload, requestKey: request.key });
            completed.add(path.id);
            assignedPaths.push({ id: result.id || request.key, title: path.title, ...schedule, sequenceOpenAt: payload.openAt ?? Date.now(), order: (assignedPaths.at(-1)?.order || 0) + 1 });
            try { await notifyStudents(classId, result.linkIds); }
            catch (error) { toast(`${path.title} added, but students were not notified (${error.message}).`); }
          }
        } catch (error) {
          assignmentBusy = false; setBusy(false);
          if (completed.size) {
            close();
            document.querySelectorAll('[data-class-path], #select-all-paths, #clear-class-path').forEach(input => input.disabled = true);
            drawQueue();
          }
          toast(`${completed.size ? `${completed.size} paths already added. Retry to add the remaining paths. ` : ''}${error.message}`); return;
        }
        toast(`${selectedPaths.length} lesson paths added in teaching order.`);
        close(); queuedModules = []; selectedPaths = []; assignmentBusy = false; guard();
        navigate(`/classes/${encodeURIComponent(classId)}`);
      };
    }, { closeOnBackdrop: false });
  }
}
