// Lightweight decorative identity marks; titles supply the accessible name.
export function contentAvatar(kind = 'lesson') {
  const module = kind === 'module';
  const paths = module
    ? '<rect x="7" y="3" width="13" height="15" rx="2"/><path d="M7 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1M11 7h5M11 11h5M11 15h3"/>'
    : '<path d="M12 5v15M3 4.5c3.2-1 6.2-.5 9 1.5 2.8-2 5.8-2.5 9-1.5V18c-3.2-1-6.2-.5-9 1.5-2.8-2-5.8-2.5-9-1.5Z"/><path d="m6 8 3 1m6 0 3-1M6 12l3 1m6 0 3-1"/>';
  return `<span class="content-avatar content-avatar--${module ? 'module' : 'lesson'}" aria-hidden="true"><svg viewBox="0 0 24 24">${paths}</svg></span>`;
}
