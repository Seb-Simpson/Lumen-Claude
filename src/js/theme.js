// Theme handling: 'light' | 'dark' | 'system' (follows prefers-color-scheme).

import { getSettings } from './store.js';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function resolvedTheme(pref = getSettings().theme) {
  return pref === 'dark' || (pref === 'system' && media.matches) ? 'dark' : 'light';
}

export function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', theme === 'dark' ? '#0f0f10' : '#ffffff');
    m.removeAttribute('media');
  });
}

export function watchSystemTheme(onChange) {
  media.addEventListener('change', () => {
    if (getSettings().theme === 'system') { applyTheme(); onChange?.(); }
  });
}
