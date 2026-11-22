import { captureRoute } from "../../js/route-lifecycle.js";
import { collection, getCountFromServer, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from '../../js/firebase.js';
import { state, getAllTeachers, getAllClasses, getAllLessons } from '../../js/state.js';
import { $, page } from '../../js/helpers.js';
import { greeting } from '../../js/teacherTitle.js';
import { stat, row, panel, empty, welcome, icon, classroomCard } from '../../js/workspace-dashboard.js';

export async function renderAdminDashboard() {
  const isCurrent = captureRoute("/dashboard");
  if (!isCurrent()) return;
  page('Dashboard', 'A clear view of your school, with the next steps that matter.');
  const root = document.createElement('div');
  root.className = 'workspace-overview';
  $('#page-content').replaceChildren(root);
  welcome(root, greeting(state.profile || {}), 'Administration');
  const content = document.createElement('div');
  root.append(content);
  content.innerHTML = '<p class="overview-loading" role="status">Loading your school overview…</p>';
  const results = await Promise.allSettled([
    getAllTeachers(), getAllClasses(), getAllLessons(),
    getCountFromServer(query(collection(db, 'users'), where('role', '==', 'student'))),
  ]);
  if (!isCurrent() || !root.isConnected) return;
  const ok = i => results[i].status === 'fulfilled';
  const teachers = ok(0) ? state.teachers : [];
  const classes = ok(1) ? state.allClasses : [];
  const lessons = ok(2) ? state.allLessons : [];
  const names = new Map(teachers.map(t => [t.id, t.displayName || t.email || 'Unnamed teacher']));
  const requests = classes.filter(c => c.deletionRequest);
  const unassigned = ok(0) ? classes.filter(c => !names.has(c.teacherId)) : [];
  const attention = [
    ...requests.map(c => row(c.className || 'Untitled class', 'Deletion requested · Review the request before deciding.', '#/classes', { badge: 'Review', tone: 'warning' })),
    ...unassigned.map(c => row(c.className || 'Untitled class', 'No assigned teacher · Choose who will lead this class.', '#/classes', { badge: 'Assign', tone: 'warning' })),
  ];
  const recentClasses = classes.slice(0, 4).map((c, index) => classroomCard(c, '#/classes', names.get(c.teacherId) || (ok(0) ? 'Teacher needed' : 'Teacher details unavailable'), index));
  const recentLessons = lessons.slice(0, 4).map((l, index) => row(l.title || 'Untitled lesson', 'View in your lesson library', '#/lessons', { mark: String(index + 1).padStart(2, '0') }));
  content.innerHTML = `
    ${results.some(r => r.status === 'rejected') ? '<div class="overview-error" role="status">Some information could not be loaded. <button type="button" data-overview-retry>Try again</button></div>' : ''}
    <section class="overview-stats" aria-label="School at a glance">
      ${stat('teachers', 'Teachers', ok(0) ? teachers.length : '—', 'Teacher accounts', '#/teachers', 'people')}
      ${stat('students', 'Students', ok(3) ? results[3].value.data().count : '—', 'Unique student accounts', '#/students', 'people')}
      ${stat('classes', 'Classes', ok(1) ? classes.length : '—', 'Across your school', '#/classes')}
      ${stat('lessons', 'Lessons', ok(2) ? lessons.length : '—', 'In the lesson library', '#/lessons', 'book')}
    </section>
    <div class="overview-layout"><div class="overview-main">
      ${panel('admin-attention', 'Your priorities', 'Needs attention', !ok(0) || !ok(1) ? '<p class="overview-note">Some class or teacher details are unavailable. Open All classes to check pending work.</p>' + (attention.length ? `<ul class="overview-list">${attention.join('')}</ul>` : '') : attention.length ? `<ul class="overview-list">${attention.join('')}</ul>` : empty('You’re all caught up', 'No class deletion requests or classes awaiting a teacher.'), '<a class="overview-text-link" href="#/classes">All classes '+icon('arrow')+'</a>')}
      ${panel('admin-classes', 'Learning spaces', 'Newest classrooms', ok(1) ? recentClasses.length ? `<ul class="overview-classrooms">${recentClasses.join('')}</ul>` : empty('Your classrooms will appear here', 'Manage teachers and classes to get your school started.', 'grid') : '<p class="overview-note">Classroom information is unavailable.</p>', '<a class="overview-text-link" href="#/classes">View all '+icon('arrow')+'</a>')}
    </div><aside class="overview-aside" aria-label="School resources">
      ${panel('admin-shortcuts', 'Keep things moving', 'Quick access', `<ul class="overview-list">${row('Teacher accounts', 'Manage staff and account access', '#/teachers')}${row('Lesson library', 'Create and organise learning content', '#/lessons')}${row('Student accounts', 'Find students and manage accounts', '#/students')}${row('Dictionary', 'Manage Filipino words and definitions', '#/dictionary')}</ul>`)}
      ${panel('admin-lessons', 'Learning content', 'Recently updated lessons', ok(2) ? recentLessons.length ? `<ul class="overview-list">${recentLessons.join('')}</ul>` : empty('A place for your lessons', 'Create your first lesson in the lesson library.', 'book') : '<p class="overview-note">Lesson information is unavailable.</p>')}
    </aside></div>`;
  content.querySelector('[data-overview-retry]')?.addEventListener('click', renderAdminDashboard);
}
