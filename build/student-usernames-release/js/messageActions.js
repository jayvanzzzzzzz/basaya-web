import { escapeHtml } from "./helpers.js";

const dots = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
export const messageActions = (id, label = "Message options") => `<button type="button" class="chat-message-options" data-message-actions="${escapeHtml(id)}" aria-label="${escapeHtml(label)}" aria-haspopup="menu" aria-expanded="false" data-floating-tooltip>${dots}</button>`;

/** One delegated menu for the list; callbacks retain each portal's deletion policy. */
export function wireMessageActions(list, { onDelete, label = "Delete for everyone", confirmLabel = "", optionsLabel = "Message options" }) {
  let menu, trigger, timer, start, suppressClick = false, busy = false;
  const events = new AbortController();
  const { signal } = events;
  const cancelHold = () => { clearTimeout(timer); timer = null; start = null; };
  const close = (restore = false) => {
    menu?.remove(); menu = null;
    trigger?.setAttribute("aria-expanded", "false");
    if (restore && trigger?.isConnected) trigger.focus({ preventScroll: true });
    trigger = null;
  };
  const open = (button, point) => {
    if (busy || !button?.isConnected) return;
    close(); trigger = button;
    button.setAttribute("aria-expanded", "true");
    menu = document.createElement("div");
    menu.className = "chat-message-menu"; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", optionsLabel);
    const action = document.createElement("button");
    action.type = "button"; action.setAttribute("role", "menuitem"); action.textContent = label;
    menu.append(action); document.body.append(menu);
    const rect = button.getBoundingClientRect();
    const x = point?.x ?? rect.right, y = point?.y ?? rect.bottom + 6;
    const position = () => {
      const box = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(innerWidth - box.width - 8, x - box.width))}px`;
      menu.style.top = `${Math.max(8, Math.min(innerHeight - box.height - 8, y))}px`;
    };
    position();
    let armed = !confirmLabel;
    action.addEventListener("click", async () => {
      if (busy) return;
      if (!armed) { armed = true; action.textContent = confirmLabel; position(); return; }
      const id = button.dataset.messageActions;
      busy = true; close();
      try { await onDelete(id); } finally {
        busy = false;
        if (button.isConnected && document.activeElement === document.body) button.focus({ preventScroll: true });
      }
    });
    action.focus({ preventScroll: true });
  };
  list.addEventListener("click", event => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; return; }
    const button = event.target.closest("[data-message-actions]");
    if (button) { if (trigger === button) close(); else open(button); }
  }, { signal, capture: true });
  list.addEventListener("pointerdown", event => {
    cancelHold();
    if (!["touch", "pen"].includes(event.pointerType) || event.target.closest("button,a,input,textarea")) return;
    const row = event.target.closest(".chat-msg"), button = row?.querySelector("[data-message-actions]");
    if (!button) return;
    start = { x: event.clientX, y: event.clientY };
    timer = setTimeout(() => { const point = start; cancelHold(); suppressClick = true; open(button, point); }, 500);
  }, { signal, passive: true });
  list.addEventListener("pointermove", event => {
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelHold();
  }, { signal, passive: true });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) list.addEventListener(name, cancelHold, { signal });
  list.addEventListener("contextmenu", event => {
    const button = event.target.closest(".chat-msg")?.querySelector("[data-message-actions]");
    if (button) { event.preventDefault(); cancelHold(); open(button, { x: event.clientX, y: event.clientY }); }
  }, { signal });
  document.addEventListener("pointerdown", event => {
    if (menu && !menu.contains(event.target) && !trigger?.contains(event.target)) close();
    suppressClick = false;
  }, { signal, capture: true });
  document.addEventListener("keydown", event => {
    if (!menu) return;
    if (event.key === "Escape") { event.preventDefault(); close(true); }
    else if (event.key === "Tab") close();
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); menu.querySelector("button").focus(); }
  }, { signal });
  const onScroll = event => { cancelHold(); if (menu && !menu.contains(event.target)) close(); };
  document.addEventListener("scroll", onScroll, { signal, capture: true, passive: true });
  window.addEventListener("resize", () => { cancelHold(); close(); }, { signal });
  window.addEventListener("blur", () => { cancelHold(); close(); }, { signal });
  const observer = new MutationObserver(() => { if (trigger && !trigger.isConnected) close(); cancelHold(); });
  observer.observe(list, { childList: true, subtree: true });
  return () => { cancelHold(); close(); events.abort(); observer.disconnect(); };
}
