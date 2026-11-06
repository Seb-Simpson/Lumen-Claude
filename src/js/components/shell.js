// App shell: header (search, upload, theme, account menu), sidebar and footer.

import { h, mount, debounce } from '../utils.js';
import { icon } from './icons.js';
import { avatar, openModal, toast } from './ui.js';
import { auth } from '../auth.js';
import { store, getSettings, updateSettings } from '../store.js';
import { library } from '../library.js';
import { getPublicVideos, getChannel } from '../videos.js';
import { searchVideos } from '../search.js';
import { navigate, currentPath, parseHash } from '../router.js';
import { applyTheme } from '../theme.js';

const DESKTOP = window.matchMedia('(min-width: 1100px)');

/* ---------------- Header ---------------- */
export function renderHeader() {
  const header = document.getElementById('site-header');
  const me = auth.currentUser();
  const { query } = parseHash(location.hash);

  const input = h('input', {
    id: 'search-input', type: 'search', name: 'q', placeholder: 'Search', autocomplete: 'off',
    list: 'search-suggestions', value: currentPath() === '/search' ? query.get('q') || '' : '',
    aria: { label: 'Search videos' }, enterkeyhint: 'search',
  });
  const datalist = h('datalist', { id: 'search-suggestions' });
  // Debounced suggestions from video titles.
  const suggest = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { datalist.replaceChildren(); return; }
    const results = searchVideos(await getPublicVideos(), q).slice(0, 6);
    datalist.replaceChildren(...results.map((v) => h('option', { value: v.title })));
  }, 250);
  input.addEventListener('input', suggest);

  const form = h('form', { class: 'search-form', role: 'search', onSubmit: (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    header.classList.remove('search-open');
    navigate(`/search?q=${encodeURIComponent(q)}`);
  } },
  h('button', { class: 'icon-btn search-back', type: 'button', aria: { label: 'Close search' }, onClick: () => header.classList.remove('search-open') }, icon('arrowBack')),
  input, datalist,
  h('button', { class: 'search-submit', type: 'submit', aria: { label: 'Search' } }, icon('search')));

  const isDark = document.documentElement.dataset.theme === 'dark';
  const themeBtn = h('button', {
    class: 'icon-btn', type: 'button', aria: { label: isDark ? 'Switch to light theme' : 'Switch to dark theme' },
    title: 'Toggle theme', onClick: () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      updateSettings({ theme: dark ? 'light' : 'dark' });
      applyTheme();
      renderHeader();
      document.querySelector('[data-theme-toggle]')?.focus();
    },
  }, icon(isDark ? 'sun' : 'moon'));
  themeBtn.dataset.themeToggle = '';

  mount(header,
    h('div', { class: 'header-start' },
      h('button', { class: 'icon-btn', type: 'button', id: 'menu-btn', aria: { label: 'Toggle navigation menu', controls: 'sidebar', expanded: String(isSidebarOpen()) }, onClick: toggleSidebar }, icon('menu')),
      h('a', { class: 'logo', href: '#/', aria: { label: 'Lumen home' } },
        h('img', { src: 'assets/favicon.svg', alt: '', width: 28, height: 28 }),
        h('span', { class: 'logo-text' }, 'Lumen'))),
    h('div', { class: 'header-center' }, form),
    h('div', { class: 'header-end' },
      h('button', { class: 'icon-btn search-toggle', type: 'button', aria: { label: 'Search' }, onClick: () => { header.classList.add('search-open'); input.focus(); } }, icon('search')),
      h('a', { class: 'icon-btn', href: '#/upload', aria: { label: 'Upload a video' }, title: 'Upload' }, icon('upload')),
      themeBtn,
      me ? accountMenu(me) : h('a', { class: 'btn btn-outline signin-btn', href: '#/login' }, icon('user', { size: 20 }), h('span', {}, 'Sign in'))));
}

function accountMenu(me) {
  const menuId = 'account-menu';
  const btn = h('button', { class: 'avatar-btn', type: 'button', aria: { label: `Account menu for ${me.displayName}`, haspopup: 'menu', expanded: 'false', controls: menuId } },
    avatar({ initial: me.initial, color: me.color, size: 32 }));
  const item = (href, iconName, label, onClick) => h('li', { role: 'none' },
    h(href ? 'a' : 'button', { role: 'menuitem', class: 'menu-item', href, type: href ? null : 'button', tabindex: '-1', onClick }, icon(iconName, { size: 20 }), label));
  const menu = h('ul', { class: 'dropdown', id: menuId, role: 'menu', hidden: true },
    h('li', { role: 'none', class: 'menu-head' },
      avatar({ initial: me.initial, color: me.color, size: 40 }),
      h('div', {}, h('strong', {}, me.displayName), h('div', { class: 'muted' }, `@${me.username}`))),
    item(`#/channel/${encodeURIComponent(me.id)}`, 'user', 'Your channel'),
    item('#/studio', 'studio', 'Lumen Studio'),
    item('#/profile', 'edit', 'Edit profile'),
    item('#/settings', 'settings', 'Settings'),
    item(null, 'logout', 'Sign out', () => { auth.logOut(); toast('Signed out'); navigate('/'); }));

  const items = () => Array.from(menu.querySelectorAll('[role="menuitem"]'));
  const close = (focusBtn = true) => {
    menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside, true);
    if (focusBtn) btn.focus();
  };
  const outside = (e) => { if (!wrap.contains(e.target)) close(false); };
  const open = () => {
    menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
    items()[0]?.focus();
    document.addEventListener('click', outside, true);
  };
  btn.addEventListener('click', () => (menu.hidden ? open() : close()));
  menu.addEventListener('click', (e) => { if (e.target.closest('[role="menuitem"]')) close(false); });
  menu.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Tab') close(false);
  });
  const wrap = h('div', { class: 'account' }, btn, menu);
  return wrap;
}

