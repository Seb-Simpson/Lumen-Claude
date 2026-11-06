// Entry point: wires up the shell, routes and global behaviour.

import { route, notFound, start, afterEach } from './router.js';
import { store } from './store.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { initShell, renderSidebar, renderHeader, closeDrawer, openShortcuts } from './components/shell.js';
import { toast } from './components/ui.js';
import { render as home } from './views/home.js';
import { render as watch } from './views/watch.js';
import { render as search } from './views/search.js';
import { render as channel } from './views/channel.js';
import { render as upload } from './views/upload.js';
import { render as studio } from './views/studio.js';
import { render as settings } from './views/settings.js';
import { renderLogin, renderSignup, renderProfile } from './views/account.js';
import { renderLibrary, renderHistory, renderLiked, renderWatchLater, renderSubscriptions } from './views/library.js';
import { renderPage, renderNotFound } from './views/pages.js';
import { renderPlaylists, renderPlaylist } from './views/playlists.js';
import * as remote from './backend/remote.js';
import { library } from './library.js';

applyTheme();
watchSystemTheme(renderHeader);
initShell();

route('/', home);
route('/watch/:id', watch);
route('/search', search);
route('/channel/:id', channel);
route('/upload', upload);
route('/studio', studio);
route('/settings', settings);
route('/login', renderLogin);
route('/signup', renderSignup);
route('/profile', renderProfile);
route('/library', renderLibrary);
route('/history', renderHistory);
route('/liked', renderLiked);
route('/watch-later', renderWatchLater);
route('/subscriptions', renderSubscriptions);
route('/playlists', renderPlaylists);
route('/playlist/:id', renderPlaylist);
route('/about', renderPage('about'));
route('/privacy', renderPage('privacy'));
route('/terms', renderPage('terms'));
route('/help', renderPage('help'));
route('/shortcuts', (ctx) => { renderPage('help')(ctx); openShortcuts(); });
notFound(renderNotFound);

let firstRoute = true;
afterEach(() => {
  renderSidebar();
  closeDrawer();
  // Move focus to the page heading on navigation so screen readers announce it.
  if (!firstRoute) (document.querySelector('#main h1') || document.getElementById('main')).focus({ preventScroll: true });
  firstRoute = false;
});

// Storage problems surface as toasts rather than silent failures.
store.on('error', ({ quota }) => {
  toast(quota ? 'Browser storage is full. Clear your history or delete uploads to free space.' : 'Could not save your changes (storage is blocked).', { type: 'error', timeout: 7000 });
});
if (!store.persistent) toast('Storage is disabled in this browser, so your changes will be lost when you close the tab.', { type: 'error', timeout: 8000 });

// Global shortcuts: "/" focuses search, "?" opens the shortcuts list.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  if (e.key === '/') { e.preventDefault(); const s = document.getElementById('search-input'); s?.focus(); if (s && getComputedStyle(s).display === 'none') document.getElementById('site-header').classList.add('search-open'); }
  else if (e.key === '?') { e.preventDefault(); openShortcuts(); }
});

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Something went wrong. Please try again.', { type: 'error' });
});

/* ---------- Supabase mode: load shared data before the first page ---------- */

/** Pull the signed-in user's likes, subscriptions and playlists from the server. */
async function hydrateFromServer() {
  if (!remote.sb.userId) return;
  library.hydrate(await remote.fetchMine());
}

async function initRemote() {
  try {
    await remote.sb.auth.ensureFresh();
  } catch (err) {
    if (err.status >= 400 && err.status < 500) toast('Your session expired. Please sign in again.');
  }
  try {
    await remote.loadProfiles();
    await hydrateFromServer();
  } catch (err) {
    console.error(err);
    toast(`Couldn't reach the Lumen server, so some things may be missing. ${err.message}`, { type: 'error', timeout: 8000 });
  }
  // Re-sync after signing in, and after any failed save so the screen matches the server.
  let lastUser = remote.sb.userId;
  store.on('session', async () => {
    const id = remote.sb.userId;
    if (id && id !== lastUser) {
      await remote.loadProfiles().catch(() => {});
      await hydrateFromServer().catch((e) => console.error(e));
      renderSidebar();
    }
    lastUser = id;
  });
  document.addEventListener('lumen:sync-error', async (e) => {
    toast(`Couldn't save that change. ${e.detail?.message || ''}`.trim(), { type: 'error', timeout: 6000 });
    await hydrateFromServer().catch(() => {});
    renderSidebar();
  });
  document.addEventListener('lumen:offline', (e) => {
    toast(`Couldn't load videos from the server. ${e.detail?.message || ''}`.trim(), { type: 'error', timeout: 8000 });
  });
}

(remote.REMOTE ? initRemote() : Promise.resolve()).finally(() => {
  renderHeader();
  renderSidebar();
  start(document.getElementById('main'));
});
