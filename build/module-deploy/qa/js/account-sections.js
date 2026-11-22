// Keep separate forms mounted: switching sections never submits or loses drafts.
export function setupAccountSections(root, sections, initial = 'profile') {
  root.classList.add('account-settings--sections');
  const grid = root.querySelector('.account-settings__grid');
  root.querySelector('.account-settings__nav')?.remove();
  const nav = document.createElement('div');
  nav.className = 'account-settings__tabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Account settings sections');
  nav.setAttribute('aria-orientation', 'vertical');
  const icons = {
    profile: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    username: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M5 16a3 3 0 0 1 6 0M14 9h4M14 13h4"/>',
    security: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  };
  const tabs = [], panels = [];
  for (const { key, label, selectors } of sections) {
    const panel = document.createElement('div');
    panel.className = 'account-settings__panel';
    panel.id = `settings-panel-${key}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `settings-tab-${key}`);
    panel.tabIndex = 0;
    for (const selector of selectors) panel.append(root.querySelector(selector));
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = `settings-tab-${key}`;
    tab.dataset.settingsTab = key;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.innerHTML = `<span class="account-settings__tab-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[key] || icons.profile}</svg></span>`;
    const text = document.createElement('span');
    text.textContent = label;
    tab.append(text);
    tab.insertAdjacentHTML('beforeend', '<svg class="account-settings__tab-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>');
    tabs.push(tab); panels.push(panel);
    nav.append(tab); grid.append(panel);
  }
  const select = index => {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      const next = { ArrowDown: (index + 1) % tabs.length, ArrowUp: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault(); select(next); tabs[next].focus();
    });
  });
  root.querySelector('.account-settings__hero').append(nav);
  select(Math.max(0, sections.findIndex(section => section.key === initial)));
}
