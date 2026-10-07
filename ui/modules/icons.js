const paths = {
  play:'<path d="m7 4 13 8-13 8Z"/>', layers:'<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  settings:'<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3h3l2 3 3-1 1-3 3-1 2-3-2-2 1-3-2-3h-3l-2-3Z"/><circle cx="11.5" cy="12" r="3"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',
  edit:'<path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',
  folder:'<path d="M3 20V5h6l2 3h10v12Z"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',storage:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18m-5 3h2"/>'
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
export function renderIcons() { document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
