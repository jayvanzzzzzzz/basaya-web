// Use the real component classes so placeholders follow the same responsive layout.
const repeat = (count, draw) => Array.from({ length: count }, (_, index) => draw(index)).join('');
const bar = (width = '65%', height = '.75rem', extra = '') => `<span class="page-skeleton__block page-skeleton__line ${extra}" style="width:${width};height:${height}"></span>`;
const mark = (size = '2.5rem', round = false) => `<span class="page-skeleton__block page-skeleton__mark${round ? ' page-skeleton__circle' : ''}" style="width:${size};height:${size}"></span>`;
// Text placeholders inherit the live element's font and line box, including wrapping.
const copy = value => `<span class="page-skeleton__block page-skeleton__copy">${value}</span>`;
const classAction = () => '<span class="page-skeleton__block class-icon-control"></span>';
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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
function classroom(count, savedClass) {
  const details = savedClass ? [savedClass.gradeLevel ? `Grade ${savedClass.gradeLevel}` : '', savedClass.section ? `Section ${savedClass.section}` : ''].filter(Boolean).join(' · ') || 'A shared space for learning' : 'Grade · Section';
  return `<div class="teacher-class-page"><section class="class-overview"><div class="class-overview__identity"><div><span class="class-overview__eyebrow">Your classroom</span><p class="class-overview__details">${copy(escapeText(details))}</p></div><div class="class-overview__code code-stub code-stub--on-canvas"><span class="code-stub__label">Class code</span><code>${copy(escapeText(savedClass?.classCode || 'ABC123'))}</code>${mark('18px')}</div></div><div class="grid stats class-overview__stats">${['Students enrolled', 'Lesson paths assigned', 'Active student progress'].map((label, index) => `<div class="card stat class-overview__stat${index === 2 ? ' class-overview__stat--progress' : ''}"><span class="class-overview__stat-icon">${mark('1.4rem')}</span><b>${copy(index === 2 ? '00%' : '00')}</b><span>${label}</span>${index === 2 ? '<span class="class-overview__progress-track"></span>' : ''}</div>`).join('')}</div></section><section class="class-lessons"><div class="class-lessons__header"><div><span class="class-lessons__eyebrow">Learning plan</span><h2>Assigned lesson paths</h2><p>Keep the class moving through each lesson path.</p></div><div class="teacher-class-actions">${classAction()}${classAction()}</div></div><div class="class-path-list">${repeat(count, () => `<article class="class-lesson"><span class="class-lesson__art">${mark('1.6rem')}</span><div class="class-lesson__content"><h3>${copy('Lesson title')}</h3><p>${copy('A description of the lesson for this class.')}</p><div class="class-lesson__schedule"><span class="mode-chip">${copy('Assessment')}</span><span class="schedule-chip">${copy('Open')}</span><span>${copy('No schedule')}</span></div></div><div class="class-lesson__actions"><span class="class-lesson__action">${mark('1.1rem')}</span><span class="class-lesson__remove">${mark('1.1rem')}</span></div></article>`)}</div></section></div>`;
}
function lessonPicker(savedClass) {
  return `<div class="teacher-add-lesson-page"><div class="lesson-workspace">
    <section class="lesson-picker">
      <div class="lesson-picker__toolbar">
        <div><span class="lesson-picker__eyebrow">01 / Lesson path collection</span><h2>Choose what to teach</h2><p>Select lesson paths, then set their deadlines together.</p></div>
        <span class="lesson-picker__count"><strong>${copy('0')}</strong> in collection</span>
      </div>
      <section class="module-panel module-class-sequence">
        <h3>Lesson paths</h3><p>Choose paths below, then arrange the teaching sequence.</p>
        <div class="class-path-choices">${repeat(3, () => `<div class="class-path-choice">${mark('1.2rem')}<span>${bar('9rem')}${bar('4rem', '.65rem')}</span></div>`)}</div>
        <p>Select lesson paths above to review their modules and lessons.</p>
        <h3>Lesson path sequence</h3><p>Students finish each assessment path before the next path unlocks.</p>
        <h3>Module order</h3>
        <ol class="module-batch-list"></ol>
        <button class="button primary" type="button" disabled>Set dates and assign paths</button>
      </section>
    </section>
    <aside class="lesson-guide">
      <span class="lesson-picker__eyebrow">For your classroom</span><h2>${savedClass ? escapeText(savedClass.className) : copy('Class name')}</h2><p>Add multiple lesson paths with a separate schedule and deadline for each.</p>
      <ol class="lesson-guide__steps">
        <li><span>01</span><div><strong>Choose your lesson paths</strong><p>Select saved paths and arrange the teaching sequence.</p></div></li>
        <li><span>02</span><div><strong>Decide how students learn</strong><p>Add as an assessment for recorded scores, or practice for unlimited retries.</p></div></li>
        <li><span>03</span><div><strong>Set dates together</strong><p>Choose a schedule for each path in one form and review before assigning.</p></div></li>
      </ol>
      <div class="lesson-guide__note"><p>Each lesson must appear only once across the selected paths and be available as the selected type.</p></div>
    </aside>
  </div></div>`;
}

