const fs = require('node:fs');
const file = 'student/views/home.js';
let source = fs.readFileSync(file, 'utf8');
function replace(a,b) { if (!source.includes(a)) throw Error('Missing: '+a); source=source.replace(a,b); }
replace('function studentPathCard(path, search) {', `function pathDownloadControls(path) {
  if (!isInstalledPwa()) return '';
  const saved = path.members.filter(lesson => downloads.has(lesson.id)).length;
  const busy = bulkDownloading || downloading.size > 0 || removingDownloads.size > 0;
  const disabled = busy || !navigator.onLine || !path.members.some(lesson => canOpen(lesson) && !downloads.has(lesson.id));
  const action = '<button class="button secondary" type="button" data-download-path="' + escapeHtml(path.id) + '" ' + (disabled ? 'disabled' : '') + '>' + icon('download') + 'I-download</button>';
  return '<div class="st-path-download-actions">' + action + '<span>' + saved + '/' + path.members.length + ' na-download</span></div>' +
    '<details class="st-download-menu"><summary aria-label="Mga opsyon sa download: ' + escapeHtml(path.title) + '" title="Mga opsyon sa download"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></summary><div class="st-download-controls"><span>I-save ang mga bukas na aralin para magamit offline</span>' + action +
    '<button class="button secondary" type="button" data-remove-path-download="' + escapeHtml(path.id) + '" ' + (saved ? '' : 'hidden') + (busy ? ' disabled' : '') + '>Alisin ang download</button></div></details>';
}
function studentPathCard(path, search) {`);
replace('class="st-lesson-card st-assigned-path"', 'class="st-lesson-card st-assigned-path${isInstalledPwa() ? " has-download-menu" : ""}"');
const start = source.indexOf('function studentPathCard('), end = source.indexOf('function moduleCard(',start);
const section=source.slice(start,end).replace('</button></li>', '</button>${pathDownloadControls(path)}</li>');
source=source.slice(0,start)+section+source.slice(end);
replace('  downloadAll?.addEventListener("click", async () => {', '  const downloadPath = async (targetPathId = activePathId) => {');
replace('(!activePathId || lesson.learningPathAssignmentId === activePathId) && canOpen(lesson) && !downloads.has(lesson.id));\n      const result', '(!targetPathId || lesson.learningPathAssignmentId === targetPathId) && canOpen(lesson) && !downloads.has(lesson.id));\n      const result');
replace('  const refresh = $("#home-refresh");', `  downloadAll?.addEventListener("click", () => downloadPath());
  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-download-path], [data-remove-path-download]');
    if (!button || button.disabled || !isInstalledPwa() || bulkDownloading || downloading.size || removingDownloads.size) return;
    const id = button.dataset.downloadPath || button.dataset.removePathDownload;
    if (button.hasAttribute('data-download-path')) { await downloadPath(id); return; }
    const uid = student.uid, cid = classId();
    if (!await confirmAction({ title: 'Alisin ang download ng lesson path?', message: 'Kailangan mo ng internet para i-download muli ang mga aralin. Mananatili ang iyong mga resulta.', confirm: 'Alisin', danger: true, student: true })) return;
    if (!active || student.uid !== uid || classId() !== cid || bulkDownloading || downloading.size || removingDownloads.size) return;
    const queue = student.lessons.filter(lesson => lesson.learningPathAssignmentId === id && downloads.has(lesson.id));
    queue.forEach(lesson => removingDownloads.add(lesson.id));
    refreshDownloads();
    try {
      for (const lesson of queue) {
        if (!active || student.uid !== uid || classId() !== cid) break;
        await removeLessonDownload(lesson.id);
      }
    } catch (error) { if (active) toast(error.message || 'Hindi naalis ang download. Subukan muli.'); }
    finally {
      queue.forEach(lesson => removingDownloads.delete(lesson.id));
      if (student.uid === uid && classId() === cid) downloads = new Map((await downloadedLessons()).map(item => [item.meta.id, item]));
      window.dispatchEvent(new Event('basaya-download-state'));
    }
  });

  const refresh = $("#home-refresh");`);
// The bulk handler is now a reusable function rather than a DOM listener.
replace('  });\n\n  downloadAll?.addEventListener("click", () => downloadPath());', '  };\n\n  downloadAll?.addEventListener("click", () => downloadPath());');
fs.writeFileSync(file,source);
