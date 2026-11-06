import { h, mount } from '../utils.js';
import { getSettings, updateSettings, store } from '../store.js';
import { library } from '../library.js';
import { applyTheme } from '../theme.js';
import { SPEEDS } from '../components/player.js';
import { toast, confirmDialog, pageTitle } from '../components/ui.js';
import { renderHeader } from '../components/shell.js';
import { db, ready } from '../db.js';
import { REMOTE } from '../backend/remote.js';

export async function render(ctx) {
  ctx.setMeta('Settings', 'Lumen preferences.');
  const s = getSettings();
  const save = (patch, msg = 'Settings saved') => { if (updateSettings(patch)) toast(msg); };

  const themeGroup = h('fieldset', { class: 'radio-group' }, h('legend', {}, 'Theme'),
    [['system', 'Use device theme'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) =>
      h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'theme', value: v, checked: s.theme === v,
        onChange: () => { save({ theme: v }, `Theme: ${l}`); applyTheme(); renderHeader(); } }), h('span', {}, l))));

  const speed = h('select', { id: 'set-speed', value: String(s.speed), onChange: (e) => save({ speed: Number(e.target.value) }) },
    SPEEDS.map((v) => h('option', { value: String(v) }, v === 1 ? 'Normal (1×)' : `${v}×`)));

  const autoplay = h('input', { id: 'set-autoplay', type: 'checkbox', role: 'switch', checked: s.autoplay,
    onChange: (e) => save({ autoplay: e.target.checked }, e.target.checked ? 'Autoplay on' : 'Autoplay off') });

  const storageInfo = h('p', { class: 'muted small' }, 'Checking storage…');
  mount(ctx.outlet, h('div', { class: 'page narrow' },
    pageTitle('Settings'),
    h('section', { class: 'settings-section' }, h('h2', {}, 'Appearance'), themeGroup),
    h('section', { class: 'settings-section' }, h('h2', {}, 'Playback'),
      h('div', { class: 'field' }, h('label', { for: 'set-speed' }, 'Default playback speed'), speed),
      h('label', { class: 'switch-row', for: 'set-autoplay' }, autoplay, h('span', {}, h('strong', {}, 'Autoplay'), h('span', { class: 'muted small' }, 'Play the next video automatically when one ends')))),
    h('section', { class: 'settings-section' }, h('h2', {}, 'Privacy & data'),
      h('p', {}, REMOTE ? 'Your watch history and these settings are stored only in this browser.' : 'Your history, likes and uploads are stored only in this browser.'),
      h('button', { class: 'btn btn-secondary', type: 'button', onClick: async () => {
        if (!(await confirmDialog({ title: 'Clear watch history?', message: 'This removes all videos from your history and resets saved playback positions.', confirmLabel: 'Clear history', danger: true }))) return;
        library.clearHistory();
        toast('Watch history cleared');
      } }, 'Clear watch history'),
      storageInfo)));

  await ready();
  const est = await navigator.storage?.estimate?.().catch(() => null);
  if (!ctx.isActive()) return;
  const parts = [
    store.persistent ? 'Settings storage: available.' : 'Settings storage: blocked — changes last for this tab only.',
    REMOTE ? 'Accounts, uploads and reactions: stored on the Lumen server (Supabase).'
      : db.persistent ? 'Upload storage (IndexedDB): available.' : 'Upload storage (IndexedDB): unavailable.',
  ];
  if (est?.quota) parts.push(`Using ${(est.usage / 1048576).toFixed(1)} MB of about ${(est.quota / 1073741824).toFixed(1)} GB.`);
  storageInfo.textContent = parts.join(' ');
}
