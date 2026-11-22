// Use the real component classes so placeholders follow the same responsive layout.
const repeat = (count, draw) => Array.from({ length: count }, (_, index) => draw(index)).join('');
const bar = (width = '65%', height = '.75rem', extra = '') => `<span class="page-skeleton__block page-skeleton__line ${extra}" style="width:${width};height:${height}"></span>`;
const mark = (size = '2.5rem', round = false) => `<span class="page-skeleton__block page-skeleton__mark${round ? ' page-skeleton__circle' : ''}" style="width:${size};height:${size}"></span>`;
const text = () => `<span class="page-skeleton__text">${bar()}${bar('43%', '.6rem')}</span>`;
const rowsMarkup = count => repeat(count, () => `<div class="page-skeleton__row">${mark()}${text()}</div>`);
const search = cls => `<div class="${cls} page-skeleton__search">${mark('1rem', true)}${bar('48%')}</div>`;
const tabs = () => `<div class="page-skeleton__tabs">${repeat(3, () => bar('6rem', '2.75rem'))}</div>`;
const overviewStat = () => `<div class="overview-stat"><span class="overview-stat__top">${mark('2.125rem')}${bar('58%', '.75rem')}</span><strong>${bar('3rem', '2.5rem')}</strong><small>${bar('80%', '.7rem')}</small></div>`;
const overviewPanel = (title, body) => `<section class="overview-panel"><div class="overview-panel__head"><div class="overview-panel__title">${mark()}<div><span class="overview-eyebrow">${bar('6rem', '.6rem')}</span><h2>${title}</h2></div></div></div>${body}</section>`;
function overview(kind) {
  const admin = kind === 'admin-overview';
  const cards = `<ul class="overview-classrooms">${repeat(4, i => `<li><div class="overview-classroom overview-classroom--${i}"><span class="overview-classroom__top">${mark('2.125rem')}${bar('45%')}</span><strong>${bar('76%', '1rem')}</strong><small>${bar('90%')}${bar('62%')}</small><span class="overview-classroom__footer">${bar('70%', '.65rem')}</span></div></li>`)}</ul>`;
  return `<div class="overview-stats">${repeat(4, overviewStat)}</div><div class="overview-layout"><div class="overview-main">${overviewPanel('Needs attention', rowsMarkup(2))}${overviewPanel(admin ? 'Newest classrooms' : 'My classrooms', cards)}</div><aside class="overview-aside">${overviewPanel(admin ? 'Quick access' : 'Due this week', rowsMarkup(3))}${overviewPanel(admin ? 'Recently updated lessons' : 'Quick access', rowsMarkup(3))}</aside></div>`;
}
const tableVariants = {
  'admin-teachers': ['teacher-directory', 'teacher-directory', 'Meet your teachers', 'Manage account details and access in one place.', 'teacher-table', ['Teacher', 'Email address', 'Status', '']],
  'admin-students': ['teacher-directory', 'teacher-directory', 'All students', 'Create student accounts with an LRN and username. No student email is required.', 'teacher-table student-table', ['', 'Student', 'LRN', 'Class', 'Status', '']],
  'admin-classes': ['admin-class-directory', 'admin-class-directory', 'Classes across BASAya', 'A clear view of every classroom and the teacher leading it.', 'admin-class-table', ['Class', 'Teacher', 'Created', '']],
  'admin-lessons': ['admin-lesson-directory', 'admin-lesson-directory', 'Lessons, at a glance', 'Browse and organize learning content by level.', 'admin-lesson-table', ['Lesson title', 'Difficulty', '']],
  roster: ['students-workspace', 'student-directory', 'Class roster', 'Every learner, with a clear path to their progress.', 'roster-table', ['Student', 'Membership', 'Actions']],
};
function directory(kind, count) {
  const [cls, prefix, title, description, table, columns] = tableVariants[kind];
  const lessons = kind === 'admin-lessons';
  const tableWrap = table.split(' ')[0] + '-wrap';
  return `<section class="${cls}"><div class="${prefix}__intro page-skeleton__directory-intro"><div><span class="${prefix}__eyebrow">${lessons ? 'Learning library' : kind === 'admin-classes' ? 'Learning spaces' : 'People'}</span><h2>${title}</h2><p>${description}</p></div>${bar('3rem', '2rem')}</div>${kind === 'admin-teachers' || kind === 'admin-students' ? tabs() : ''}${kind === 'admin-students' ? tabs() : ''}${search(lessons ? 'admin-lesson-search' : 'admin-directory-search')}${lessons || kind === 'admin-classes' ? tabs() : ''}<div class="${tableWrap}"><table class="table ${table}"><thead><tr>${columns.map((c, i) => `<th${c === 'Status' ? ' class="teacher-table__status-column"' : ''}>${c || '<span class="sr-only">Actions</span>'}</th>`).join('')}</tr></thead><tbody>${repeat(count, index => `<tr>${columns.map((c, i) => `<td${c === 'Status' ? ' class="teacher-table__status-column"' : ''}>${!c ? mark('1rem') : i === (kind === 'admin-students' ? 1 : 0) ? `<div class="teacher-table__person">${kind === 'admin-students' ? mark('2.5rem', true) : ''}${text()}</div>` : bar(c === 'Status' || c === 'Difficulty' ? '5rem' : index % 2 ? '65%' : '80%', c === 'Status' || c === 'Difficulty' ? '1.5rem' : '.75rem')}</td>`).join('')}</tr>`)}</tbody></table></div><div class="page-skeleton__pagination">${bar('7rem')}${bar('9rem', '2.25rem')}</div></section>`;
}
function classrooms(count) {
  return `<div class="teacher-dashboard"><section class="dash-stats">${repeat(4, () => `<div class="dash-stat">${mark('2.5rem')}<span class="dash-stat__text">${bar('2rem', '1.5rem')}${bar('6rem', '.7rem')}</span></div>`)}</section><div class="dash-columns"><section class="class-directory"><div class="class-directory__toolbar"><div class="class-directory__heading"><span class="class-directory__eyebrow">Your teaching space</span><h2>Classroom directory</h2><p>Open a class to manage its students, lessons, and progress.</p></div>${bar('3rem', '1.5rem')}</div>${search('class-directory__search')}<div class="grid classes-grid">${repeat(count, () => `<article class="card class-card"><div class="class-card__body"><div class="class-card__heading"><h3>${bar('10rem', '1.4rem')}</h3>${mark('1rem')}</div><p>${bar('95%')}${bar('65%')}</p><div class="class-card__meta">${bar('55%', '.65rem')}${bar('42%', '.65rem')}</div></div><div class="class-card__code">${bar('7rem', '1rem')}</div><div class="class-card__open">${bar('8rem', '.75rem')}</div></article>`)}</div></section><section class="dash-due"><div class="dash-due__heading"><span class="class-directory__eyebrow">Looking ahead</span><h2>Due this week</h2><p>Assessment deadlines in the next 7 days.</p></div><div class="dash-due__list">${rowsMarkup(3)}</div></section></div></div>`;
}
function studentLessons(count) {
  return `<ul class="st-lessons">${repeat(count, () => `<li><div class="st-lesson"><span class="st-lesson__top">${bar('4rem', '.7rem')}${bar('6rem', '1.5rem')}</span><strong class="st-lesson__title">${bar('72%', '1.35rem')}</strong><span class="st-lesson__desc">${bar('93%')}${bar('61%')}</span><span class="st-lesson__meta">${bar('5.5rem', '1.4rem')}${bar('5rem', '1.4rem')}</span><span class="st-lesson__progress">${bar('100%', '.65rem')}</span><span class="st-lesson__action">${bar('8rem', '.8rem')}</span></div></li>`)}</ul>`;
}
function studentProgress() {
  return `<div class="st-progress-hero">${mark('7rem', true)}<div class="st-progress-hero__text">${bar('70%', '1.4rem')}${bar('95%')}${bar('64%')}</div>${mark('6rem', true)}</div><div class="st-library-heading st-skills-heading"><h2>Mga kasanayan ko</h2><span>Bawat kasanayan, sariling pag-unlad</span></div><div class="st-skills">${repeat(5, () => `<article class="st-skill"><div class="st-skill__head">${mark('2.75rem')}${text()}${bar('2.5rem', '1.5rem')}</div><div class="st-skill__row">${bar('6rem', '1.5rem')}${bar('5rem', '1rem')}</div>${bar('100%', '.65rem')}<div class="st-skill__foot">${bar('90%')}${bar('65%')}</div></article>`)}</div>`;
}
function lessonContent(kind) {
  return `<div class="page-skeleton__lesson"><div class="page-skeleton__lesson-bar">${mark()}${bar('80%', '.6rem')}</div><div class="page-skeleton__lesson-title">${bar('7rem', '.7rem')}${bar('65%', '1.8rem')}${bar('85%')}</div><div class="page-skeleton__worksheet">${kind === 'reader' ? repeat(6, i => bar(i === 5 ? '58%' : '100%', '1rem')) : kind === 'activity' || kind === 'game' ? `<div class="page-skeleton__tiles">${repeat(9, () => bar('100%', '3.5rem'))}</div>` : kind === 'pronunciation' ? `${bar('55%', '2.5rem')}${bar('35%', '1rem')}${mark('4.5rem', true)}` : repeat(4, () => bar('100%', '3rem'))}</div>${bar('100%', '3.25rem')}</div>`;
}
function classroom(count) {
  return `<div class="teacher-class-page"><section class="class-overview"><div class="class-overview__identity"><span class="eyebrow">Class workspace</span>${bar('10rem', '1.4rem')}${bar('8rem')}</div><div class="class-overview__stats">${repeat(3, () => `<div class="card stat class-overview__stat">${mark('2.5rem')}${bar('2rem', '1.5rem')}${bar('6rem')}</div>`)}</div></section><section class="class-lessons"><div class="class-lessons__toolbar"><div><span class="eyebrow">Learning library</span><h2>Class lessons</h2></div>${bar('8rem', '2.75rem')}</div>${tabs()}<div class="class-lessons__list">${repeat(count, () => `<article class="class-lesson">${mark('3rem')}<div class="class-lesson__content"><h3>${bar('70%', '1.25rem')}</h3><p>${bar('92%')}${bar('68%')}</p>${bar('7rem', '1.5rem')}</div><div class="class-lesson__actions">${mark()}${mark()}</div></article>`)}</div></section></div>`;
}
function inbox(count) {
  return `<div class="teacher-messages"><div class="inbox"><aside class="inbox-list"><div class="inbox-list__head"><div><span class="inbox-eyebrow">Your teaching space</span><h2>Class conversations</h2></div></div><div class="inbox-list__items">${repeat(count, () => `<div class="inbox-class">${mark('2.75rem', true)}<span class="inbox-class__text">${text()}</span></div>`)}</div></aside><section class="chat"><div class="chat-head">${mark('2.75rem', true)}${text()}</div><div class="page-skeleton__messages">${repeat(3, () => `<div class="page-skeleton__message">${mark('2rem', true)}<div>${bar('5rem', '.6rem')}${bar('12rem', '3rem')}</div></div>`)}</div></section></div></div>`;
}
export function skeleton(kind = 'list', { rows, label = 'Preparing page', tag = 'div' } = {}) {
  rows ??= kind.startsWith('admin-') ? 6 : kind === 'student-lessons' ? 3 : 4;
  const safeLabel = label.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let body;
  if (tableVariants[kind]) body = directory(kind, rows);
  else if (kind === 'classroom') body = classroom(rows);
  else if (kind === 'inbox') body = inbox(rows);
  else if (kind === 'teacher-classes') body = classrooms(rows);
  else if (kind.endsWith('overview') || kind === 'overview') body = overview(kind);
  else if (kind === 'student-lessons') body = studentLessons(rows);
  else if (kind === 'student-progress') body = studentProgress();
  else if (kind === 'dictionary') body = `<div class="dict-results-head"><h2 class="dict-heading">All words, A to Z</h2>${bar('4rem')}</div><div class="list">${repeat(rows, () => `<div class="lesson-row dict-row"><div class="dict-row__text"><span class="dict-row__identity">${bar('7rem', '1.1rem')}${bar('5rem', '.65rem')}</span><span class="dict-row__definition">${bar('5rem', '1.25rem')}${bar('85%')}</span><span class="lesson-meta">${bar('6rem', '.6rem')}</span></div>${mark('2.25rem')}</div>`)}</div>`;
  else if (kind === 'student-dictionary') body = `<ul class="st-dict-list">${repeat(rows, () => `<li><div class="st-dict-row"><strong>${bar('7rem', '1rem')}</strong><span>${bar('90%')}</span></div></li>`)}</ul>`;
  else if (kind === 'messages') body = `<div class="page-skeleton__messages">${repeat(rows, i => `<div class="page-skeleton__message${i % 2 ? ' page-skeleton__message--own' : ''}">${mark('2rem', true)}<div>${bar('5rem', '.6rem')}${bar(i % 2 ? '12rem' : '15rem', '3rem')}</div></div>`)}</div>`;
  else if (kind === 'notifications') body = `<ul class="st-notifs__list">${repeat(rows, () => `<li><div class="st-notif">${mark('2.75rem')}<span class="st-notif__text">${text()}</span><span class="st-notif__when">${bar('3rem', '.6rem')}${bar('2rem', '.6rem')}</span></div></li>`)}</ul>`;
  else if (['reader', 'activity', 'quiz', 'game', 'pronunciation'].includes(kind)) body = lessonContent(kind);
  else if (kind === 'lesson-steps') body = repeat(5, () => `<div class="page-skeleton__step">${mark('3.5rem', true)}${text()}${mark('2rem', true)}</div>`);
  else if (kind === 'account-class') body = `<div class="page-skeleton__row">${mark('3rem')}${text()}</div>`;
  else body = rowsMarkup(rows);
  return `<${tag} class="page-skeleton page-skeleton--${kind}" role="status" aria-label="${safeLabel}"><div class="page-skeleton__shapes" aria-hidden="true">${body}</div></${tag}>`;
}

