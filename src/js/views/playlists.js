// Playlists overview (#/playlists) and a single playlist (#/playlist/:id).

import { h, mount, timeAgo } from '../utils.js';
import { library, MAX_PLAYLIST_NAME } from '../library.js';
import { getVideo } from '../videos.js';
import { videoCard } from '../components/videoCard.js';
import { emptyState, pageTitle, skeletonList, toast, confirmDialog, openModal } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { navigate } from '../router.js';

export const playlistHref = (plId, videoId) => `#/watch/${encodeURIComponent(videoId)}?list=${encodeURIComponent(plId)}`;

/** Ask for a playlist name. Resolves the trimmed name, or null if cancelled. */
function promptName({ title, initial = '', confirmLabel }) {
  return new Promise((resolve) => {
    let result = null;
    const input = h('input', { type: 'text', id: 'pl-name', maxlength: MAX_PLAYLIST_NAME, value: initial, autocomplete: 'off', required: true });
    const form = h('form', { id: 'pl-name-form', onSubmit: (e) => { e.preventDefault(); result = input.value; m.close(); } },
      h('div', { class: 'field' }, h('label', { for: 'pl-name' }, 'Name'), input));
    const m = openModal({
      title, body: form, onClose: () => resolve(result),
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => m.close() }, 'Cancel'),
        h('button', { class: 'btn btn-primary', type: 'submit', form: 'pl-name-form' }, confirmLabel),
      ],
    });
    input.focus();
    input.select();
  });
}

export async function createPlaylistFlow() {
  const name = await promptName({ title: 'New playlist', confirmLabel: 'Create' });
  if (name == null) return null;
  try {
    const pl = library.createPlaylist(name);
    toast(`Created “${pl.name}”`, { type: 'success' });
    return pl;
  } catch (err) { toast(err.message, { type: 'error' }); return null; }
}

/** Resolve video ids to videos, skipping any that were deleted. */
async function resolve(ids) {
  return (await Promise.all(ids.map((id) => getVideo(id)))).filter(Boolean);
}

export function playlistTile(pl, firstVideo) {
  const href = firstVideo ? playlistHref(pl.id, firstVideo.id) : `#/playlist/${encodeURIComponent(pl.id)}`;
  const thumb = firstVideo
    ? h('img', { src: firstVideo.thumb, alt: '', loading: 'lazy', width: 320, height: 180 })
    : h('div', { class: 'pl-thumb-empty' }, icon('playlist', { size: 40 }));
  return h('article', { class: 'card pl-tile' },
    h('a', { class: 'thumb', href, tabindex: '-1', aria: { hidden: 'true' } }, thumb,
      h('span', { class: 'pl-count' }, icon('playlist', { size: 18 }), `${pl.videoIds.length} video${pl.videoIds.length === 1 ? '' : 's'}`)),
    h('div', { class: 'card-body' }, h('div', { class: 'card-info' },
      h('h3', {}, h('a', { class: 'card-title', href: `#/playlist/${encodeURIComponent(pl.id)}` }, pl.name)),
      h('p', { class: 'card-meta' }, `Updated ${timeAgo(pl.updatedAt)}`),
      h('a', { class: 'card-channel', href: `#/playlist/${encodeURIComponent(pl.id)}` }, 'View full playlist'))));
}

export async function renderPlaylists(ctx) {
  ctx.setMeta('Playlists', 'Your playlists on Lumen.');
  const body = h('div', {}, skeletonList(2));
  const newBtn = h('button', { class: 'btn btn-primary', type: 'button', onClick: async () => { if (await createPlaylistFlow()) draw(); } },
    icon('playlistAdd', { size: 20 }), h('span', {}, 'New playlist'));
  mount(ctx.outlet, h('div', { class: 'page' }, pageTitle('Playlists', newBtn), body));

  const draw = async () => {
    const pls = library.playlists();
    const firsts = await resolve(pls.map((p) => p.videoIds[0]).filter(Boolean));
    if (!ctx.isActive()) return;
    const byId = new Map(firsts.map((v) => [v.id, v]));
    mount(body, pls.length
      ? h('div', { class: 'video-grid' }, pls.map((p) => playlistTile(p, byId.get(p.videoIds[0]))))
      : emptyState({ iconName: 'playlist', title: 'No playlists yet', text: 'Create a playlist here, or use the Playlist button under any video.' }));
  };
  await draw();
}

