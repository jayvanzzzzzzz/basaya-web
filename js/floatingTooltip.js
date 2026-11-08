let tooltipSequence = 0;

/** Body-level tooltips escape a modal's overflow without changing its scrolling. */
export function attachFloatingTooltips(root, selector = '[data-floating-tooltip]') {
  const tooltip = document.createElement('span');
  tooltip.className = 'floating-tooltip';
  tooltip.id = `floating-tooltip-${++tooltipSequence}`;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  let hovered = null, focused = null, anchor = null;

  function hide() {
    if (anchor) {
      const ids = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tooltip.id);
      if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' '));
      else anchor.removeAttribute('aria-describedby');
    }
    anchor = null;
    tooltip.hidden = true;
  }
  function position() {
    if (!anchor) return;
    if (!anchor.isConnected || anchor.disabled || anchor.closest('[hidden]')) { hovered = focused = null; hide(); return; }
    const box = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
    if (box.bottom < y || box.top > y + height || box.right < x || box.left > x + width) { hovered = focused = null; hide(); return; }
    tooltip.style.maxWidth = `${Math.max(1, width - 16)}px`;
    const size = tooltip.getBoundingClientRect();
    const left = Math.max(x + 8, Math.min(box.left + box.width / 2 - size.width / 2, x + width - size.width - 8));
    let top = box.top - size.height - 8;
    if (top < y + 8) top = box.bottom + 8;
    top = Math.max(y + 8, Math.min(top, y + height - size.height - 8));
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }
  function refresh() {
    const next = hovered || focused;
    if (!next || next.disabled || next.closest('[hidden]')) { hide(); return; }
    if (anchor !== next) {
      hide(); anchor = next;
      tooltip.textContent = next.getAttribute('aria-label') || next.dataset.floatingTooltip;
      const ids = (next.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      next.setAttribute('aria-describedby', [...ids, tooltip.id].join(' '));
    }
    tooltip.hidden = false;
    position();
  }
  const button = event => event.target?.closest?.(selector);
  const over = event => { const target = button(event); if (target && root.contains(target)) { hovered = target; refresh(); } };
  const out = event => { const target = button(event); if (target && !target.contains(event.relatedTarget)) { hovered = null; refresh(); } };
  const focus = event => { focused = button(event); refresh(); };
  const blur = event => { if (!focused?.contains(event.relatedTarget)) { focused = null; refresh(); } };
  const dismiss = () => { hovered = focused = null; hide(); };
  const click = event => { if (button(event)) dismiss(); };
  const keydown = event => {
    if (event.key === 'Escape' && !tooltip.hidden) { dismiss(); event.preventDefault(); event.stopPropagation(); }
  };
  root.addEventListener('pointerover', over); root.addEventListener('pointerout', out);
  root.addEventListener('focusin', focus); root.addEventListener('focusout', blur);
  root.addEventListener('click', click); root.addEventListener('keydown', keydown);
  window.addEventListener('scroll', position, true); window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position);
  const observer = new MutationObserver(() => { if (anchor) position(); });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
  return () => {
    dismiss(); observer.disconnect(); tooltip.remove();
    root.removeEventListener('pointerover', over); root.removeEventListener('pointerout', out);
    root.removeEventListener('focusin', focus); root.removeEventListener('focusout', blur);
    root.removeEventListener('click', click); root.removeEventListener('keydown', keydown);
    window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position);
  };
}
