// Per-user data: history, likes, watch later, subscriptions, playback
// positions and local view counts. Guests get their own "guest" bucket.

import { store } from './store.js';
import { auth } from './auth.js';

const key = (name) => `data:${auth.currentUserId()}:${name}`;
const MAX_HISTORY = 200;

export const library = {
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
    return library.rating(videoId);
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
    return !liked;
  },
};

// Views are shared across users in this browser.
export const localViews = (videoId) => store.get('views', {})[videoId] || 0;
export function addView(videoId) {
  store.update('views', (v) => ({ ...v, [videoId]: (v[videoId] || 0) + 1 }), {});
}