/* ---------------- Sidebar ---------------- */
function isSidebarOpen() {
  return DESKTOP.matches ? !getSettings().sidebarCollapsed : document.body.classList.contains('drawer-open');
}

export function toggleSidebar(force) {
  const backdrop = document.getElementById('sidebar-backdrop');
  if (DESKTOP.matches) {
    updateSettings({ sidebarCollapsed: typeof force === 'boolean' ? !force : !getSettings().sidebarCollapsed });
    document.body.classList.toggle('sidebar-mini', getSettings().sidebarCollapsed);
  } else {
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('drawer-open');
    document.body.classList.toggle('drawer-open', open);
    backdrop.hidden = !open;
    if (open) document.querySelector('#sidebar a')?.focus();
  }
  document.getElementById('menu-btn')?.setAttribute('aria-expanded', String(isSidebarOpen()));
}

export function closeDrawer() {
  if (!DESKTOP.matches && document.body.classList.contains('drawer-open')) toggleSidebar(false);
}

export function renderSidebar() {
  const nav = document.getElementById('sidebar');
  const path = currentPath();
  const link = (href, iconName, label) => {
    const active = path === href.slice(1) || (href !== '#/' && path.startsWith(href.slice(1) + '/'));
    return h('li', {}, h('a', { href, class: `nav-link ${active ? 'active' : ''}`, aria: { current: active ? 'page' : null } },
      icon(iconName), h('span', { class: 'nav-label' }, label)));
  };
  const subs = library.subscriptions().map(getChannel).filter(Boolean);
  mount(nav,
    h('ul', { class: 'nav-section' },
      link('#/', 'home', 'Home'),
      link('#/subscriptions', 'subs', 'Subscriptions'),
      link('#/library', 'library', 'Library')),
    h('ul', { class: 'nav-section' },
      h('li', { class: 'nav-heading' }, 'You'),
      link('#/history', 'history', 'History'),
      link('#/watch-later', 'clock', 'Watch later'),
      link('#/liked', 'like', 'Liked videos'),
      link('#/playlists', 'playlist', 'Playlists'),
      link('#/studio', 'studio', 'Your videos')),
    subs.length ? h('ul', { class: 'nav-section nav-subs' },
      h('li', { class: 'nav-heading' }, 'Subscriptions'),
      subs.slice(0, 8).map((c) => h('li', {}, h('a', { href: `#/channel/${encodeURIComponent(c.id)}`, class: `nav-link ${path === `/channel/${c.id}` ? 'active' : ''}` },
        avatar({ initial: c.initial, color: c.color, size: 24 }), h('span', { class: 'nav-label' }, c.name))))) : null,
    h('ul', { class: 'nav-section' },
      h('li', { class: 'nav-heading' }, 'More'),
      link('#/settings', 'settings', 'Settings'),
      link('#/help', 'help', 'Help'),
      h('li', {}, h('button', { class: 'nav-link', type: 'button', onClick: openShortcuts }, icon('keyboard'), h('span', { class: 'nav-label' }, 'Shortcuts')))));
}

/* ---------------- Footer ---------------- */
export function renderFooter() {
  mount(document.getElementById('site-footer'),
    h('nav', { aria: { label: 'Footer' } },
      h('ul', { class: 'footer-links' },
        [['#/about', 'About'], ['#/privacy', 'Privacy'], ['#/terms', 'Terms'], ['#/help', 'Help']].map(([href, label]) => h('li', {}, h('a', { href }, label))),
        h('li', {}, h('button', { type: 'button', class: 'link-btn', onClick: openShortcuts }, 'Keyboard shortcuts')))),
    h('p', { class: 'demo-note' }, icon('info', { size: 16 }),
      ' Demo project: accounts, comments and uploads are stored only in this browser. Sign-in is not real security — don\'t reuse a real password.'),
    h('p', { class: 'muted' }, `© ${new Date().getFullYear()} Lumen. MIT licensed.`));
}

/* ---------------- Keyboard shortcuts modal ---------------- */
const SHORTCUTS = [
  ['General', [['?', 'Show keyboard shortcuts'], ['/', 'Focus search'], ['Esc', 'Close dialogs and menus']]],
  ['Player', [['Space or K', 'Play / pause'], ['← / →', 'Seek 5 seconds'], ['J / L', 'Seek 10 seconds'], ['↑ / ↓', 'Volume up / down'],
    ['M', 'Mute / unmute'], ['F', 'Full screen'], ['0–9', 'Jump to 0–90%'], ['< / >', 'Slower / faster playback']]],
];

export function openShortcuts() {
  if (document.querySelector('dialog.shortcuts-modal')) return;
  openModal({
    title: 'Keyboard shortcuts',
    className: 'shortcuts-modal',
    body: SHORTCUTS.map(([group, rows]) => h('section', {},
      h('h3', {}, group),
      h('dl', { class: 'shortcut-list' }, rows.map(([k, d]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, d)])))),
  });
}

/** Keep the shell in sync with auth/library/settings changes. */
export function initShell() {
  renderHeader();
  renderSidebar();
  renderFooter();
  document.body.classList.toggle('sidebar-mini', getSettings().sidebarCollapsed);
  document.getElementById('sidebar-backdrop').addEventListener('click', () => toggleSidebar(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  DESKTOP.addEventListener('change', () => {
    document.body.classList.remove('drawer-open');
    document.getElementById('sidebar-backdrop').hidden = true;
  });
  store.on('session', () => { renderHeader(); renderSidebar(); });
  store.on('*', (_, key) => { if (key.endsWith(':subs')) renderSidebar(); });
}
