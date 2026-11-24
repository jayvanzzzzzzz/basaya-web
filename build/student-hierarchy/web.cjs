const fs = require('fs');
const file = 'student/views/home.js';
let s = fs.readFileSync(file, 'utf8');
s = "import { pathModules, sequenceBlocker, lessonSequence } from '../../js/studentSequence.js';\n" + s;
s = s.replace('<span class="st-lesson__eyebrow">${lesson.order > 0 ? `ARALIN ${lesson.order}` : "ARALIN"}</span>', '');
s = s.replace('<span class="st-lesson__eyebrow">LESSON PATH ${path.pathNumber}</span>', '');
s = s.replace('let activePathId = null;', `let activePathId = null;
  let activeModuleId = null;`);
s = s.replace('const viewItems = () => activePathId ? student.lessons.filter(lesson => lesson.learningPathAssignmentId === activePathId) : assignedStudentPaths();', `const pathLessons = () => student.lessons.filter(lesson => lesson.learningPathAssignmentId === activePathId);
  const modules = () => pathModules(pathLessons()).map(module => {
    const done = module.members.filter(isComplete).length, finished = done === module.members.length;
    return { ...module.members[0], ...module, done, started: module.members.some(item => statusOf(item).key === 'progress'),
      practice: module.members.every(item => item.practice), lectureFinished: finished, gameFinished: finished,
      activityFinished: finished, pronunciationFinished: finished, quizFinished: finished,
      gameSkipped: false, activitySkipped: false, pronunciationSkipped: false, quizSkipped: false };
  });
  const viewItems = () => !activePathId ? assignedStudentPaths() : !activeModuleId ? modules() : lessonSequence(pathLessons().filter(lesson => (lesson.moduleId || '__lessons') === activeModuleId));`);
s = s.replace("const unlocked = path.members.some(canOpen),", "const unlocked = path.members.some(canOpen),");
s = s.replace('  const closed = availability(lesson) === "closed";', `  const prerequisite = sequenceBlocker(lesson, student.lessons);
  if (prerequisite) return showDialog({ iconName: 'lock', tone: 'locked', title: 'Naka-lock', message: 'Tapusin muna: ' + prerequisite.title });
  const closed = availability(lesson) === "closed";`);
s = s.replace("if (activePathId && !student.lessons.some(lesson => lesson.learningPathAssignmentId === activePathId)) activePathId = null;", "if (activePathId && !pathLessons().length) { activePathId = null; activeModuleId = null; }");
s = s.replace("$('#home-path-title').textContent = activePathId ? student.lessons.find(lesson => lesson.learningPathAssignmentId === activePathId)?.learningPathTitle || 'Lesson path' : '';", `$('#home-path-title').textContent = activeModuleId ? modules().find(item => item.id === activeModuleId)?.title || 'Mga aralin' : activePathId ? pathLessons()[0]?.learningPathTitle || 'Lesson path' : '';
    $('#home-back-path').textContent = activeModuleId ? 'Bumalik sa mga module' : 'Bumalik sa mga lesson path';
    $('.st-library-heading h2').textContent = activeModuleId ? 'Mga aralin' : activePathId ? 'Mga module' : 'Aking mga lesson path';
    $('.st-library-heading > span').textContent = activeModuleId ? 'Tapusin ang aralin upang buksan ang susunod.' : activePathId ? 'Tapusin ang module upang buksan ang susunod.' : 'Sundin ang pagkakasunod-sunod ng iyong mga lesson path';`);