const previews = new Map();
const cacheable = /^\/(dashboard|classes|teachers|students|lessons|dictionary)$/;
let session = '';
let active;

function snapshot(content) {
  const copy = content.cloneNode(true);
  copy.querySelectorAll('dialog, [role="dialog"], script, .modal-backdrop, .notice-stack').forEach(el => el.remove());
  copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  copy.removeAttribute('id');
  copy.removeAttribute('aria-busy');
  copy.querySelectorAll('details').forEach(el => { el.open = false; });
  copy.querySelectorAll('[aria-expanded]').forEach(el => el.setAttribute('aria-expanded', 'false'));
  copy.querySelectorAll('[role="menu"], [class*="menu-popup"]').forEach(el => { el.hidden = true; });
  // Keep control geometry intact. The entire copy is inert, including fields.
  return copy;
}

// Previews are scoped to this signed-in session, bounded, and never interactive.
export function beginPageLoading(route, scope, kind = 'list') {
  const content = document.querySelector('#page-content');
  if (scope !== session) { previews.clear(); session = scope; }
  if (active?.ready && active.scope === scope && cacheable.test(active.route) && content.childElementCount) {
    previews.delete(active.route);
    previews.set(active.route, { node: snapshot(content), at: Date.now() });
    if (previews.size > 6) previews.delete(previews.keys().next().value);
  }
  active?.preview?.remove();
  content.hidden = false;
  const flight = { route, scope, ready: false, preview: null };
  active = flight;
  content.setAttribute('aria-busy', 'true');
  content.innerHTML = skeleton(kind);
  const cached = previews.get(route);
  if (cached && Date.now() - cached.at < 60000) {
    const preview = document.createElement('div');
    preview.className = 'page-refresh-preview';
    const status = document.createElement('div');
    status.className = 'page-refresh-preview__rail';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-label', 'Refreshing page');
    const copy = cached.node.cloneNode(true);
    copy.hidden = false;
    copy.inert = true;
    copy.setAttribute('aria-hidden', 'true');
    preview.append(status, copy);
    content.before(preview);
    content.hidden = true;
    flight.preview = preview;
  }
  return (success = true) => {
    if (active !== flight) return;
    flight.preview?.remove();
    content.hidden = false;
    content.removeAttribute('aria-busy');
    flight.ready = success;
    if (!success) previews.delete(route);
  };
}

