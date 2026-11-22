import { attachFloatingTooltips } from './floatingTooltip.js';

const backLabel = /^(?:(?:←|‹|⟵)\s*)?(?:back(?:\s+to\b.*)?|go back(?:\s+.*)?|return to\s+.+|bumalik(?:\s+sa\b.*)?)$/i;
const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true" data-back-arrow><path d="M19 12H5m6-6-6 6 6 6"/></svg>';
const clean = value => (value || '').replace(/\s+/g, ' ').trim();
const generatedLabels = new WeakMap();

function enhance(control) {
  if (!control.matches('a,button')) return;
  // An existing icon keeps its descriptive label. Text controls supply their own
  // destination; matching whole labels avoids actions such as "Send feedback".
  const spoken = clean(control.getAttribute('aria-label'));
  const text = clean(control.textContent);
  const label = backLabel.test(spoken) && spoken !== generatedLabels.get(control)
    ? spoken : backLabel.test(text) ? text : backLabel.test(spoken) ? spoken : '';
  if (!label) return;
  const accessibleLabel = label.replace(/^(?:←|‹|⟵)\s*/, '');
  control.classList.add('back-icon-button');
  control.setAttribute('data-back-tooltip', '');
  if (spoken !== accessibleLabel) {
    control.setAttribute('aria-label', accessibleLabel);
    generatedLabels.set(control, accessibleLabel);
  }
  // Existing student tooltips otherwise draw a second caption beside the shared one.
  control.classList.remove('st-hub-tooltip');
  control.removeAttribute('data-tooltip');
  control.removeAttribute('title');
  if (control.children.length !== 1 || !control.firstElementChild?.hasAttribute('data-back-arrow') || text) {
    control.innerHTML = arrow;
  }
}

function start() {
  attachFloatingTooltips(document, '[data-back-tooltip]', { tooltipClass: 'back-button-tooltip' });
  document.querySelectorAll('a,button').forEach(enhance);
  const observer = new MutationObserver(records => {
    const controls = new Set();
    const collect = node => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!element) return;
      const parent = element.closest('a,button');
      if (parent) controls.add(parent);
      element.querySelectorAll?.('a,button').forEach(control => controls.add(control));
    };
    for (const record of records) {
      const control = record.target.parentElement?.closest('a,button');
      if (control) controls.add(control);
      if (record.type === 'attributes') controls.add(record.target);
      else {
        // A label changed in place, or a new route/dialog added its Back control.
        if (record.target.matches?.('a,button')) controls.add(record.target);
        record.addedNodes.forEach(collect);
      }
    }
    controls.forEach(enhance);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['aria-label', 'title'] });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
