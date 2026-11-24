import { escapeHtml } from './helpers.js';
import { confirmAction } from './action-confirmation.js';

// Accept a snapshot so the confirmation always describes exactly what will save.
export function previewModuleOrder(modules, options = {}) {
  const details = document.createElement('div');
  details.className = 'module-sequence-preview';
  details.innerHTML = '<ol>' + modules.map((module, index) => `<li><strong>${index + 1}. ${escapeHtml(module.title || 'Untitled module')}</strong>${module.existing ? '<small>Already assigned</small>' : ''}<ol>${module.lessons.map(title => `<li>${escapeHtml(title)}</li>`).join('')}</ol></li>`).join('') + '</ol>';
  return confirmAction({ title: 'Preview module and lesson order',
    message: 'Review the modules and the lesson order inside each module before saving.',
    confirm: 'Save modules', ...options, details });
}
