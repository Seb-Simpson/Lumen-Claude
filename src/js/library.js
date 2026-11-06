// Per-user data: history, likes, watch later, subscriptions, playback
// positions and local view counts. Guests get their own "guest" bucket.

import { store } from './store.js';
import { auth } from './auth.js';
import { uid } from './utils.js';
import * as remote from './backend/remote.js';

const MAX_HISTORY = 200;
export const MAX_PLAYLISTS = 100;
export const MAX_PLAYLIST_NAME = 60;

/** Clean up and check a playlist name. Returns { name } or { error }. */
export function validatePlaylistName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return { error: 'Give your playlist a name.' };
  if (name.length > MAX_PLAYLIST_NAME) return { error: `Keep the name under ${MAX_PLAYLIST_NAME} characters.` };
  return { name };
}

/**
 * Per-user library on top of a store. `userId` is a function so the bucket
 * follows whoever is signed in. Tests pass an in-memory store.
 *
 * `hooks` (optional) mirrors changes to a server. Each hook may return a
 * promise; failures go to hooks.onError so the UI can resync. Hooks are only
 * called for signed-in users, never for guests.
 */
export function createLibrary(store, userId, hooks = null) {
  const key = (name) => `data:${userId()}:${name}`;
  const sync = (name, ...args) => {
    if (!hooks?.[name] || userId() === 'guest') return;
    try {
      Promise.resolve(hooks[name](...args)).catch((err) => hooks.onError?.(err, name));
    } catch (err) { hooks.onError?.(err, name); }
  };
  const newPlaylistId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : uid('pl-'));

  const library = {
    // History: newest first, unique by video id.
    history: () => store.get(key('history'), []),
    addToHistory(videoId) {
      if (store.get(key('historyPaused'), false)) return;
      store.update(key('history'), (h) => [{ id: videoId, at: Date.now() }, ...h.filter((x) => x.id !== videoId)].slice(0, MAX_HISTORY), []);
    },
    removeFromHistory(videoId) { store.update(key('history'), (h) => h.filter((x) => x.id !== videoId), []); },
    clearHistory() { store.set(key('history'), []); store.remove(key('positions')); },

    // Ratings: { [videoId]: 1 | -1 }
    rating: (videoId) => store.get(key('ratings'), {})[videoId] || 0,
    rate(videoId, value) {
      store.update(key('ratings'), (r) => {
        const next = { ...r };
        if (next[videoId] === value) delete next[videoId]; else next[videoId] = value;
        return next;
      }, {});
      const now = library.rating(videoId);
      sync('rate', videoId, now);
      return now;
    },
    likedIds: () => Object.entries(store.get(key('ratings'), {})).filter(([, v]) => v === 1).map(([id]) => id),

    // Watch later: ordered ids
    watchLater: () => store.get(key('watchLater'), []),
    inWatchLater: (id) => library.watchLater().includes(id),
    toggleWatchLater(id) {
      const has = library.inWatchLater(id);
      store.update(key('watchLater'), (l) => (has ? l.filter((x) => x !== id) : [id, ...l]), []);
      return !has;
    },

    // Subscriptions: channel ids
    subscriptions: () => store.get(key('subs'), []),
    isSubscribed: (channelId) => library.subscriptions().includes(channelId),
    toggleSubscribe(channelId) {
      const has = library.isSubscribed(channelId);
      store.update(key('subs'), (l) => (has ? l.filter((x) => x !== channelId) : [...l, channelId]), []);
      sync('subscribe', channelId, !has);
      return !has;
    },

    // Playback positions (seconds)
    position: (videoId) => store.get(key('positions'), {})[videoId] || 0,
    savePosition(videoId, seconds) {
      store.update(key('positions'), (p) => ({ ...p, [videoId]: Math.floor(seconds) }), {});
    },

    // Comment likes: { [commentId]: true }
    commentLiked: (id) => !!store.get(key('commentLikes'), {})[id],
    toggleCommentLike(id) {
      const liked = library.commentLiked(id);
      store.update(key('commentLikes'), (m) => { const n = { ...m }; if (liked) delete n[id]; else n[id] = true; return n; }, {});
      sync('commentLike', id, !liked);
      return !liked;
    },

    // Playlists: [{ id, name, videoIds, createdAt, updatedAt }], newest first
    playlists: () => store.get(key('playlists'), []),
    getPlaylist: (id) => library.playlists().find((p) => p.id === id) || null,
    playlistsWith: (videoId) => library.playlists().filter((p) => p.videoIds.includes(videoId)).map((p) => p.id),
    createPlaylist(rawName, firstVideoId) {
      const { name, error } = validatePlaylistName(rawName);
      if (error) throw new Error(error);
      if (library.playlists().length >= MAX_PLAYLISTS) throw new Error(`You can have up to ${MAX_PLAYLISTS} playlists.`);
      const now = Date.now();
      const pl = { id: newPlaylistId(), name, videoIds: firstVideoId ? [firstVideoId] : [], createdAt: now, updatedAt: now };
      if (!store.update(key('playlists'), (l) => [pl, ...l], [])) throw new Error('Could not save the playlist (storage is full or blocked).');
      sync('playlistCreate', pl);
      return pl;
    },
    /** Apply fn to one playlist's fields. Throws if it doesn't exist. */
    _edit(id, fn) {
      if (!library.getPlaylist(id)) throw new Error('That playlist no longer exists.');
      if (!store.update(key('playlists'), (l) => l.map((p) => (p.id === id ? { ...p, ...fn(p), updatedAt: Date.now() } : p)), [])) {
        throw new Error('Could not save the playlist (storage is full or blocked).');
      }
      const updated = library.getPlaylist(id);
      sync('playlistUpdate', updated);
      return updated;
    },
    renamePlaylist(id, rawName) {
      const { name, error } = validatePlaylistName(rawName);
      if (error) throw new Error(error);
      return library._edit(id, () => ({ name }));
    },
    deletePlaylist(id) {
      store.update(key('playlists'), (l) => l.filter((p) => p.id !== id), []);
      sync('playlistDelete', id);
    },
    /** Add or remove a video. Returns true if the video is now in the playlist. */
    togglePlaylistVideo(id, videoId) {
      const has = library.getPlaylist(id)?.videoIds.includes(videoId);
      library._edit(id, (p) => ({ videoIds: has ? p.videoIds.filter((v) => v !== videoId) : [...p.videoIds, videoId] }));
      return !has;
    },
    removeFromPlaylist(id, videoId) { return library._edit(id, (p) => ({ videoIds: p.videoIds.filter((v) => v !== videoId) })); },
    /** Move a video up (-1) or down (+1). No-op at the ends. */
    moveInPlaylist(id, videoId, delta) {
      return library._edit(id, (p) => {
        const ids = [...p.videoIds];
        const i = ids.indexOf(videoId);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= ids.length) return {};
        [ids[i], ids[j]] = [ids[j], ids[i]];
        return { videoIds: ids };
      });
    },
    /** The video after videoId in the playlist, or null at the end. */
    nextInPlaylist(id, videoId) {
      const ids = library.getPlaylist(id)?.videoIds || [];
      const i = ids.indexOf(videoId);
      return i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;
    },

    /** Replace server-backed data with a fresh copy (after sign-in or a sync error). */
    hydrate({ ratings, subs, commentLikes, playlists }) {
      if (ratings) store.set(key('ratings'), ratings);
      if (subs) store.set(key('subs'), subs);
      if (commentLikes) store.set(key('commentLikes'), commentLikes);
      if (playlists) store.set(key('playlists'), playlists);
    },
  };
  return library;
}

export const library = createLibrary(store, () => auth.currentUserId(), remote.REMOTE ? {
  ...remote.syncHooks,
  onError: (err) => {
    console.error(err);
    document.dispatchEvent(new CustomEvent('lumen:sync-error', { detail: err }));
  },
} : null);

// Views are shared across users in this browser.
export const localViews = (videoId) => store.get('views', {})[videoId] || 0;
export function addView(videoId) {
  store.update('views', (v) => ({ ...v, [videoId]: (v[videoId] || 0) + 1 }), {});
}
