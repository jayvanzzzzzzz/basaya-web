import { $, escapeHtml, page } from '../../js/helpers.js';
import { postToApi } from '../../js/api.js';
import { latestReadingSubmissions } from '../../js/readingSubmissions.js';
import { readingRoster, readingLessonTitles } from './readingRoster.js';
import { attachFloatingTooltips } from '../../js/floatingTooltip.js';
import { paginate } from '../../js/pagination.js';

const reviewIcons = {
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  play: '<path class="review-icon-tint" d="m8 4 12 8-12 8z"/><path d="m8 4 12 8-12 8zM4 5v14"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  save: '<path class="review-icon-tint" d="M4 4h13l3 3v13H4z"/><path d="M4 4h13l3 3v13H4zM8 4v6h8V4M8 20v-6h8v6"/>',
  retry: '<path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  loading: '<path d="M20 12a8 8 0 1 1-8-8"/>',
  open: '<path class="review-icon-tint" d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M5 3h10l4 4v14H5zM8 13v3m3-5v7m3-5v3m3-4v5"/>',
  lesson: '<path class="review-icon-tint" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21V5.5ZM8 7h7m-7 4h5M4 19a2 2 0 0 1 2-2h13"/>',
};
const reviewIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${reviewIcons[name]}</svg>`;
function iconControl(control, name, label) {
  control.innerHTML = reviewIcon(name);
  control.classList.add('reading-icon-button');
  control.setAttribute('aria-label', label);
  control.setAttribute('data-floating-tooltip', label);
  control.setAttribute('data-reading-tooltip', '');
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const audioCountMarkup = count => Number.isInteger(count)
  ? `<span class="reading-audio-count"><b>${count}</b> <span>${count === 1 ? 'recording' : 'recordings'}</span></span>`
  : 'Loading audio count…';
const dateLabel = value => Number(value) ? new Date(Number(value)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Submission date unavailable';
const audioTime = seconds => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
function readingAudioPlayer(audio, index, play) {
  const number = index + 1;
  const player = document.createElement('div'); player.className = 'reading-player';
  player.setAttribute('role', 'group'); player.setAttribute('aria-label', `Recording for page ${number}`);
  player.innerHTML = `<button type="button" class="reading-player__play" data-audio-toggle></button>
    <div class="reading-player__timeline">
      <input class="reading-player__seek" type="range" min="0" max="1000" step="1" value="0" disabled aria-label="Seek recording for page ${number}">
      <div class="reading-player__footer"><span class="reading-player__time"><span data-audio-elapsed>0:00</span><span aria-hidden="true"> / </span><span data-audio-total>--:--</span></span>
        <div class="reading-player__tools"><label class="reading-player__speed"><span class="sr-only">Playback speed for page ${number}</span><select data-audio-speed><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><button type="button" class="reading-player__mute" data-audio-mute></button></div>
      </div>
    </div>`;
  audio.after(player); audio.controls = false; audio.hidden = true;
  const toggle = player.querySelector('[data-audio-toggle]');
  const mute = player.querySelector('[data-audio-mute]');
  const seek = player.querySelector('input');
  const speed = player.querySelector('select');
  let wasPlaying = false, wasMuted = null;
  const sync = () => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const progress = duration ? Math.min(1000, Math.round(current / duration * 1000)) : 0;
    seek.disabled = !duration || !!audio.error; seek.value = String(progress);
    seek.style.setProperty('--audio-progress', `${progress / 10}%`);
    seek.setAttribute('aria-valuetext', `${audioTime(current)} of ${duration ? audioTime(duration) : 'unknown duration'}`);
    player.querySelector('[data-audio-elapsed]').textContent = audioTime(current);
    player.querySelector('[data-audio-total]').textContent = duration ? audioTime(duration) : '--:--';
    const playing = !audio.paused && !audio.ended;
    if (playing !== wasPlaying || !toggle.hasAttribute('aria-label')) {
      iconControl(toggle, playing ? 'pause' : 'play', `${playing ? 'Pause' : 'Play'} recording for page ${number}`);
      wasPlaying = playing;
    }
    player.classList.toggle('is-playing', playing);
    const muted = !!audio.muted;
    if (muted !== wasMuted) {
      iconControl(mute, muted ? 'muted' : 'volume', `${muted ? 'Unmute' : 'Mute'} recording for page ${number}`);
      mute.setAttribute('aria-pressed', String(muted)); wasMuted = muted;
    }
    const rate = String(audio.playbackRate || 1);
    if (speed.value !== rate) speed.value = rate;
  };
  toggle.onclick = () => { if (audio.paused || audio.ended) void play(); else audio.pause(); };
  mute.onclick = () => { audio.muted = !audio.muted; sync(); };
  seek.addEventListener('input', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Number(seek.value) / 1000 * audio.duration;
    sync();
  });
  speed.addEventListener('change', () => { audio.playbackRate = Number(speed.value); });
  for (const event of ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'volumechange', 'ratechange', 'emptied', 'error']) audio.addEventListener(event, sync);
  sync();
}
const status = row => `<span class="reading-status${row.status === 'graded' ? ' is-reviewed' : ''}">${row.status === 'graded' ? 'Reviewed' : 'Needs review'}</span>`;

const REVIEW_WINDOW = 48 * 60 * 60 * 1000;
function lessonDeadline(lessonId, links) {
  const deadlines = links.filter(link => link.mode !== 'practice' && (link.lessonId || link.id) === lessonId)
    .map(link => Number(link.dueAt?.toMillis?.() ?? link.dueAt))
    .filter(value => Number.isFinite(value) && value > 0);
  return deadlines.length ? Math.min(...deadlines) : null;
}
export function lessonReviewState(reviewed, deadline, now = Date.now()) {
  if (reviewed) return { label: 'Reviewed', className: 'is-reviewed' };
  if (!deadline) return { label: 'No deadline', className: 'is-quiet' };
  if (deadline < now) return { label: 'Overdue', className: 'is-urgent' };
  if (deadline <= now + REVIEW_WINDOW) return { label: 'Due soon', className: 'is-urgent' };
  return { label: 'Upcoming', className: 'is-upcoming' };
}
function paintLessonDeadline(row, now = Date.now()) {
  const state = lessonReviewState(row.classList.contains('is-reviewed'), Number(row.dataset.lessonDeadline), now);
  const badge = row.querySelector('.reading-status');
  badge.className = `reading-status ${state.className}`;
  badge.textContent = state.label;
}
export function readingReviewQueue(roster, rows, links = [], now = Date.now()) {
  return roster.map(student => {
    const submissions = rows.filter(row => row.uid === student.uid);
    const pending = submissions.filter(row => row.status === 'submitted');
    const deadlines = pending.flatMap(reading => links.filter(link => link.mode !== 'practice' && (link.lessonId || link.id) === reading.lessonId)
      .map(link => Number(link.dueAt?.toMillis?.() ?? link.dueAt) || 0).filter(value => value > 0));
    const deadline = deadlines.length ? Math.min(...deadlines) : null;
    return { ...student, pending: pending.length, total: submissions.length, deadline, urgent: deadline != null && deadline <= now + REVIEW_WINDOW };
  })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

function paintReviewDeadline(row, now = Date.now()) {
  const deadline = Number(row.dataset.reviewDeadline) || 0;
  const urgent = deadline > 0 && deadline <= now + REVIEW_WINDOW;
  row.querySelector('.reading-student-dot').classList.toggle('is-urgent', urgent);
  const note = row.querySelector('.reading-deadline-note');
  note.hidden = !urgent;
  note.textContent = urgent ? deadline <= now ? 'Overdue' : 'Due within 48 hours' : '';
}

export async function renderFluencyReview(classId, studentId = null, submissionId = null) {
  const base = `#/classes/${encodeURIComponent(classId)}/readings`;
  const studentUrl = uid => `${base}/${encodeURIComponent(uid)}`;
  const request = (operation, fields = {}) => postToApi('assessment', { operation: `fluency-${operation}`, classId, ...fields });
  page('Review readings', 'Choose a student to review their lesson recordings.');
  $('#page-content').innerHTML = '<section id="reading-review" class="reading-review" aria-busy="true"><p role="status">Loading student readings…</p></section>';
  const target = $('#reading-review');
  const stopTooltips = attachFloatingTooltips($('#app-view') || document.body, '[data-reading-tooltip]');
  let rows = [], roster = [], lessonLinks = [], className = 'Class', classSection = '', players = [], generation = 0, dirty = false, saving = false, deadlineTimer, stopGradingLayout = () => {};
  const stop = () => { players.forEach(audio => { audio.pause(); audio.onended = null; }); players = []; };
  const beforeUnload = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
  const guard = event => {
    if (!target.isConnected || !event.target.closest('a[href]')) return;
    if (saving || (dirty && !window.confirm('Leave this review without saving your changes?'))) event.preventDefault();
  };
  window.addEventListener('beforeunload', beforeUnload);
  document.addEventListener('click', guard, true);
  const observer = new MutationObserver(() => {
    if (!target.isConnected) {
      stop(); stopGradingLayout(); stopTooltips(); clearInterval(deadlineTimer); window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', guard, true); observer.disconnect();
    }
  });
  observer.observe(document.body, { subtree: true, childList: true });

  function refineControls() {
    const back = $('#page-header .header-actions a');
    if (back) iconControl(back, 'back', back.getAttribute('aria-label') || back.textContent.trim());
    target.querySelectorAll('button, .reading-grade__actions a').forEach(control => {
      if (control.hasAttribute('data-grade-drawer-control') || control.hasAttribute('data-reading-filter')) return;
      const label = control.textContent.trim();
      const icon = control.matches('[type="submit"]') ? 'save' : control.hasAttribute('data-review-play-all') ? 'play' : control.tagName === 'A' ? 'back' : 'retry';
      iconControl(control, icon, label);
    });
  }

  function header(student, entry) {
    const crumbs = student ? [{ label: className, href: `#/classes/${encodeURIComponent(classId)}` }] : [];
    if (student) crumbs.push({ label: 'Students', href: base });
    if (entry) crumbs.push({ label: student.name, href: studentUrl(student.uid) });
    page(student ? student.name : 'Review readings', entry ? `${className} · ${entry.title}` : student ? className : '',
      `<a class="button secondary" href="${entry ? studentUrl(student.uid) : student ? base : `#/classes/${encodeURIComponent(classId)}`}">${entry ? 'Back to lessons' : student ? 'Back to students' : 'Back to class'}</a>`, { crumbs });
    const back = $('#page-header .header-actions a');
    if (back) iconControl(back, 'back', back.textContent.trim());
  }
  function directory(student) {
    generation++; stop(); dirty = false; header(student);
    const lessons = student ? rows.filter(row => row.uid === student.uid).map(row => ({ ...row, deadline: lessonDeadline(row.lessonId, lessonLinks) })).sort((a, b) => Number(a.status === 'graded') - Number(b.status === 'graded') || b.submittedAt - a.submittedAt) : [];
    const students = readingReviewQueue(roster, rows, lessonLinks);
    const count = student ? lessons.length : students.length;
    const directoryRows = student ? lessons.length ? `
      <table class="reading-student-table reading-lesson-table" role="table">
        <caption class="sr-only">Student lesson recordings</caption>
        <thead><tr role="row"><th scope="col">Lesson Title</th><th scope="col">Audio count</th><th scope="col">Deadline</th><th scope="col">Review status</th><th scope="col"><span class="sr-only">Review lesson</span></th></tr></thead>
        <tbody>${lessons.map(row => `
          <tr class="reading-row reading-student-row reading-lesson-row${row.status === 'graded' ? ' is-reviewed' : ' needs-review'}" role="row" data-lesson-deadline="${row.deadline || ''}">
            <th scope="row" role="rowheader"><span class="reading-lesson-identity"><span class="reading-lesson-symbol" aria-hidden="true">${reviewIcon('lesson')}</span><span class="reading-row__body"><strong>${escapeHtml(row.title || 'Reading lesson')}</strong></span></span></th>
            <td class="reading-student-submitted" role="cell"><span class="reading-mobile-label" aria-hidden="true">Audio count</span><span data-page-count="${escapeHtml(row.id)}">${audioCountMarkup(row.pageCount)}</span></td>
            <td class="reading-lesson-deadline" role="cell"><span class="reading-mobile-label" aria-hidden="true">Deadline</span>${row.deadline ? `<time datetime="${new Date(row.deadline).toISOString()}">${escapeHtml(new Date(row.deadline).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</time>` : '<span>No deadline</span>'}</td>
            <td class="reading-student-status" role="cell"><span class="reading-mobile-label" aria-hidden="true">Review status</span>${status(row)}</td>
            <td class="reading-student-open" role="cell"><a class="reading-icon-button" href="${studentUrl(student.uid)}/${encodeURIComponent(row.id)}" aria-label="Review ${escapeHtml(row.title || 'Reading lesson')}" data-floating-tooltip="Review ${escapeHtml(row.title || 'Reading lesson')}" data-reading-tooltip>${reviewIcon('open')}</a></td>
          </tr>`).join('')}</tbody>
      </table>` : '' : students.length ? `
      <table class="reading-student-table" role="table">
        <caption class="sr-only">Student reading submissions</caption>
        <thead><tr role="row"><th scope="col">Student</th><th scope="col">Submitted</th><th scope="col">Review status</th><th scope="col"><span class="sr-only">Open readings</span></th></tr></thead>
        <tbody>${students.map(item => `
          <tr class="reading-row reading-student-row" role="row" data-review-deadline="${item.deadline || ''}">
            <th scope="row" role="rowheader"><div class="reading-student-identity"><span class="reading-student-dot${item.pending ? ' is-pending' : ''}${item.urgent ? ' is-urgent' : ''}" aria-hidden="true"></span><span class="reading-row__body"><strong>${escapeHtml(item.name)}</strong></span></div></th>
            <td class="reading-student-submitted" role="cell"><span class="reading-mobile-label" aria-hidden="true">Submitted</span><span class="reading-submitted__value">${item.total ? `<b>${item.total}</b> <span>${item.total === 1 ? 'lesson' : 'lessons'}</span>` : 'No submissions'}</span></td>
            <td class="reading-student-status" role="cell"><span class="reading-mobile-label" aria-hidden="true">Review status</span><span class="reading-student-review-state"><span class="reading-status${item.pending ? '' : ' is-clear'}">${item.pending ? `${plural(item.pending, 'lesson')} to review` : 'No pending reviews'}</span><span class="reading-deadline-note" ${item.urgent ? '' : 'hidden'}>${item.urgent ? item.deadline <= Date.now() ? 'Overdue' : 'Due within 48 hours' : ''}</span></span></td>
            <td class="reading-student-open" role="cell"><a class="reading-icon-button" href="${studentUrl(item.uid)}" aria-label="Open readings for ${escapeHtml(item.name)}" data-floating-tooltip="Open readings for ${escapeHtml(item.name)}" data-reading-tooltip>${reviewIcon('open')}</a></td>
          </tr>`).join('')}</tbody>
      </table>` : '';
    target.innerHTML = `<section class="reading-directory">
      <div class="reading-directory__heading"><div>${student ? '<p class="reading-eyebrow">Lesson recordings</p>' : ''}<h2>${student ? 'Submitted lessons' : 'Students'}</h2><p>${student ? 'Newest submission per lesson. Choose a lesson to listen and grade.' : 'Students awaiting review, sorted A–Z.'}</p></div>${student ? `<span class="reading-total">${plural(count, 'lesson')}</span>` : ''}</div>
      <div class="reading-directory__rows">${directoryRows}${count ? '' : `<div class="reading-empty"><h3>${student ? 'No lessons submitted yet' : roster.length ? 'No pending reviews' : 'No students yet'}</h3><p>${student ? 'This student’s submitted recordings will appear here.' : roster.length ? 'Students appear here when a reading needs your review.' : 'Enrolled students will appear here when they join your class.'}</p></div>`}</div>
    </section>`;
    target.querySelectorAll('.reading-student-row').forEach(row => row.addEventListener('click', event => {
      if (event.defaultPrevented || event.target.closest('a,button') || window.getSelection?.()?.toString()) return;
      row.querySelector('a').click();
    }));
    if (student) target.querySelector('.reading-directory__heading')?.remove();
    else target.querySelector('.reading-directory__heading p')?.remove();
    if (!student && students.length) target.querySelector('.reading-directory__heading').insertAdjacentHTML('afterend', `
      <div class="reading-dot-legend" role="group" aria-label="Review deadline colors">
        <span><i class="reading-dot-legend__marker is-clear" aria-hidden="true"></i>Green: no pending reviews</span>
        <span><i class="reading-dot-legend__marker" aria-hidden="true"></i>Orange: due in more than 48 hours or no deadline</span>
        <span><i class="reading-dot-legend__marker is-urgent" aria-hidden="true"></i>Red: due within 48 hours or overdue</span>
      </div>`);
    clearInterval(deadlineTimer);
    let refreshFilters = () => {};
    target.querySelectorAll('.reading-lesson-row').forEach(row => paintLessonDeadline(row));
    if (count) deadlineTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (student) target.querySelectorAll('.reading-lesson-row').forEach(row => paintLessonDeadline(row));
      else {
        target.querySelectorAll('.reading-student-row').forEach(row => paintReviewDeadline(row));
        refreshFilters();
      }
    }, 60000);
    target.removeAttribute('aria-busy');
    const pending = (student ? lessons : rows).filter(row => row.status === 'submitted').length;
    target.insertAdjacentHTML('afterbegin', `<div class="reading-review-summary${student ? '' : ' reading-review-summary--class'}" aria-label="Review queue">
      ${student ? '' : `<div class="reading-review-summary__class"><h2>${escapeHtml(className)}</h2>${classSection ? `<p>Section ${escapeHtml(classSection)}</p>` : ''}</div>`}
      <div class="reading-review-summary__pending"><span class="reading-eyebrow">${student ? 'This reader' : 'Class review queue'}</span><p><strong>${pending}</strong><span>${pending === 1 ? 'lesson awaiting review' : 'lessons awaiting review'}</span></p></div>
      </div>`);
    refineControls();
    if (!student && students.length) {
      const filters = [['all', 'All students'], ['pending', 'Needs review'], ['urgent', 'Due soon / overdue'], ['clear', 'No pending reviews']];
      target.querySelector('.reading-directory__heading').insertAdjacentHTML('afterend', `<div class="reading-filter-ribbon" role="group" aria-label="Filter students by review status">${filters.map(([key, label]) => `<button type="button" data-reading-filter="${key}" aria-pressed="${key === 'all'}"><span>${label}</span><span class="reading-filter-count" data-filter-count="${key}"></span></button>`).join('')}</div>`);
      target.querySelector('.reading-directory__rows').insertAdjacentHTML('afterend', '<p class="reading-filter-empty" role="status" hidden>No students match this filter.</p>');
      let activeFilter = 'all';
      const studentRows = [...target.querySelectorAll('.reading-student-row')];
      const matches = (row, key) => key === 'all' || (key === 'pending' ? !!row.querySelector('.is-pending') : key === 'urgent' ? !!row.querySelector('.is-pending.is-urgent') : !row.querySelector('.is-pending'));
      const decoratePagination = () => target.querySelectorAll('.pagination__button--nav').forEach(button => {
        button.querySelectorAll('span').forEach(span => span.remove());
        button.setAttribute('data-reading-tooltip', '');
        button.setAttribute('data-floating-tooltip', button.getAttribute('aria-label'));
      });
      const pagination = paginate({
        rows: () => [...target.querySelectorAll('.reading-student-row')],
        after: target.querySelector('.reading-directory__rows'),
        label: ['student', 'students'],
        onChange: decoratePagination,
      });
      refreshFilters = (reset = false) => {
        studentRows.forEach(row => { row.hidden = !matches(row, activeFilter); });
        target.querySelectorAll('[data-reading-filter]').forEach(button => {
          button.setAttribute('aria-pressed', String(button.dataset.readingFilter === activeFilter));
          button.querySelector('[data-filter-count]').textContent = String(studentRows.filter(row => matches(row, button.dataset.readingFilter)).length);
        });
        target.querySelector('.reading-filter-empty').hidden = studentRows.some(row => !row.hidden);
        if (reset) pagination.reset(); else pagination.refresh();
      };
      target.querySelectorAll('[data-reading-filter]').forEach(button => button.addEventListener('click', () => {
        activeFilter = button.dataset.readingFilter; refreshFilters(true);
      }));
      refreshFilters();
      decoratePagination();
    }
    // Older API responses omit page counts. Read the recorded attempt, rather
    // than guessing from lesson content that might have changed since submission.
    const version = generation;
    if (student) void (async () => {
      for (const row of lessons.filter(row => !Number.isInteger(row.pageCount))) {
        if (!target.isConnected || version !== generation) return;
        let label;
        try { const result = await request('play', { submissionId: row.id }); row.pageCount = result.pages.length; label = plural(row.pageCount, 'recording'); }
        catch { label = 'Open lesson to view recordings'; }
        if (!target.isConnected || version !== generation) return;
        const node = [...target.querySelectorAll('[data-page-count]')].find(node => node.dataset.pageCount === row.id);
        if (node) {
          if (Number.isInteger(row.pageCount)) node.innerHTML = audioCountMarkup(row.pageCount);
          else node.textContent = label;
        }
      }
    })();
  }
  async function grading(student, entry) {
    const version = ++generation; header(student, entry);
    target.innerHTML = '<p role="status">Loading recordings…</p>';
    try {
      const result = await request('play', { submissionId: entry.id });
      if (!target.isConnected || version !== generation) return;
      entry.pageCount = result.pages.length;
      const criteria = [['accuracy', 'Accuracy'], ['smoothness', 'Smoothness and pace'], ['expression', 'Expression and phrasing']];
      const levels = ['Needs guidance', 'Developing', 'Mostly fluent', 'Fluent'];
      target.innerHTML = `<div class="reading-workspace"><section class="reading-recordings" aria-labelledby="recording-title"><div class="reading-recordings__heading"><div><p class="reading-eyebrow">Lesson recordings</p><h2 id="recording-title">${escapeHtml(entry.title || 'Reading lesson')}</h2><p>${plural(result.pages.length, 'recorded page')} · ${escapeHtml(dateLabel(entry.submittedAt))}</p></div><button type="button" class="button secondary" data-review-play-all ${result.pages.length ? '' : 'disabled'}>Play all</button></div>${result.pages.map((item, i) => `<article class="reading-clip"><h3>Page ${i + 1}</h3><p>${escapeHtml(item.sentence)}</p><audio controls preload="metadata" aria-label="Student recording for page ${i + 1}" src="${escapeHtml(item.recordingUrl)}"></audio></article>`).join('')}</section><form id="reading-grade" class="reading-grade"><p class="reading-eyebrow">Teacher assessment</p><h2>Grade this lesson</h2>${status(entry)}<fieldset><legend>Reading rubric</legend>${criteria.map(([key, label]) => `<label for="reading-${key}">${label}</label><select required id="reading-${key}" name="${key}"><option value="">Choose score</option>${levels.map((level, i) => `<option value="${i + 1}" ${result.grade?.[key] === i + 1 ? 'selected' : ''}>${i + 1} — ${level}</option>`).join('')}</select>`).join('')}</fieldset><p id="reading-review-error" role="status" aria-live="polite"></p><div class="reading-grade__actions"><button type="submit" class="button primary">Save grade</button><a href="${studentUrl(student.uid)}">Back to lessons</a></div></form></div>`;
      target.removeAttribute('aria-busy'); players = [...target.querySelectorAll('audio')];
      const assessment = $('#reading-grade');
      const assessmentHeader = document.createElement('header'); assessmentHeader.className = 'reading-grade__header';
      while (assessment.firstElementChild && !assessment.firstElementChild.matches('fieldset')) assessmentHeader.append(assessment.firstElementChild);
      const assessmentBody = document.createElement('div'); assessmentBody.className = 'reading-grade__body';
      while (assessment.firstElementChild && !assessment.firstElementChild.matches('#reading-review-error')) assessmentBody.append(assessment.firstElementChild);
      assessment.prepend(assessmentHeader, assessmentBody);
      assessmentHeader.querySelector('h2').id = 'assessment-title';
      assessmentHeader.insertAdjacentHTML('beforeend', '<button type="button" class="reading-grade__close button secondary" data-grade-drawer-control>Back to recordings</button>');
      const drawer = document.createElement('dialog'); drawer.className = 'reading-grade-drawer'; drawer.setAttribute('aria-labelledby', 'assessment-title');
      const opener = document.createElement('button'); opener.type = 'button'; opener.className = 'button primary reading-grade-launch'; opener.textContent = 'Grade lesson'; opener.setAttribute('data-grade-drawer-control', ''); opener.setAttribute('aria-haspopup', 'dialog');
      target.append(drawer, opener);
      const compact = window.matchMedia?.('(max-width: 1100px)');
      let layoutFrame = 0;
      const sizeAssessment = () => {
        layoutFrame = 0;
        if (!compact || compact.matches || !assessment.isConnected) return;
        const viewport = window.visualViewport?.height || window.innerHeight;
        const inset = parseFloat(window.getComputedStyle(assessment).top) || 24;
        const top = Math.max(inset, assessment.getBoundingClientRect().top);
        assessment.style.setProperty('--grade-available-height', `${Math.max(0, viewport - top - inset)}px`);
      };
      const queueAssessmentSize = () => {
        if (!layoutFrame) layoutFrame = window.requestAnimationFrame(sizeAssessment);
      };
      const layoutAssessment = () => {
        if (drawer.open) drawer.close();
        if (compact?.matches) drawer.append(assessment);
        else target.querySelector('.reading-workspace').append(assessment);
        sizeAssessment();
      };
      opener.onclick = () => drawer.showModal();
      assessmentHeader.querySelector('button').onclick = () => { drawer.close(); opener.focus(); };
      drawer.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
      drawer.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault(); event.stopPropagation();
        if (!saving) drawer.close();
      });
      drawer.addEventListener('close', () => { if (compact?.matches && opener.isConnected) opener.focus(); });
      compact?.addEventListener('change', layoutAssessment);
      stopGradingLayout();
      if (compact) {
        window.addEventListener('scroll', queueAssessmentSize, { passive: true, capture: true });
        window.addEventListener('resize', queueAssessmentSize);
        window.visualViewport?.addEventListener('resize', queueAssessmentSize);
      }
      stopGradingLayout = () => {
        compact?.removeEventListener('change', layoutAssessment);
        window.removeEventListener('scroll', queueAssessmentSize, true);
        window.removeEventListener('resize', queueAssessmentSize);
        window.visualViewport?.removeEventListener('resize', queueAssessmentSize);
        if (layoutFrame) window.cancelAnimationFrame(layoutFrame);
        if (drawer.open) drawer.close();
      };
      layoutAssessment();
      refineControls();
      let playingAll = false;
      const playbackErrors = [];
      const stillHere = () => target.isConnected && version === generation;
      const playPage = async index => {
        if (!players[index]) { playingAll = false; return; }
        try { await players[index].play(); }
        catch (error) {
          playingAll = false;
          if (stillHere() && error.name !== 'AbortError') playbackErrors[index]?.('Playback could not start. Retry recording.');
        }
      };
      players.forEach((audio, i) => {
        readingAudioPlayer(audio, i, () => { stopPlayback(); return playPage(i); });
        const footer = document.createElement('div'); footer.className = 'reading-audio-state';
        footer.innerHTML = '<span data-recording-state role="status" aria-live="polite" aria-atomic="true"></span><button type="button" data-recording-retry hidden></button>';
        audio.after(footer);
        const message = footer.querySelector('[data-recording-state]');
        const retry = footer.querySelector('[data-recording-retry]');
        iconControl(retry, 'retry', `Retry recording for page ${i + 1}`);
        const loading = () => {
          footer.hidden = false;
          audio.setAttribute('aria-busy', 'true');
          footer.classList.remove('is-error'); retry.hidden = true;
          message.textContent = 'Loading recording…';
        };
        const ready = () => {
          if (!stillHere()) return;
          audio.removeAttribute('aria-busy'); footer.classList.remove('is-error'); retry.hidden = true;
          message.textContent = ''; footer.hidden = true;
        };
        const failed = (text = 'Recording could not load. Retry to get a fresh playback link.') => {
          if (!stillHere()) return;
          footer.hidden = false;
          playingAll = false; audio.removeAttribute('aria-busy'); footer.classList.add('is-error');
          message.textContent = text; retry.hidden = false;
        };
        playbackErrors[i] = failed;
        audio.addEventListener('loadedmetadata', ready);
        audio.addEventListener('durationchange', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) ready(); });
        audio.addEventListener('error', () => failed());
        retry.onclick = async () => {
          stopPlayback(); retry.disabled = true; loading();
          try {
            const fresh = await request('play', { submissionId: entry.id });
            if (!stillHere()) return;
            const url = fresh.pages?.[i]?.recordingUrl;
            if (!url) throw new Error('This recording is unavailable. Please try again.');
            audio.src = url; audio.load();
          } catch (error) { if (stillHere()) failed(error.message || 'Recording could not load. Please try again.'); }
          finally { if (stillHere()) retry.disabled = false; }
        };
        loading();
        if (audio.readyState >= 1) ready();
        else if (audio.error) failed();
        audio.addEventListener('play', () => players.forEach(other => { if (other !== audio) other.pause(); }));
        audio.addEventListener('pause', () => { if (!audio.ended) playingAll = false; });
        audio.onended = () => { if (playingAll) void playPage(i + 1); };
      });
      function stopPlayback() { playingAll = false; players.forEach(audio => audio.pause()); }
      $('[data-review-play-all]').onclick = () => { stopPlayback(); players.forEach(audio => { audio.currentTime = 0; }); playingAll = true; void playPage(0); };
      const form = $('#reading-grade');
      form.addEventListener('input', () => { dirty = true; }); form.addEventListener('change', () => { dirty = true; });
      form.onsubmit = async event => {
        event.preventDefault(); if (saving) return; saving = true;
        const submit = form.querySelector('[type="submit"]'); submit.disabled = true; iconControl(submit, 'loading', 'Saving grade'); form.setAttribute('aria-busy', 'true');
        const values = Object.fromEntries(new FormData(form));
        const controls = [...form.querySelectorAll('select, textarea, details button')]; controls.forEach(control => { control.disabled = true; });
        $('#reading-review-error').textContent = '';
        try {
          await request('grade', { submissionId: entry.id, grade: Object.fromEntries(criteria.map(([key]) => [key, Number(values[key])])), feedback: result.feedback || '' });
          if (!target.isConnected || version !== generation) return;
          entry.status = 'graded'; dirty = false; saving = false; stopPlayback(); window.location.hash = studentUrl(student.uid);
        } catch (error) {
          if (target.isConnected && version === generation) {
            $('#reading-review-error').textContent = error.message; submit.disabled = false; iconControl(submit, 'save', 'Save grade'); form.removeAttribute('aria-busy');
            controls.forEach(control => { control.disabled = false; });
          }
          saving = false;
        }
      };
    } catch (error) {
      if (!target.isConnected || version !== generation) return;
      target.removeAttribute('aria-busy');
      target.innerHTML = '<div class="reading-empty"><p role="alert"></p><button class="button secondary" type="button">Try again</button></div>';
      refineControls();
      target.querySelector('[role="alert"]').textContent = error.message; target.querySelector('button').onclick = () => grading(student, entry);
    }
  }
  try {
    const [response, classroom] = await Promise.all([request('list'), readingRoster(classId)]);
    if (!target.isConnected) return;
    rows = latestReadingSubmissions(response.submissions); roster = classroom.students; lessonLinks = classroom.lessonLinks || []; className = classroom.className; classSection = classroom.section || '';
    if (studentId) {
      const titles = await readingLessonTitles(rows.filter(row => row.uid === studentId).map(row => row.lessonId));
      if (!target.isConnected) return;
      rows = rows.map(row => typeof titles[row.lessonId] === 'string' ? { ...row, title: titles[row.lessonId] } : row);
    }
    target.removeAttribute('aria-busy');
    for (const row of rows) if (!roster.some(student => student.uid === row.uid)) roster.push({ uid: row.uid, name: row.name || 'Student' });
    const student = studentId ? roster.find(student => student.uid === studentId) : null;
    if (studentId && !student) { header(); target.innerHTML = '<div class="reading-empty"><h2>Student not found</h2><p>Return to the student list to choose a reader.</p></div>'; return; }
    const entry = submissionId ? rows.find(row => row.uid === studentId && row.id === submissionId) : null;
    if (submissionId && !entry) { header(student); target.innerHTML = '<div class="reading-empty"><h2>Submission unavailable</h2><p>Return to this student’s lessons to open the newest submission.</p></div>'; return; }
    if (entry) await grading(student, entry); else directory(student);
  } catch (error) {
    if (!target.isConnected) return;
    target.removeAttribute('aria-busy'); target.innerHTML = '<div class="reading-empty"><p role="alert"></p><button type="button" class="button secondary">Try again</button></div>';
    refineControls();
    target.querySelector('[role="alert"]').textContent = error.message;
    target.querySelector('button').onclick = () => renderFluencyReview(classId, studentId, submissionId);
  }
}
