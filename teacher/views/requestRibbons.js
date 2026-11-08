const activeByClass = new Map();
export function setRequestTab(classId, kind) {
  if (kind === 'join' || kind === 'leave') activeByClass.set(classId, kind);
}
export function requestRibbons(leaveCount = 0) {
  return `<div class="request-ribbons" role="tablist" aria-label="Student requests">
    <button id="request-tab-join" class="request-ribbon request-ribbon--join" type="button" role="tab" aria-selected="true" aria-controls="request-panel-join" tabindex="0" data-request-tab="join">
      <span class="request-ribbon__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13 5h6v14h-6M3 12h12m-4-4 4 4-4 4"/></svg></span>
      <span class="request-ribbon__copy"><strong>Join requests</strong><small>Waiting to join your class</small></span><span id="request-tab-join-count" class="request-ribbon__count">—</span>
    </button>
    <button id="request-tab-leave" class="request-ribbon request-ribbon--leave" type="button" role="tab" aria-selected="false" aria-controls="request-panel-leave" tabindex="-1" data-request-tab="leave">
      <span class="request-ribbon__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 5H5v14h6m-1-7h12m-4-4 4 4-4 4"/></svg></span>
      <span class="request-ribbon__copy"><strong>Leave requests</strong><small>Asking to leave your class</small></span><span id="request-tab-leave-count" class="request-ribbon__count">${leaveCount}</span>
    </button>
  </div>`;
}
export function wireRequestRibbons(classId, root = document) {
  const buttons = [...root.querySelectorAll("[data-request-tab]")];
  const select = (kind, focus = false) => {
    activeByClass.set(classId, kind);
    buttons.forEach((button) => {
      const active = button.dataset.requestTab === kind;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      root.querySelector(`#${button.getAttribute("aria-controls")}`).hidden = !active;
      if (active && focus) button.focus();
    });
  };
  select(activeByClass.get(classId) || "join");
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => select(button.dataset.requestTab));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      select(buttons[next].dataset.requestTab, true);
    });
  });
}
