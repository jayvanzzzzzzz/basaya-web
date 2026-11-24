import { escapeHtml as esc, openModal } from './helpers.js';
import { openLessonViewer } from '../admin/views/lessonViewer.js';

export function openModulePreview(module, lessons) {
  const previous = document.activeElement;
  openModal(`<section class="module-workspace module-detail-preview"><h2 id="module-preview-title">${esc(module.title)}</h2>${module.description ? `<p>${esc(module.description)}</p>` : ''}<p class="module-note">${module.lessonIds.length} lessons · Learning order</p><ol class="module-order">${module.lessonIds.map((id, index) => {
    const lesson = lessons.find(item => item.id === id);
    return `<li class="module-order-row"><span class="module-number">${index + 1}</span><div class="module-lesson-name"><strong>${esc(lesson?.title || 'Lesson unavailable')}</strong>${lesson?.description ? `<small>${esc(lesson.description)}</small>` : ''}</div>${lesson ? `<button type="button" class="button secondary small" data-module-preview-lesson="${esc(id)}">Preview lesson</button>` : ''}</li>`;
  }).join('')}</ol><div class="modal-actions"><button type="button" class="button secondary" data-module-preview-close>Close preview</button></div></section>`, (host, close) => {
    const modal = host.querySelector('.modal');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'module-preview-title');
    const dismiss = () => { close(); if (previous?.isConnected) previous.focus(); };
    host.querySelector('[data-module-preview-close]').onclick = dismiss;
    host.querySelectorAll('[data-module-preview-lesson]').forEach(button => button.onclick = () => { dismiss(); openLessonViewer(lessons.find(item => item.id === button.dataset.modulePreviewLesson)); });
    host.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); dismiss(); } });
    host.querySelector('[data-module-preview-close]').focus();
  });
}