export async function renderPlaylist(ctx) {
  const pl = library.getPlaylist(ctx.params.id);
  if (!pl) {
    ctx.setMeta('Playlist not found', 'This playlist does not exist.');
    mount(ctx.outlet, h('div', { class: 'page' }, emptyState({
      iconName: 'playlist', level: 1, title: 'Playlist not found',
      text: 'It may have been deleted, or it belongs to another account on this browser.',
      action: h('a', { class: 'btn btn-primary', href: '#/playlists' }, 'Your playlists'),
    })));
    return;
  }
  ctx.setMeta(pl.name, `Playlist with ${pl.videoIds.length} videos.`);

  const heading = h('h1', { tabindex: '-1' }, pl.name);
  const meta = h('p', { class: 'muted' });
  const playAll = h('a', { class: 'btn btn-primary' }, icon('play', { size: 20 }), h('span', {}, 'Play all'));
  const list = h('div', { class: 'video-list' }, skeletonList(3));

  const rename = h('button', { class: 'btn btn-secondary', type: 'button', onClick: async () => {
    const name = await promptName({ title: 'Rename playlist', initial: library.getPlaylist(pl.id)?.name, confirmLabel: 'Save' });
    if (name == null) return;
    try {
      const updated = library.renamePlaylist(pl.id, name);
      heading.textContent = updated.name;
      ctx.setMeta(updated.name);
      toast('Playlist renamed');
    } catch (err) { toast(err.message, { type: 'error' }); }
  } }, icon('edit', { size: 20 }), h('span', {}, 'Rename'));

  const del = h('button', { class: 'btn btn-secondary', type: 'button', onClick: async () => {
    const current = library.getPlaylist(pl.id);
    if (!(await confirmDialog({ title: 'Delete playlist?', message: `“${current.name}” will be deleted. The videos themselves are not affected.`, confirmLabel: 'Delete', danger: true }))) return;
    library.deletePlaylist(pl.id);
    toast('Playlist deleted');
    navigate('/playlists');
  } }, icon('trash', { size: 20 }), h('span', {}, 'Delete'));

  mount(ctx.outlet, h('div', { class: 'page narrow-wide' },
    h('div', { class: 'pl-header' }, h('div', {}, heading, meta), h('div', { class: 'pl-actions' }, playAll, rename, del)),
    list));

  const draw = async (focusSelector) => {
    const current = library.getPlaylist(pl.id);
    const vids = await resolve(current.videoIds);
    if (!ctx.isActive()) return;
    meta.textContent = `${vids.length} video${vids.length === 1 ? '' : 's'} • Updated ${timeAgo(current.updatedAt)} • Private to you`;
    playAll.hidden = !vids.length;
    if (vids.length) playAll.href = playlistHref(pl.id, vids[0].id);
    if (!vids.length) {
      mount(list, emptyState({ iconName: 'playlist', title: 'This playlist is empty', text: 'Open any video and use the Playlist button to add it here.', action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Browse videos') }));
      return;
    }
    const move = (id, delta, i) => {
      library.moveInPlaylist(pl.id, id, delta);
      draw(`[data-move="${i + delta}:${delta < 0 ? 'up' : 'down'}"]`);
    };
    mount(list, vids.map((v, i) => {
      const card = videoCard(v, { layout: 'row', extra: h('div', { class: 'row-extra' },
        h('button', { class: 'icon-btn small', type: 'button', disabled: i === 0, dataset: { move: `${i}:up` }, aria: { label: `Move ${v.title} up` }, onClick: () => move(v.id, -1, i) }, icon('arrowUp')),
        h('button', { class: 'icon-btn small', type: 'button', disabled: i === vids.length - 1, dataset: { move: `${i}:down` }, aria: { label: `Move ${v.title} down` }, onClick: () => move(v.id, 1, i) }, icon('arrowDown')),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', aria: { label: `Remove ${v.title} from playlist` }, onClick: () => {
          library.removeFromPlaylist(pl.id, v.id);
          toast('Removed from playlist');
          draw('.pl-header h1');
        } }, 'Remove')) });
      // Links inside the playlist page keep the playlist context.
      card.querySelectorAll(`a[href="#/watch/${encodeURIComponent(v.id)}"]`).forEach((a) => { a.href = playlistHref(pl.id, v.id); });
      return h('div', { class: 'pl-row' }, h('span', { class: 'pl-index', aria: { hidden: 'true' } }, String(i + 1)), card);
    }));
    if (focusSelector) {
      const target = ctx.outlet.querySelector(focusSelector);
      (target && !target.disabled ? target : heading).focus();
    }
  };
  await draw();
}
