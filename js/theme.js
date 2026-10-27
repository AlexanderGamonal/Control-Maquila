import { LS_THEME } from './config.js';
import { $, lsGet, lsSet } from './utils.js';

/* ===== THEME TOGGLE (LIGHT / DARK) ===== */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  lsSet(LS_THEME, theme);
  const mt = document.querySelector('meta[name=theme-color]');
  if (mt) mt.content = theme === 'dark' ? '#0c0a09' : '#f8f6f2';
  const icon = $('#themeIcon use');
  if (icon) {
    icon.setAttribute('href', theme === 'dark' ? '#icon-sun' : '#icon-moon');
  }
}

export function initTheme() {
  $('#btnThemeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  const saved = lsGet(LS_THEME);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const t = saved || (prefersDark ? 'dark' : 'light');
  applyTheme(t);
}
