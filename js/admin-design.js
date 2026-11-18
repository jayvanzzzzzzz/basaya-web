import { attachFloatingTooltips } from './floatingTooltip.js';
import { syncThemeButtons } from './theme-buttons.js';

// Reuse the authenticated profile; this module only presents existing controls.
const app = document.getElementById('app-view');
function syncAdminDesign() {
  document.querySelectorAll('.main-nav [data-nav]').forEach(link => {
    const text = link.querySelector('strong')?.textContent;
    if (text) { link.setAttribute('aria-label', text); link.dataset.adminNavTooltip = ''; }
  });
  syncThemeButtons();
}
syncAdminDesign();
const observer = new MutationObserver(syncAdminDesign);
observer.observe(app, { childList: true, subtree: true });
// Buttons with dedicated CSS or page-level tooltips keep that single tooltip owner.
attachFloatingTooltips(document.body, 'button[aria-label]:not([data-floating-tooltip], [data-act], [data-tooltip], [data-report-tooltip], .lesson-add-button, .lesson-remove-button, .site-info__close), [data-admin-nav-tooltip]');