export function routeLoadingInfo(route, portal = 'teacher') {
  if (route.includes('/readings')) return ['Reading reviews', 'list'];
  if (/\/students\/[^/]+$/.test(route)) return ['Student progress', 'grid'];
  if (route.endsWith('/students') && route !== '/students') return ['Students', 'roster'];
  if (route.endsWith('/report')) return ['Class report', 'list'];
  if (route.endsWith('/add-lesson')) return ['Add lesson', 'grid'];
  if (route.startsWith('/classes/')) return ['Classroom', 'classroom'];
  return ({
    '/dashboard': ['Dashboard', `${portal}-overview`], '/classes': [portal === 'teacher' ? 'Your classrooms' : 'All classes', portal === 'teacher' ? 'teacher-classes' : 'admin-classes'],
    '/teachers': ['Teacher accounts', 'admin-teachers'], '/students': ['Student accounts', 'admin-students'],
    '/lessons': ['Lessons', 'admin-lessons'], '/dictionary': ['Dictionary', 'dictionary'],
    '/settings': ['Account settings', 'list'], '/handbook': ['Handbook', 'list'],
  })[route] || [route.startsWith('/messages') ? 'Messages' : 'BaSaya', route.startsWith('/messages') ? 'inbox' : 'list'];
}

// Reserve the same header rows and action footprint before network data arrives.
export function prepareLoadingHeader(kind) {
  const header = document.querySelector('#page-header');
  const copy = header?.querySelector('.page-header__text');
  if (!copy) return;
  if (kind === 'teacher-classes') {
    header.classList.add('teacher-dashboard-header');
    copy.insertAdjacentHTML('afterbegin', `<span class="teacher-dashboard-header__eyebrow page-skeleton" aria-hidden="true">${bar('10rem', '.8rem')}</span>`);
    copy.insertAdjacentHTML('beforeend', '<p>Open a class to see its lessons and progress.</p>');
  } else if (kind.startsWith('admin-')) {
    copy.insertAdjacentHTML('beforeend', `<ul class="page-header__meta page-skeleton" aria-hidden="true"><li>${bar('7rem', '.75rem')}</li></ul>`);
  }
  const actions = header.querySelector('.header-actions');
  if (actions && ['teacher-classes', 'admin-teachers', 'admin-students', 'admin-lessons'].includes(kind)) {
    actions.innerHTML = `<div class="page-skeleton" aria-hidden="true">${mark('3rem')}</div>`;
  }
}
