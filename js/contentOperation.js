const operations = {
  archive: {
    pending: 'Archiving…', complete: 'Archived',
    icon: '<path class="content-operation__lid" d="M3 4h18v4H3z"/><path d="M5 8v12h14V8"/><path class="content-operation__contents" d="M10 12h4"/>',
    exit: 'translateY(8px)',
  },
  delete: {
    pending: 'Deleting…', complete: 'Deleted',
    icon: '<path class="content-operation__lid" d="M4 7h16M9 7V4h6v3"/><path d="m6 7 1 13h10l1-13"/><path class="content-operation__contents" d="M10 11v6m4-6v6"/>',
    exit: 'scale(.98)',
  },
  restore: {
    pending: 'Restoring…', complete: 'Restored',
    icon: '<g class="content-operation__arrow"><path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/></g>',
    exit: 'translateY(-8px)',
  },
};

// Runs only after confirmation. No optimistic removal or artificial request delay.
export function beginContentOperation(source, action, title) {
  const operation = operations[action];
  const row = source?.closest('.module-card, .module-library-row, [data-lesson-row]');
  if (!operation || !row) return { complete: async () => {}, dispose() {} };
  const mount = row.querySelector('.content-item-heading__text') || row.querySelector('td') || row;
  const controls = [...row.querySelectorAll('button, input, select')].map(control => [control, control.disabled]);
  const previousBusy = source.getAttribute('aria-busy');
  const progress = document.createElement('span');
  progress.className = `content-operation content-operation--${action}`;
  progress.setAttribute('role', 'status');
  progress.setAttribute('aria-atomic', 'true');
  progress.setAttribute('aria-label', `${operation.pending} ${title || 'Untitled'}`);
  progress.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${operation.icon}</svg><span>${operation.pending}</span>`;
  controls.forEach(([control]) => { control.disabled = true; });
  source.setAttribute('aria-busy', 'true');
  row.classList.add('is-content-busy');
  mount.append(progress);
  let animation;
  return {
    async complete() {
      progress.classList.add('is-complete');
      progress.setAttribute('aria-label', `${operation.complete}: ${title || 'Untitled'}`);
      progress.querySelector('span').textContent = operation.complete;
      progress.querySelector('svg').innerHTML = '<path class="content-operation__check" d="m5 12 4 4L19 6"/>';
      if (!row.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      animation = row.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: operation.exit }],
        { duration: 240, easing: 'ease-in', fill: 'forwards' });
      await animation.finished.catch(() => {});
    },
    dispose() {
      animation?.cancel();
      progress.remove();
      row.classList.remove('is-content-busy');
      controls.forEach(([control, disabled]) => { control.disabled = disabled; });
      if (previousBusy === null) source.removeAttribute('aria-busy');
      else source.setAttribute('aria-busy', previousBusy);
    },
  };
}