function inbox(count) {
  return `<div class="teacher-messages"><div class="inbox"><aside class="inbox-list"><div class="inbox-list__head"><div><span class="inbox-eyebrow">Your teaching space</span><h2>Class conversations</h2></div></div><div class="inbox-list__items">${repeat(count, () => `<div class="inbox-class">${mark('2.75rem', true)}<span class="inbox-class__text">${text()}</span></div>`)}</div></aside><section class="chat"><div class="chat-head">${mark('2.75rem', true)}${text()}</div><div class="page-skeleton__messages">${repeat(3, () => `<div class="page-skeleton__message">${mark('2rem', true)}<div>${bar('5rem', '.6rem')}${bar('12rem', '3rem')}</div></div>`)}</div></section></div></div>`;
}
export function skeleton(kind = 'list', { rows, label = 'Preparing page', tag = 'div', classroom: savedClass } = {}) {
  rows ??= kind.startsWith('admin-') ? 6 : kind === 'student-lessons' ? 3 : 4;
  const safeLabel = label.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let body;
  if (tableVariants[kind]) body = directory(kind, rows);
  else if (kind === 'classroom') body = classroom(rows, savedClass);
  else if (kind === 'add-lesson') body = lessonPicker(savedClass);
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
export function beginPageLoading(route, scope, kind = 'list', options = {}) {
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
  content.innerHTML = skeleton(kind, options);
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
  if (route.endsWith('/add-lesson')) return ['Add modules', 'add-lesson'];
  if (route.startsWith('/classes/')) return ['Classroom', 'classroom'];
  return ({
    '/dashboard': ['Dashboard', `${portal}-overview`], '/classes': [portal === 'teacher' ? 'Your classrooms' : 'All classes', portal === 'teacher' ? 'teacher-classes' : 'admin-classes'],
    '/teachers': ['Teacher accounts', 'admin-teachers'], '/students': ['Student accounts', 'admin-students'],
    '/lessons': ['Lessons', 'admin-lessons'], '/dictionary': ['Dictionary', 'dictionary'],
    '/settings': ['Account settings', 'list'], '/handbook': ['Handbook', 'list'],
  })[route] || [route.startsWith('/messages') ? 'Messages' : 'BaSaya', route.startsWith('/messages') ? 'inbox' : 'list'];
}

// Reserve the same header rows and action footprint before network data arrives.
export function prepareLoadingHeader(kind, { classroom } = {}) {
  const header = document.querySelector('#page-header');
  const copy = header?.querySelector('.page-header__text');
  if (!copy) return;
  if (kind === 'classroom' || kind === 'add-lesson') {
    const classPage = kind === 'classroom';
    header.classList.add(classPage ? 'teacher-class-header' : 'teacher-add-lesson-header');
    document.querySelector('#page-content')?.classList.add(classPage ? 'teacher-class-page' : 'teacher-add-lesson-page');
    const trail = document.createElement('div');
    trail.className = 'page-header__top';
    trail.innerHTML = '<nav class="page-header__crumbs" aria-label="Breadcrumb"><ol><li><a href="#/classes">Classrooms</a></li></ol></nav>' + (classPage ? '<span class="class-workspace-label">Class workspace</span>' : '');
    copy.prepend(trail);
    const heading = copy.querySelector('h1');
    if (classPage) {
      if (classroom?.className) heading.textContent = classroom.className;
      else heading.innerHTML = '<span class="page-skeleton" aria-hidden="true">'+bar('14rem', '1lh')+'</span>';
    } else {
      const crumb = document.createElement('li');
      crumb.textContent = classroom?.className || 'Classroom';
      trail.querySelector('ol').append(crumb);
    }
    const subtitle = document.createElement('p');
    if (classPage && classroom) subtitle.textContent = classroom.description || '';
    else subtitle.innerHTML = classPage ? '<span class="page-skeleton" aria-hidden="true">'+bar('24rem', '1lh')+'</span>' : 'Choose modules for ';
    if (!classPage) {
      const name = document.createElement('span');
      name.textContent = classroom?.className || 'your classroom';
      subtitle.append(name);
    }
    if (subtitle.textContent || !classroom) copy.append(subtitle);
    if (classPage) {
      header.querySelector('.header-actions').innerHTML = '<div class="page-skeleton page-skeleton__class-actions" aria-hidden="true">'+repeat(5, classAction)+'</div>';
    }
    return;
  }
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
