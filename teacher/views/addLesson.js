import { captureRoute } from "../../js/route-lifecycle.js";
import { loadModules, saveModule } from '../../js/modules.js';
import { moveLesson, contentBaseTitle } from '../../js/moduleModel.js';
import { loadLearningPaths, assignLearningPath } from '../../js/learningPaths.js';
import { openInlineLessonEditor } from '../../admin/views/lessons.js';
import { openLessonViewer } from '../../admin/views/lessonViewer.js';
import { confirmAction } from '../../js/action-confirmation.js';
import { setLessonLeaveGuard } from '../../js/lessonNavigation.js';
import { previewModuleOrder } from '../../js/moduleOrderPreview.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../js/firebase.js";
import { state, getAllLessons } from "../../js/state.js";
import { $, escapeHtml, toast, navigate, page, openModal } from "../../js/helpers.js";
import {
  readSchedule,
  wireLessonSchedule,
  notifyStudents,
  linkLessonId,
  linkMode,
  practiceLinkId,
} from "../../js/schedule.js";

const MODE_LABEL = { assessment: "Assessment", practice: "Practice" };
const lessonsLabel = (n) => `${n} ${n === 1 ? "lesson" : "lessons"}`;

export async function renderAddLessonPage(classId) {
  const isCurrent = captureRoute(`/classes/${encodeURIComponent(classId)}/add-lesson`);
  if (!isCurrent()) return;
  if (!state.user) return navigate("/login");

  const classDoc = await getDoc(doc(db, "classes", classId));
  if (!isCurrent()) return;
  if (!classDoc.exists() || classDoc.data().teacherId !== state.user.uid)
    return navigate("/dashboard");
  const classroom = { id: classDoc.id, ...classDoc.data() };

  const [linksSnap, , modules, paths] = await Promise.all([
    getDocs(collection(db, "classes", classId, "classLessons")),
    getAllLessons({ includeArchived: false }),
    loadModules(),
    loadLearningPaths(),
  ]);
  const links = linksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  let queuedModules = [];
  let selectedPath = null, assignmentBusy = false, editorDirty = () => false, editorMayLeave = async () => true;
  let assignmentRequestKey = crypto.randomUUID(), lastAssignment = '';
  const guard = () => setLessonLeaveGuard(async () => !assignmentBusy && await editorMayLeave() && (!queuedModules.length || await confirmAction({ title: 'Leave this assignment?', message: 'Nothing will be assigned. Saved lesson and module copies remain in your library.', confirm: 'Leave assignment' })), () => assignmentBusy || editorDirty() || queuedModules.length > 0, state.user.uid);
  guard();
  if (!isCurrent()) return;
  // A lesson can be in the class once as an Assessment and once as Practice.
  const inClass = { assessment: new Set(), practice: new Set() };
  links.forEach((link) => inClass[linkMode(link)].add(linkLessonId(link)));
  page("Add learning content", `Choose a learning path or modules for ${classroom.className}`, "", {
    crumbs: [
      { label: "Classrooms", href: "#/classes" },
      { label: classroom.className, href: `#/classes/${encodeURIComponent(classId)}` },
    ],
  });
  $("#page-header").classList.add("teacher-add-lesson-header");
  $("#page-content").classList.add("teacher-add-lesson-page");
  $("#page-content").innerHTML = modules.length || paths.length
    ? `<div class="lesson-workspace"><section class="lesson-picker" aria-labelledby="module-picker-title">
        <div class="lesson-picker__toolbar">
          <div><span class="lesson-picker__eyebrow">01 / Module collection</span>
            <h2 id="module-picker-title">Choose what to teach</h2>
            <p>Add modules and arrange their order for this class.</p></div>
          <span class="lesson-picker__count"><strong>${modules.length}</strong> in collection</span>
        </div>
        <section class="module-panel module-class-sequence" aria-labelledby="module-order-title">
          <h3>Learning Path</h3><p>Assign all modules in a path with one schedule and deadline.</p><label>Learning path<select id="class-learning-path"><option value="">Choose a learning path</option>${paths.map(path => `<option value="${escapeHtml(path.id)}">${escapeHtml(path.title)} (${path.moduleIds.length} modules)</option>`).join('')}</select></label><button type="button" class="button secondary" id="use-class-path">Use learning path</button><p id="selected-class-path" role="status"></p><button type="button" class="button secondary small" id="clear-class-path" hidden>Clear learning path</button>
          <h3 id="module-order-title">Module order</h3>
          <p>New modules go after the lessons already assigned to this class. Lesson order comes from each saved module.</p>
          <label>Module<select id="class-module"><option value="">Choose a module</option>${modules.map(module => `<option value="${escapeHtml(module.id)}">${escapeHtml(module.title)} (${lessonsLabel(module.lessonIds.length)})</option>`).join('')}</select></label>
          <button type="button" class="button secondary" id="add-class-module">Add another module</button>
          <p id="class-module-empty">Choose a module above to start your assignment list.</p>
          <ol class="module-batch-list" id="class-module-order" aria-live="polite"></ol>
          <button type="button" class="button primary" id="assign-class-modules" disabled>Review and assign modules</button>
        </section>
      </section><aside class="lesson-guide" aria-labelledby="lesson-guide-title">
        <span class="lesson-picker__eyebrow">For your classroom</span>
        <h2 id="lesson-guide-title">${escapeHtml(classroom.className)}</h2>
        <p>Build a learning plan from your modules.</p>
        <ol class="lesson-guide__steps">
          <li><span>01</span><div><strong>Choose your modules</strong><p>Add modules to the list and arrange their order.</p></div></li>
          <li><span>02</span><div><strong>Decide how students learn</strong><p>Add as an assessment for recorded scores, or practice for unlimited retries.</p></div></li>
          <li><span>03</span><div><strong>Set the right time</strong><p>Choose an optional schedule and review the learning order before assigning.</p></div></li>
        </ol>
        <div class="lesson-guide__note"><p>Lessons already assigned as the selected type are skipped.</p></div>
      </aside></div>`
    : `<section class="lesson-picker__empty">
        <span class="lesson-picker__eyebrow">Your module collection</span>
        <h2>No modules to add yet</h2>
        <p>Create a module in Lessons, then return here to add it to ${escapeHtml(classroom.className)}.</p>
        <button class="button primary" id="create-module-empty" type="button">Go to modules</button>
      </section>`;
  $("#create-module-empty")?.addEventListener("click", () => navigate('/lessons'));
  if (!modules.length && !paths.length) return;

  const settings = { mode: "assessment", openAt: "", dueAt: "" };
  // Assign modules through the existing lesson links in each module's saved order.
  const drawQueue = () => {
    $('#class-module-order').innerHTML = queuedModules.map((module, i) => `<li><div><strong>${i + 1}. ${escapeHtml(module.title)}</strong>${module.customized ? '<span class="content-visibility">Customized module copy</span>' : ''}<details class="assignment-module-lessons"><summary>Preview or customize ${lessonsLabel(module.lessonIds.length)}</summary><ol>${module.lessonIds.map(id => `<li><span>${escapeHtml(state.allLessons.find(lesson => lesson.id === id)?.title || 'Unavailable lesson')}${module.editedLessons?.includes(id) ? ' · Edited lesson copy' : ''}</span><div class="module-row-actions"><button type="button" class="button secondary small" data-assign-preview="${escapeHtml(id)}">Preview</button><button type="button" class="button secondary small" data-assign-edit="${escapeHtml(id)}" data-module-index="${i}">Edit a copy</button></div></li>`).join('')}</ol></details></div><button type="button" class="button secondary small" data-queue-move="${i}" data-direction="-1" aria-label="Move module ${i + 1} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="button secondary small" data-queue-move="${i}" data-direction="1" aria-label="Move module ${i + 1} down" ${i === queuedModules.length - 1 ? 'disabled' : ''}>↓</button>${!selectedPath ? `<button type="button" class="button secondary small" data-queue-remove="${i}">Remove</button>` : ''}</li>`).join('');
    $('#assign-class-modules').disabled = !queuedModules.length;
    $('#class-module-empty').hidden = Boolean(queuedModules.length);
    $('#selected-class-path').textContent = selectedPath ? `${selectedPath.title} — one deadline for the whole path` : '';
    $('#clear-class-path').hidden = !selectedPath;
    $('#add-class-module').disabled = Boolean(selectedPath);
    $('#assign-class-modules').textContent = selectedPath ? 'Review and assign learning path' : 'Review and assign modules';
  };
  $('#class-module-order').onclick = async event => {
    if (assignmentBusy) return;
    const target = event.target.closest('button'); if (!target) return;
    if (target.dataset.assignPreview) return openLessonViewer(state.allLessons.find(item => item.id === target.dataset.assignPreview));
    if (target.dataset.assignEdit) return editAssignmentLesson(Number(target.dataset.moduleIndex), target.dataset.assignEdit);
    if (target.dataset.queueMove !== undefined) { const from = Number(target.dataset.queueMove); queuedModules = moveLesson(queuedModules, from, from + Number(target.dataset.direction)); }
    else if (target.dataset.queueRemove !== undefined) queuedModules.splice(Number(target.dataset.queueRemove), 1);
    drawQueue();
  };
  $('#use-class-path').onclick = async () => {
    const path = paths.find(item => item.id === $('#class-learning-path').value);
    if (!path) return toast('Choose a learning path first.');
    const chosen = path.moduleIds.map(id => modules.find(item => item.id === id));
    if (chosen.some(item => !item || item.lessonIds.some(id => !state.allLessons.some(lesson => lesson.id === id)))) return toast('This learning path contains unavailable modules or lessons. Ask its creator to update it.');
    if (queuedModules.length && !await confirmAction({ title: 'Replace the assignment list?', message: 'Saved copies remain in your library. The selected path will replace this pending list.', confirm: 'Use learning path' })) return;
    selectedPath = path; queuedModules = chosen.map(item => ({ ...item, lessonIds: [...item.lessonIds], source: item })); drawQueue();
  };
  $('#clear-class-path').onclick = async () => {
    if (!await confirmAction({ title: 'Clear this learning path?', message: 'Saved copies remain in your library. Nothing will be assigned.', confirm: 'Clear path' })) return;
    selectedPath = null; queuedModules = []; drawQueue();
  };
  $('#assign-class-modules').onclick = () => openAddModal([...new Set(queuedModules.flatMap(module => module.lessonIds))], [...queuedModules]);
  $('#add-class-module').onclick = () => {
    const module = modules.find(item => item.id === $('#class-module').value);
    if (!module) return toast('Choose a module first.');
    const ids = module.lessonIds.filter(id => state.allLessons.some(item => item.id === id));
    if (ids.length !== module.lessonIds.length) return toast('This module contains an archived or unavailable lesson. Restore or replace that lesson before assigning the module.');
    if (ids.every(id => inClass.assessment.has(id) && inClass.practice.has(id))) return toast('All module lessons are already added as assessment and practice.');
    if (queuedModules.some(item => item.id === module.id)) return toast('This module is already in the list.');
    if (queuedModules.some(item => item.lessonIds.some(id => ids.includes(id)))) return toast('These modules share a lesson. Choose a module with different lessons so each lesson has one position.');
    if (queuedModules.reduce((count, item) => count + item.lessonIds.length, ids.length) > 200) return toast('Assign up to 200 lessons at a time. You can append more modules afterward.');
    queuedModules.push({ ...module, lessonIds: [...module.lessonIds], source: module }); drawQueue();
  };

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

  function openAddModal(ids, selectedModules) {
    const toAdd = (mode) => ids.filter((id) => !inClass[mode].has(id));
    // If every picked lesson is already in as the remembered type, start on the other one.
    if (!toAdd(settings.mode).length) settings.mode = settings.mode === "practice" ? "assessment" : "practice";

    openModal(
      `<h2>Add ${selectedModules.length} ${selectedModules.length === 1 ? "module" : "modules"}</h2>
       <p>Choose how the ${lessonsLabel(ids.length)} in these modules count and when students can open them.</p>
       <form id="add-lessons-form" class="lesson-add-form">
         <fieldset class="lesson-mode">
           <legend>Lesson type</legend>
           <div class="lesson-mode__options">
             ${["assessment", "practice"]
               .map(
                 (mode) => `<label class="lesson-mode__option">
                   <input type="radio" name="mode" value="${mode}" ${mode === settings.mode ? "checked" : ""} />
                   <span><strong>${MODE_LABEL[mode]}</strong><small>${
                     mode === "assessment"
                       ? "Scores are saved and count in reports"
                       : "Students can retry anytime; nothing is saved"
                   }</small></span>
                 </label>`,
               )
               .join("")}
           </div>
           <p class="lesson-schedule__hint">This can't be changed after the lesson is added. A lesson already in this class can be added again as the other type.</p>
           <p class="lesson-add-form__skipped" id="add-lessons-skipped" hidden></p>
         </fieldset>
         <fieldset class="lesson-schedule">
           <legend>Schedule <span>optional</span></legend>
           <label>Opens on
             <input type="datetime-local" name="openAt" value="${escapeHtml(settings.openAt)}" />
           </label>
           <label>Due on
             <input type="datetime-local" name="dueAt" value="${escapeHtml(settings.dueAt)}" />
           </label>
           <p class="lesson-schedule__hint">Leave empty to open right away with no deadline. Past dates are unavailable. A deadline on the opening day is set to 11:59 PM. Students are notified when you add the lesson.</p>
         </fieldset>
         <div class="modal-actions">
           <button class="button secondary" type="button" data-cancel>Cancel</button>
           <button class="button primary" type="submit" data-confirm>Add</button>
         </div>
       </form>`,
      (backdrop, close) => {
        const form = backdrop.querySelector("#add-lessons-form");
        wireLessonSchedule(form);
        const submit = form.querySelector("[data-confirm]");
        const selectedMode = () => (form.elements.mode.value === "practice" ? "practice" : "assessment");

        // Lessons already in the class as the chosen type are skipped; say which.
        const sync = () => {
          const mode = selectedMode();
          settings.mode = mode;
          settings.openAt = form.elements.openAt.value;
          settings.dueAt = form.elements.dueAt.value;
          const adding = toAdd(mode).length;
          const skipped = ids.filter((id) => inClass[mode].has(id));
          const note = form.querySelector("#add-lessons-skipped");
          note.hidden = !skipped.length;
          if (skipped.length) {
            const titles = skipped
              .map((id) => `“${escapeHtml(state.allLessons.find((l) => l.id === id)?.title || "Untitled")}”`)
              .join(", ");
            note.innerHTML = `${titles} ${skipped.length === 1 ? "is" : "are"} already in this class as ${MODE_LABEL[mode]} and will be skipped.`;
          }
          submit.disabled = adding === 0;
          submit.textContent = adding ? `Add ${lessonsLabel(adding)}` : "Nothing to add";
        };
        form.addEventListener("change", sync);
        form.addEventListener("input", sync);
        sync();
        backdrop.querySelector("[data-cancel]").addEventListener("click", close);

        // While saving: the Add button spins with what it's doing, and nothing else can be changed or closed. setBusy(null) puts the form back after a failed save.
        const setBusy = (label) => {
          const busy = Boolean(label);
          submit.setAttribute("aria-busy", String(busy));
          form.querySelectorAll("input, button").forEach((field) => (field.disabled = busy));
          backdrop.querySelector(".modal-close").disabled = busy;
          if (busy) submit.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${escapeHtml(label)}`;
          else sync();
        };

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          // Practice: students can redo it, nothing is saved, and reports leave it out.
          const mode = selectedMode();
          const adding = toAdd(mode);
          if (!adding.length) return;
          const schedule = readSchedule(form, { newLesson: true });
          if (schedule.error) return toast(schedule.error);

          if (selectedModules.length) {
            const ordered = [...links].sort((a, b) => (a.order || 0) - (b.order || 0));
            const existing = [];
            ordered.forEach(link => {
              const title = state.allLessons.find(lesson => lesson.id === linkLessonId(link))?.title || 'Assigned lesson';
              const previous = existing.at(-1);
              const key = link.moduleId || link.id;
              if (previous?.key === key) previous.lessons.push(title);
              else existing.push({ key, title: link.moduleTitle || 'Individual lesson', lessons: [title], existing: true });
            });
            const planned = selectedModules.map(module => ({ title: module.title + (module.customized ? ' — Customized copy' : ''), lessons: module.lessonIds.filter(id => adding.includes(id)).map(id => state.allLessons.find(lesson => lesson.id === id).title) })).filter(module => module.lessons.length);
            if (selectedPath && adding.length !== ids.length) return toast('A lesson in this path is already assigned as this type. Edit a copy so one deadline covers the whole path.');
            if (!await previewModuleOrder([...existing, ...planned], { title: selectedPath ? selectedPath.title : 'Preview module and lesson order', confirm: selectedModules.some(module => module.customized) ? 'Save copies and assign' : selectedPath ? 'Assign learning path' : 'Assign modules', message: 'Review the ordered modules and lessons. The selected schedule applies to this entire assignment. Customized modules are saved as separate versions.' }) || !isCurrent()) return;
          }

          setBusy(`Adding ${lessonsLabel(adding.length)}…`);
          let linkIds = [];
          assignmentBusy = true;
          try {
            const resolvedModules = [];
            for (const module of selectedModules) {
              if (module.customized && !module.savedCopy) {
                module.copyValues ||= { title: contentBaseTitle(module.source), description: module.description || '', lessonIds: [...module.lessonIds], visibility: module.lessonIds.some(id => state.allLessons.find(item => item.id === id)?.visibility === 'private') ? 'private' : module.visibility || 'shared' };
                const id = await saveModule(module.source, module.copyValues);
                module.savedCopy = { ...module.copyValues, id };
              }
              resolvedModules.push(module.savedCopy || module);
            }
            if (selectedPath) {
              const payload = { pathId: selectedPath.id, revision: selectedPath.revision, classId, moduleIds: resolvedModules.map(module => module.id), mode, openAt: schedule.openAt?.toMillis?.() ?? null, dueAt: schedule.dueAt?.toMillis?.() ?? null };
              const fingerprint = JSON.stringify(payload);
              if (lastAssignment && lastAssignment !== fingerprint) assignmentRequestKey = crypto.randomUUID();
              lastAssignment = fingerprint;
              const result = await assignLearningPath({ ...payload, requestKey: assignmentRequestKey });
              linkIds = result.linkIds;
            } else {
            // An Assessment link's id is the lesson id, so Firestore rules can look up its schedule; a Practice link is "{lessonId}__practice" so both can be in the class.
            const batch = writeBatch(db);
            const lastOrder = Math.max(0, ...links.map(link => Number(link.order) || 0));
            adding.forEach((lessonId, index) => {
              const module = resolvedModules.find(item => item.lessonIds.includes(lessonId));
              const linkId = mode === "practice" ? practiceLinkId(lessonId) : lessonId;
              // A Practice link saved under the lesson id (before both could be added) moves aside.
              const occupant = links.find((link) => link.id === lessonId && linkMode(link) === "practice");
              if (mode === "assessment" && occupant) {
                const { id, ...data } = occupant;
                batch.set(doc(db, "classes", classId, "classLessons", practiceLinkId(lessonId)), { ...data, lessonId });
              }
              linkIds.push(linkId);
              batch.set(doc(db, "classes", classId, "classLessons", linkId), {
                lessonId,
                teacherId: state.user.uid,
                order: lastOrder + index + 1,
                ...(module ? { moduleId: module.id, moduleTitle: module.title, moduleOrder: module.lessonIds.indexOf(lessonId) + 1, moduleRevision: module.revision } : {}),
                createdAt: serverTimestamp(),
                openAt: schedule.openAt,
                dueAt: schedule.dueAt,
                mode,
                notifyPending: true,
              });
            });
            await batch.commit();
            }
          } catch (err) {
            assignmentBusy = false;
            setBusy(null);
            return toast(err.message);
          }

          // Saved; the button keeps spinning until the students are notified.
          const added = `${adding.length} lesson${adding.length > 1 ? "s" : ""} added`;
          setBusy("Notifying students…");
          try {
            await notifyStudents(classId, linkIds);
            toast(`${added}. Students were notified.`);
          } catch (err) {
            console.error("notifyStudents failed —", err);
            toast(`${added}, but students were not notified (${err.message}).`);
          }
          close();
          queuedModules = []; selectedPath = null; assignmentBusy = false; guard();
          navigate(`/classes/${encodeURIComponent(classId)}`);
        });
      },
      // The picks stay on the page and the settings are remembered, so closing loses nothing.
      { closeOnBackdrop: false },
    );
  }
}
