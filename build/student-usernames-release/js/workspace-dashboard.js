import { escapeHtml } from './helpers.js';

const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m3 10v-2a6 6 0 0 0-3-5"/>',
  book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.5-4A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 10h8m-8 4h5"/>',
  alert: '<path d="m10.3 4.2-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  clipboard: '<rect x="8" y="3" width="8" height="4" rx="1.5"/><path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 12h8m-8 5h5"/>',
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
export const stat = (key, label, value, note, href, glyph = 'grid') => `<${href ? `a href="${href}"` : 'div'} class="overview-stat overview-stat--${key}">
  <span class="overview-stat__top"><span class="overview-stat__icon">${icon(glyph)}</span><span>${escapeHtml(label)}</span>${href ? icon('arrow') : ''}</span>
  <strong data-overview-stat="${key}">${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small>
</${href ? 'a' : 'div'}>`;
export function row(title, detail, href, { badge = '', tone = '', attrs = '', mark = '', when = null, glyph = '' } = {}) {
  const symbol = glyph || (tone === 'warning' ? 'alert' : href.includes('/messages') ? 'chat' : /\/(lessons|readings|dictionary)/.test(href) ? 'book' : /\/(students|teachers)/.test(href) ? 'people' : 'grid');
  const date = when ? new Date(when) : null;
  const marker = date ? `<time class="overview-row__date" datetime="${date.toISOString()}"><span>${escapeHtml(date.toLocaleDateString(undefined, { month: 'short' }))}</span><b>${date.getDate()}</b></time>` : `<span class="overview-row__icon" aria-hidden="true">${mark ? escapeHtml(mark) : icon(symbol)}</span>`;
  return `<li><a class="overview-row ${tone ? `overview-row--${tone}` : ''}" href="${href}" ${attrs}>${marker}
    <span class="overview-row__body"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span>
    ${badge !== '' ? `<span class="overview-badge">${escapeHtml(badge)}</span>` : ''}${icon('arrow')}</a></li>`;
}
export function classroomCard(classroom, href, detail, index = 0) {
  const grade = classroom.gradeLevel || classroom.className?.match(/(?:Grade|Baitang)\s*(\d+)/i)?.[1];
  return `<li><a class="overview-classroom overview-classroom--${index % 4}" href="${href}">
    <span class="overview-classroom__top"><span class="overview-classroom__mark">${icon('book')}</span><span class="overview-classroom__level">${grade ? `Grade ${escapeHtml(grade)}` : 'Classroom'}</span>${icon('arrow')}</span>
    <strong>${escapeHtml(classroom.className || 'Untitled class')}</strong>
    <small>${escapeHtml(detail)}</small>
    <span class="overview-classroom__footer">${icon('people')}<span>${escapeHtml(classroom.section || (grade ? 'Filipino learning space' : 'Your learning community'))}</span></span>
  </a></li>`;
}
export const empty = (title, detail, glyph = 'check') => `<div class="overview-empty">${icon(glyph)}<strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
export const panel = (id, eyebrow, title, content, action = '') => `<section class="overview-panel overview-panel--${id}" aria-labelledby="${id}"><div class="overview-panel__head"><div class="overview-panel__title"><span class="overview-panel__symbol" aria-hidden="true">${icon(id.includes('attention') ? 'clipboard' : id.includes('shortcuts') ? 'compass' : id.includes('deadlines') ? 'clock' : id.includes('lessons') ? 'book' : 'grid')}</span><div><span class="overview-eyebrow">${escapeHtml(eyebrow)}</span><h2 id="${id}">${escapeHtml(title)}</h2></div></div>${action}</div>${content}</section>`;
export function welcome(root, greeting, role) {
  const admin = role === 'Administration';
  const today = new Date();
  const punctuation = /[.!?]$/.test(greeting.trim()) ? '' : '<span class="overview-welcome__period">.</span>';
  root.innerHTML = `<div class="overview-welcome">
    <div class="overview-welcome__copy">
      <span class="overview-welcome__eyebrow">${icon('book')}${escapeHtml(role)}</span>
      <h2>${escapeHtml(greeting)}${punctuation}</h2>
      <p>${admin ? 'Your people, learning spaces, and next decisions. Everything you need to keep your school moving.' : 'Start with what needs you: class updates, reading reviews, and the week ahead.'}</p>
      <a class="overview-welcome__link" href="${admin ? '#/classes' : '#/messages'}">${admin ? 'Explore your classrooms' : 'Connect with your classes'}${icon('arrow')}</a>
    </div>
    <div class="overview-welcome__art">
      <div class="overview-date"><span class="overview-date__day">${today.getDate()}</span><span><b>${escapeHtml(today.toLocaleDateString(undefined, { weekday: 'long' }))}</b><small>${escapeHtml(today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</small></span></div>
      <img src="../img/logo.png" alt="" width="168" height="168" class="overview-welcome__mascot" />
      <span class="overview-welcome__caption" aria-hidden="true">Sama-sama sa pagkatuto.</span>
    </div>
  </div>`;
}
