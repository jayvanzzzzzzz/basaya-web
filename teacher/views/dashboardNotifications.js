import { collection, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { state } from '../../js/state.js';
import { postToApi } from '../../js/api.js';
import { escapeHtml } from '../../js/helpers.js';
import { readingGradingSummary } from './studentNotifications.js';

let cleanup;
export function leaveDashboardNotifications() { cleanup?.(); cleanup = null; }

export function attentionMarkup(classId, notice = {}, unread = false, open = false) {
  const base = `#/classes/${encodeURIComponent(classId)}`;
  const rows = [];
  const row = (href, text, extra = '') => rows.push(`<li><a href="${href}" ${extra}>${text}<span aria-hidden="true">&#8594;</span></a></li>`);
  if (unread) row(`#/messages/${encodeURIComponent(classId)}`, 'Unread messages');
  const { total = 0, dueSoon = 0 } = notice.grading || {};
  if (total) row(`${base}/readings`, `${total} reading${total === 1 ? ' needs' : 's need'} grading`);
  if (dueSoon) row(`${base}/readings`, `${dueSoon} ungraded reading${dueSoon === 1 ? '' : 's'} due within 24 hours`, 'class="class-attention__urgent"');
  if (notice.joins) row(`${base}/students`, `${notice.joins} pending join request${notice.joins === 1 ? '' : 's'}`, 'data-request-kind="join"');
  if (notice.leaves) row(`${base}/students`, `${notice.leaves} pending leave request${notice.leaves === 1 ? '' : 's'}`, 'data-request-kind="leave"');
  if (notice.error) rows.push('<li class="class-attention__error">Some updates are unavailable. Open the class to check.</li>');
  if (!rows.length) return '';
  return `<details class="class-attention" ${open ? 'open' : ''}><summary aria-label="Class updates for ${escapeHtml(notice.className || 'this class')}" data-floating-tooltip="Class updates" data-teacher-tooltip><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1.5"/><path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 12h8m-8 5h5"/></svg><span class="class-attention__dot" aria-hidden="true"></span></summary><ul aria-label="Class updates">${rows.join('')}</ul></details>`;
}

// Separate subscriptions per class; the single-class watcher intentionally owns
// only one screen. Reading queues refresh while the dashboard is visible.
export function watchDashboardNotifications(classes, onChange) {
  leaveDashboardNotifications();
  const uid = state.user.uid;
  let active = true;
  const stops = [], entries = new Map();
  const owns = () => active && state.user?.uid === uid;
  const emit = entry => {
    if (owns()) onChange(entry.id, {
      className: entry.className, joins: entry.joins, leaves: entry.leaves,
      grading: readingGradingSummary(entry.readings, entry.links),
      error: Object.values(entry.errors).some(Boolean),
    });
  };
  for (const classroom of classes) {
    const entry = { id: classroom.id, className: classroom.className, joins: 0, leaves: 0, readings: [], links: [], errors: {}, inFlight: false };
    entries.set(entry.id, entry);
    const watch = (name, ref, apply) => stops.push(onSnapshot(ref, snapshot => {
      if (!owns()) return;
      apply(snapshot); entry.errors[name] = false; emit(entry);
    }, () => { entry.errors[name] = true; emit(entry); }));
    watch('joins', query(collection(db, 'classes', entry.id, 'joinRequests'), where('status', '==', 'pending')), snap => { entry.joins = snap.docs.length; });
    watch('leaves', collection(db, 'classes', entry.id, 'students'), snap => { entry.leaves = snap.docs.filter(doc => doc.data().leaveRequest).length; });
    watch('links', collection(db, 'classes', entry.id, 'classLessons'), snap => { entry.links = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); });
  }
  async function refresh() {
    if (!owns() || document.visibilityState === 'hidden') return;
    await Promise.all([...entries.values()].map(async entry => {
      if (entry.inFlight) return;
      entry.inFlight = true;
      try {
        const result = await postToApi('assessment', { operation: 'fluency-list', classId: entry.id }, { signal: AbortSignal.timeout(20000) });
        if (owns()) { entry.readings = result.submissions || []; entry.errors.readings = false; emit(entry); }
      } catch { if (owns()) { entry.errors.readings = true; emit(entry); } }
      finally { entry.inFlight = false; }
    }));
  }
  void refresh();
  const timer = setInterval(refresh, 60000);
  const resume = () => { void refresh(); };
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  const stop = () => {
    active = false; stops.forEach(stop => stop()); clearInterval(timer);
    window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume);
  };
  cleanup = stop;
  return () => { stop(); if (cleanup === stop) cleanup = null; };
}
