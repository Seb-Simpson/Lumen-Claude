// Library hub plus History, Liked, Watch later and Subscriptions feed.

import { h, mount, timeAgo } from '../utils.js';
import { library } from '../library.js';
import { getPublicVideos, getVideo, getChannel } from '../videos.js';
import { videoCard } from '../components/videoCard.js';
import { emptyState, pageTitle, skeletonList, toast, confirmDialog, avatar } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { playlistTile } from './playlists.js';

async function resolveIds(ids) {
  const out = await Promise.all(ids.map((id) => getVideo(id)));
  return out.filter(Boolean);
}

function listPage(ctx, { title, desc, iconName, emptyTitle, emptyText, load, actions, rowExtra }) {
  ctx.setMeta(title, desc);
  const body = h('div', {}, skeletonList(4));
  mount(ctx.outlet, h('div', { class: 'page narrow-wide' }, pageTitle(title, actions ? actions() : null), body));
  const draw = async () => {
    const vids = await load();
    if (!ctx.isActive()) return;
    mount(body, vids.length
      ? h('div', { class: 'video-list' }, vids.map((v) => videoCard(v, { layout: 'row', extra: rowExtra?.(v, draw) })))
      : emptyState({ iconName, title: emptyTitle, text: emptyText, action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Browse videos') }));
  };
  return draw();
}

export function renderHistory(ctx) {
  return listPage(ctx, {
    title: 'Watch history', desc: 'Videos you have watched on Lumen.', iconName: 'history',
    emptyTitle: 'No watch history yet', emptyText: 'Videos you watch will show up here.',
    load: async () => {
      const h0 = library.history();
      const vids = await resolveIds(h0.map((x) => x.id));
      const at = Object.fromEntries(h0.map((x) => [x.id, x.at]));
      return vids.map((v) => ({ ...v, _watchedAt: at[v.id] }));
    },
    actions: () => h('button', { class: 'btn btn-secondary', type: 'button', onClick: async () => {
      if (!(await confirmDialog({ title: 'Clear watch history?', message: 'This removes all videos from your history and resets saved playback positions.', confirmLabel: 'Clear history', danger: true }))) return;
      library.clearHistory();
      toast('Watch history cleared');
      renderHistory(ctx);
    } }, icon('trash', { size: 20 }), h('span', {}, 'Clear all')),
    rowExtra: (v, redraw) => h('div', { class: 'row-extra' },
      h('span', { class: 'muted small' }, `Watched ${timeAgo(v._watchedAt)}`),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', aria: { label: `Remove ${v.title} from history` }, onClick: () => { library.removeFromHistory(v.id); redraw(); } }, 'Remove')),
  });
}

export function renderLiked(ctx) {
  return listPage(ctx, {
    title: 'Liked videos', desc: 'Videos you liked.', iconName: 'like',
    emptyTitle: 'No liked videos', emptyText: 'Tap the thumbs-up on a video to save it here.',
    load: () => resolveIds(library.likedIds().reverse()),
  });
}

export function renderWatchLater(ctx) {
  return listPage(ctx, {
    title: 'Watch later', desc: 'Videos saved for later.', iconName: 'clock',
    emptyTitle: 'Nothing saved yet', emptyText: 'Use the Save button on any video to watch it later.',
    load: () => resolveIds(library.watchLater()),
    rowExtra: (v, redraw) => h('div', { class: 'row-extra' },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', aria: { label: `Remove ${v.title} from Watch later` }, onClick: () => { library.toggleWatchLater(v.id); redraw(); } }, 'Remove')),
  });
}

export async function renderSubscriptions(ctx) {
  ctx.setMeta('Subscriptions', 'Latest videos from channels you follow.');
  const subs = library.subscriptions().map(getChannel).filter(Boolean);
  const body = h('div', {}, skeletonList(3));
  mount(ctx.outlet, h('div', { class: 'page' }, pageTitle('Subscriptions'),
    subs.length ? h('ul', { class: 'sub-strip', aria: { label: 'Your subscriptions' } }, subs.map((c) => h('li', {},
      h('a', { href: `#/channel/${encodeURIComponent(c.id)}`, class: 'sub-chip' }, avatar({ initial: c.initial, color: c.color, size: 56 }), h('span', {}, c.name))))) : null,
    body));
  if (!subs.length) {
    mount(body, emptyState({ iconName: 'subs', title: 'Don\'t miss new videos', text: 'Subscribe to channels and their latest uploads will appear here.', action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Find channels') }));
    return;
  }
  const ids = new Set(subs.map((c) => c.id));
  const vids = (await getPublicVideos()).filter((v) => ids.has(v.channelId)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!ctx.isActive()) return;
  mount(body, vids.length ? h('div', { class: 'video-grid' }, vids.map((v) => videoCard(v))) : emptyState({ title: 'No videos yet', text: 'Your subscriptions haven\'t posted anything yet.' }));
}

export async function renderLibrary(ctx) {
  ctx.setMeta('Library', 'Your history, playlists, liked videos and watch later list.');
  const shelf = (title, href, iconName, vids, emptyText) => h('section', { class: 'shelf' },
    h('div', { class: 'shelf-head' }, h('h2', {}, icon(iconName), ' ', title), h('a', { class: 'btn btn-ghost btn-sm', href }, 'See all')),
    vids.length ? h('div', { class: 'video-grid' }, vids.slice(0, 4).map((v) => videoCard(v))) : h('p', { class: 'muted' }, emptyText));
  const body = h('div', {}, skeletonList(3));
  mount(ctx.outlet, h('div', { class: 'page' }, pageTitle('Library'), body));
  const pls = library.playlists().slice(0, 4);
  const [hist, liked, later, plFirsts] = await Promise.all([
    resolveIds(library.history().slice(0, 4).map((x) => x.id)),
    resolveIds(library.likedIds().reverse().slice(0, 4)),
    resolveIds(library.watchLater().slice(0, 4)),
    resolveIds(pls.map((p) => p.videoIds[0]).filter(Boolean)),
  ]);
  const firstById = new Map(plFirsts.map((v) => [v.id, v]));
  if (!ctx.isActive()) return;
  mount(body,
    shelf('History', '#/history', 'history', hist, 'Videos you watch will appear here.'),
    shelf('Watch later', '#/watch-later', 'clock', later, 'Save videos to watch them later.'),
    h('section', { class: 'shelf' },
      h('div', { class: 'shelf-head' }, h('h2', {}, icon('playlist'), ' ', 'Playlists'), h('a', { class: 'btn btn-ghost btn-sm', href: '#/playlists' }, 'See all')),
      pls.length ? h('div', { class: 'video-grid' }, pls.map((p) => playlistTile(p, firstById.get(p.videoIds[0]))))
        : h('p', { class: 'muted' }, 'Use the Playlist button under any video to start a playlist.')),
    shelf('Liked videos', '#/liked', 'like', liked, 'Videos you like will appear here.'));
}