s = s.replace("search.placeholder = activePathId ? 'Hanapin ang aralin sa path' : 'Hanapin ang lesson path';", "search.placeholder = activeModuleId ? 'Hanapin ang aralin' : activePathId ? 'Hanapin ang module' : 'Hanapin ang lesson path';");
s = s.replace('activePathId ? lessonCard(lesson, query) : studentPathCard(lesson, query)', 'activeModuleId ? lessonCard(lesson, query) : activePathId ? moduleCard(lesson, query) : studentPathCard(lesson, query)');
s = s.replace('if (!activePathId) { draw(); return; }', 'if (!activeModuleId) { draw(); return; }');
s = s.replace("activePathId = target.learningPathAssignmentId; draw();", "activePathId = target.learningPathAssignmentId; activeModuleId = target.moduleId || '__lessons'; draw();");
s = s.replace("activePathId = null; search.value = ''; activeTab", "if (activeModuleId) activeModuleId = null; else activePathId = null; search.value = ''; activeTab");
s = s.replace("  search.addEventListener(\"input\", draw);", `  list.addEventListener('click', event => {
    const button = event.target.closest('[data-student-module]'); if (!button) return;
    const module = modules().find(item => item.id === button.dataset.studentModule); if (!module) return;
    const first = module.members[0];
    if (!module.members.some(canOpen)) return showLocked(first);
    activeModuleId = module.id; search.value = ''; activeTab = 'all'; activeStatus = 'all'; draw(); $('#home-back-path').focus();
  });
  search.addEventListener("input", draw);`);
// Preserve lesson ordering regardless of completion state, deadline, search or filters.
s = s.replace(".sort(student.lessons.some(item => item.learningPathAssignmentId) ? (a, b) => a.order - b.order : compareBySchedule)", "");
s = s.replace('function matchesLessonTab(lesson, tab) {', `function moduleCard(module, search) {
  const unlocked = module.members.some(canOpen);
  const percent = Math.round(module.done / module.members.length * 100);
  const reason = sequenceBlocker(module.members[0], student.lessons);
  return \`<li class="st-lesson-card st-module-card"><button type="button" class="st-lesson\${unlocked ? '' : ' is-locked'}" data-student-module="\${escapeHtml(module.id)}"><strong class="st-lesson__title">\${highlight(module.title, search)}</strong><span class="st-lesson__desc">\${module.members.length} aralin</span><span class="st-lesson__progress"><span class="st-bar" role="progressbar" aria-label="Mga araling natapos" aria-valuemin="0" aria-valuemax="100" aria-valuenow="\${percent}"><i style="width:\${percent}%"></i></span><b>\${module.done}/\${module.members.length}</b></span><span class="st-lesson__action">\${unlocked ? 'Buksan ang module' : reason ? 'Tapusin muna: ' + escapeHtml(reason.title) : 'Naka-lock'}\${icon(unlocked ? 'chevron' : 'lock')}</span>\${unlocked ? '' : lockOverlay()}</button></li>\`;
}
function lockOverlay() { return \`<span class="st-sequence-lock" aria-hidden="true">\${icon('lock')}</span>\`; }
function matchesLessonTab(lesson, tab) {`);
// Overlay is decorative; readable status/action remains available to assistive technology.
s = s.replace('      </button>\n      ${isInstalledPwa()', '      ${canOpen(lesson) ? "" : lockOverlay()}</button>\n      ${isInstalledPwa()');
s = s.replace('</span></button></li>`;\n}\n\nfunction moduleCard', '</span>${unlocked ? "" : lockOverlay()}</button></li>`;\n}\n\nfunction moduleCard');
fs.writeFileSync(file, s);
fs.appendFileSync('css/pages/student-home.css', `
/* Sequential path/module/lesson cards share the current theme surface. */
.st-lesson.is-locked { position: relative; overflow: hidden; }
.st-lesson.is-locked .st-lesson__title { padding-inline-end: 3rem; }
.st-sequence-lock { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(135deg, transparent 50%, color-mix(in srgb, currentColor 5%, transparent)); border: 1px solid color-mix(in srgb, currentColor 15%, transparent); border-radius: inherit; }
.st-sequence-lock > svg { position: absolute; top: 1.2rem; right: 1.2rem; width: 1.5rem; height: 1.5rem; }
.st-home-path-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
.st-home-path-heading[hidden] { display: none; }
.st-home-path-heading h2 { overflow-wrap: anywhere; margin: 0; }
`);
