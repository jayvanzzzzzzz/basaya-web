const savedButtons = new WeakMap();

export function setButtonSaving(button, saving) {
  if (!button) return;
  if (saving) {
    if (savedButtons.has(button)) return;
    savedButtons.set(button, { html: button.innerHTML, disabled: button.disabled, busy: button.getAttribute('aria-busy') });
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-saving');
    button.innerHTML = '<span class="button__saving-spinner" aria-hidden="true"></span><span>Saving…</span>';
  } else {
    const original = savedButtons.get(button);
    if (!original) return;
    button.innerHTML = original.html;
    button.disabled = original.disabled;
    if (original.busy === null) button.removeAttribute('aria-busy');
    else button.setAttribute('aria-busy', original.busy);
    button.classList.remove('is-saving');
    savedButtons.delete(button);
  }
}
