import { skeleton } from '../../js/page-loading.js';
import { captureRoute } from "../../js/route-lifecycle.js";
import { collection, getCountFromServer, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { state, getTeacherClasses, getAllLessons } from '../../js/state.js';
import { $, page } from '../../js/helpers.js';
import { greeting } from '../../js/teacherTitle.js';
import { linkMode, linkLessonId } from '../../js/schedule.js';
import { stat, row, panel, empty, welcome, icon, classroomCard } from '../../js/workspace-dashboard.js';
import { openClassModal } from './dashboard.js';
import { hasUnreadChat, onChatSummaries } from './messages.js';
import { watchDashboardNotifications } from './dashboardNotifications.js';
import { setRequestTab } from './requestRibbons.js';
import { renderRoute } from '../router.js';

export async function renderTeacherLanding() {
  const isCurrent = captureRoute("/dashboard");
  if (!isCurrent()) return;
  page('Dashboard', 'Your teaching day starts here.', `<button class="button primary" type="button" id="overview-create-class">${icon('plus')} Create class</button>`);
  const root = document.createElement('div');
  root.className = 'workspace-overview';
  $('#page-content').replaceChildren(root);
  welcome(root, greeting(state.profile || {}), 'Your teaching day');
  const content = document.createElement('div');
  root.append(content);
  $('#overview-create-class').addEventListener('click', () => openClassModal());
  content.innerHTML = skeleton('teacher-overview', { label: 'Preparing teaching overview' });
  try { await getTeacherClasses(); }
  catch {
    if (root.isConnected) {
      content.innerHTML = '<div class="overview-error" role="status">Your classrooms could not be loaded. <button type="button" data-overview-retry>Try again</button></div>';
      content.querySelector('button').onclick = renderRoute;
    }
    return;
  }
  if (!isCurrent() || !root.isConnected) return;
  const classes = [...state.classes];
  const notices = new Map();
  content.innerHTML = `<section class="overview-stats" aria-label="Teaching at a glance">
    ${stat('classes', 'My classes', classes.length, 'Your teaching spaces', '#/classes')}
    ${stat('students', 'Class enrolments', classes.length ? '—' : 0, 'Students counted in each class', '#/classes', 'people')}
    ${stat('due', 'Due this week', classes.length ? '—' : 0, 'Assessments · Next 7 days', null, 'clock')}
    ${stat('reviews', 'Reading reviews', classes.length ? '—' : 0, 'Submissions awaiting grading', null, 'book')}
    </section><div class="overview-layout"><div class="overview-main">
      ${panel('teacher-attention', 'Your priorities', 'Needs attention', '<div data-overview-attention role="status">'+(classes.length ? skeleton('list', { rows: 2, label: 'Checking class updates' }) : empty('A fresh start', 'Create your first classroom to begin teaching.', 'grid'))+'</div>')}
      ${panel('teacher-classes', 'Your teaching spaces', 'My classrooms', classes.length ? `<ul class="overview-classrooms">${classes.slice(0, 4).map((c, index) => classroomCard(c, `#/classes/${encodeURIComponent(c.id)}`, c.description || 'Lessons, students, and class progress', index)).join('')}</ul>` : empty('Your first classroom is waiting', 'Use Create class to get a class code and invite your students.', 'grid'), '<a class="overview-text-link" href="#/classes">View all '+icon('arrow')+'</a>')}
    </div><aside class="overview-aside" aria-label="Deadlines and teaching tools">
      ${panel('teacher-deadlines', 'Looking ahead', 'Due this week', '<div data-overview-deadlines>'+(classes.length ? skeleton('list', { rows: 2, label: 'Preparing deadlines' }) : empty('No upcoming deadlines', 'Assigned assessments with deadlines will appear here.', 'clock'))+'</div>')}
      ${panel('teacher-shortcuts', 'Stay connected', 'Quick access', `<ul class="overview-list">${row('My classes', 'Assign lessons and view class reports', '#/classes')}${row('Messages', 'Open your class conversations', '#/messages')}${row('Dictionary', 'Explore Filipino words and meanings', '#/dictionary')}</ul>`)}
    </aside></div>`;
  const paintAttention = () => {
    if (!root.isConnected) return;
    const rows = [];
    let reviews = 0;
    let complete = true;
    for (const c of classes) {
      const base = `#/classes/${encodeURIComponent(c.id)}`;
      const notice = notices.get(c.id);
      if (!notice || notice.loading || notice.error) complete = false;
      if (notice?.grading?.total) {
        reviews += notice.grading.total;
        rows.push(row(`${notice.grading.total} reading${notice.grading.total === 1 ? '' : 's'} awaiting review`, c.className || 'Untitled class', `${base}/readings`, { badge: notice.grading.dueSoon ? `${notice.grading.dueSoon} due soon` : 'Review', tone: notice.grading.dueSoon ? 'warning' : '' }));
      }
      for (const [key, label, kind] of [['joins', 'join', 'join'], ['leaves', 'leave', 'leave']]) {
        if (notice?.[key]) rows.push(row(`${notice[key]} ${label} request${notice[key] === 1 ? '' : 's'}`, c.className || 'Untitled class', `${base}/students`, { badge: 'Review', attrs: `data-overview-class="${encodeURIComponent(c.id)}" data-request-kind="${kind}"` }));
      }
      if (hasUnreadChat(c.id)) rows.push(row('Unread messages', c.className || 'Untitled class', `#/messages/${encodeURIComponent(c.id)}`, { badge: 'Open' }));
    }
    const failed = [...notices.values()].some(n => n.error);
    root.querySelector('[data-overview-stat="reviews"]').textContent = complete ? reviews : '—';
    root.querySelector('[data-overview-attention]').innerHTML = (rows.length ? `<ul class="overview-list">${rows.join('')}</ul>` : complete ? empty('You’re all caught up', 'No pending requests, reading reviews, or unread class messages.') : '') + (!complete ? `<p class="overview-note">${failed ? 'Some updates are unavailable. Open your classes to check pending work.' : 'Checking remaining class updates…'}</p>` : '');
  };
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-overview-class]');
    if (target) setRequestTab(decodeURIComponent(target.dataset.overviewClass), target.dataset.requestKind);
  });
  if (classes.length) watchDashboardNotifications(classes, (id, notice) => { notices.set(id, notice); paintAttention(); });
  onChatSummaries(paintAttention);
  if (!classes.length) return;
  // Load counts and deadlines independently: an unavailable roster must not hide deadlines.
  const [lessonResult, ...overview] = await Promise.all([
    getAllLessons().then(() => true).catch(() => false),
    ...classes.map(async classroom => {
      const [students, links] = await Promise.allSettled([
        getCountFromServer(collection(db, 'classes', classroom.id, 'students')),
        getDocs(collection(db, 'classes', classroom.id, 'classLessons')),
      ]);
      return { classroom, students, links };
    }),
  ]);
  if (!root.isConnected) return;
  const allCounts = overview.every(o => o.students.status === 'fulfilled');
  root.querySelector('[data-overview-stat="students"]').textContent = allCounts ? overview.reduce((sum, o) => sum + o.students.value.data().count, 0) : '—';
  const allLinks = overview.every(o => o.links.status === 'fulfilled');
  const now = Date.now();
  const due = overview.flatMap(o => o.links.status === 'fulfilled' ? o.links.value.docs.map(d => ({ ...d.data(), id: d.id, classroom: o.classroom })) : [])
    .filter(l => linkMode(l) === 'assessment' && l.dueAt?.toMillis && l.dueAt.toMillis() > now && l.dueAt.toMillis() <= now + 7 * 86400000)
    .sort((a, b) => a.dueAt.toMillis() - b.dueAt.toMillis());
  root.querySelector('[data-overview-stat="due"]').textContent = allLinks ? due.length : '—';
  root.querySelector('[data-overview-deadlines]').innerHTML = (due.length ? `<ul class="overview-list">${due.map(l => row(lessonResult ? state.allLessons.find(s => s.id === linkLessonId(l))?.title || 'Untitled lesson' : 'Assigned assessment', `${l.classroom.className || 'Untitled class'} · ${new Date(l.dueAt.toMillis()).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`, `#/classes/${encodeURIComponent(l.classroom.id)}`, { when: l.dueAt.toMillis() })).join('')}</ul>` : allLinks ? empty('A little breathing room', 'No assessments due in the next seven days.', 'clock') : '') + (!allLinks ? '<p class="overview-note">Some deadlines could not be loaded. Check your classes for the full schedule.</p>' : '');
  if (!allCounts) root.querySelector('[data-overview-stat="students"]').closest('.overview-stat').querySelector('small').textContent = 'Some enrolment counts unavailable';
}
