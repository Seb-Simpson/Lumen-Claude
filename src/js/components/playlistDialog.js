// "Save to playlist" dialog: tick playlists to add/remove a video, or create a new one.

import { h } from '../utils.js';
import { library, MAX_PLAYLIST_NAME } from '../library.js';
import { openModal, toast } from './ui.js';

export function openSaveToPlaylist(videoId, { onChange } = {}) {
  const list = h('ul', { class: 'pl-choices' });
  const empty = h('p', { class: 'muted' }, 'You have no playlists yet. Create one below.');

  const draw = () => {
    const pls = library.playlists();
    const inIds = new Set(library.playlistsWith(videoId));
    empty.hidden = pls.length > 0;
    list.replaceChildren(...pls.map((p) => {
      const id = `pl-choice-${p.id}`;
      const box = h('input', { type: 'checkbox', id, checked: inIds.has(p.id) });
      box.addEventListener('change', () => {
        try {
          const now = library.togglePlaylistVideo(p.id, videoId);
          toast(now ? `Added to “${p.name}”` : `Removed from “${p.name}”`);
          onChange?.();
        } catch (err) { toast(err.message, { type: 'error' }); box.checked = !box.checked; }
      });
      return h('li', {}, h('label', { for: id, class: 'pl-choice' }, box, h('span', {}, p.name), h('span', { class: 'muted small' }, `${p.videoIds.length}`)));
    }));
  };

  const nameInput = h('input', { type: 'text', id: 'pl-new-name', maxlength: MAX_PLAYLIST_NAME, placeholder: 'Playlist name', autocomplete: 'off' });
  const err = h('p', { class: 'field-error', role: 'alert' });
  const form = h('form', { class: 'pl-new', onSubmit: (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      const pl = library.createPlaylist(nameInput.value, videoId);
      nameInput.value = '';
      toast(`Saved to new playlist “${pl.name}”`, { type: 'success' });
      draw();
      onChange?.();
    } catch (error) { err.textContent = error.message; nameInput.focus(); }
  } },
  h('label', { for: 'pl-new-name' }, 'New playlist'),
  h('div', { class: 'pl-new-row' }, nameInput, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Create')),
  err);

  draw();
  const m = openModal({ title: 'Save to playlist', body: [empty, list, form], className: 'pl-modal' });
  (list.querySelector('input') || nameInput).focus();
  return m;
}
