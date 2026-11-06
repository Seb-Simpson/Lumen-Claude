// Lumen's shared data in Supabase: profiles, uploaded videos, comments,
// reactions, playlists and reports. Only used when config.js is filled in;
// otherwise REMOTE is false and the app keeps everything in the browser.

import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { createClient, inList } from './supabase.js';
import { store } from '../store.js';

export const REMOTE = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID_RE.test(String(v || ''));

export const sb = REMOTE
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
    storage: store,
    // Mirror sign-in state into the "session" key the UI already listens to.
    onAuthChange: (s) => { if (s?.user?.id) store.set('session', { remote: true, id: s.user.id }); else store.remove('session'); },
  })
  : null;

export const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

/* ------------------------------------------------------------------ */
/* Profiles (cached in memory; the site is small enough to load them all) */
/* ------------------------------------------------------------------ */
const profiles = new Map();

export const toUser = (p) => p && ({
  id: p.id, username: p.username, displayName: p.display_name, bio: p.bio || '',
  initial: p.initial, color: p.color, createdAt: p.created_at,
});

export async function loadProfiles() {
  const rows = await sb.select('profiles', 'select=*&order=created_at.asc&limit=1000');
  profiles.clear();
  rows.forEach((p) => profiles.set(p.id, p));
  return rows.length;
}

export async function loadProfile(id) {
  const [p] = await sb.select('profiles', `id=eq.${id}&select=*`);
  if (p) profiles.set(p.id, p);
  return p || null;
}

export const profileById = (id) => toUser(profiles.get(id));
export const profileByUsername = (u) => toUser([...profiles.values()].find((p) => p.username === String(u).toLowerCase()));
export const allProfiles = () => [...profiles.values()].map(toUser);

export async function usernameTaken(username) {
  const rows = await sb.select('profiles', `username=eq.${encodeURIComponent(username)}&select=id`);
  return rows.length > 0;
}

export async function updateMyProfile(patch) {
  const [row] = await sb.update('profiles', `id=eq.${sb.userId}`, patch);
  if (!row) throw new Error('Could not save your profile.');
  profiles.set(row.id, row);
  return toUser(row);
}

/* ------------------------------------------------------------------ */
/* The signed-in user's own reactions, for hydrating the local library */
/* ------------------------------------------------------------------ */
export async function fetchMine() {
  const uid = sb.userId;
  const [ratings, subs, likes, playlists] = await Promise.all([
    sb.select('video_ratings', `user_id=eq.${uid}&select=video_id,value`),
    sb.select('subscriptions', `user_id=eq.${uid}&select=channel_id&order=created_at.asc`),
    sb.select('comment_likes', `user_id=eq.${uid}&select=comment_id`),
    sb.select('playlists', 'select=*&order=created_at.desc'),
  ]);
  return {
    ratings: Object.fromEntries(ratings.map((r) => [r.video_id, r.value])),
    subs: subs.map((s) => s.channel_id),
    commentLikes: Object.fromEntries(likes.map((l) => [l.comment_id, true])),
    playlists: playlists.map((p) => ({
      id: p.id, name: p.name, videoIds: p.video_ids || [],
      createdAt: Date.parse(p.created_at), updatedAt: Date.parse(p.updated_at),
    })),
  };
}

/** Write-through hooks used by library.js when the user changes something. */
export const syncHooks = {
  async rate(videoId, value) {
    const filter = `video_id=eq.${encodeURIComponent(videoId)}&user_id=eq.${sb.userId}`;
    if (!value) return sb.remove('video_ratings', filter);
    // Change an existing rating, or add one if there wasn't any.
    const changed = await sb.update('video_ratings', filter, { value });
    if (!changed.length) await sb.insert('video_ratings', [{ video_id: videoId, value }], { returning: false });
    return null;
  },
  subscribe(channelId, on) {
    return on
      ? sb.insert('subscriptions', [{ channel_id: channelId }], { returning: false })
      : sb.remove('subscriptions', `channel_id=eq.${encodeURIComponent(channelId)}&user_id=eq.${sb.userId}`);
  },
  commentLike(commentId, on) {
    if (!isUuid(commentId)) return null; // built-in sample comments stay local
    return on
      ? sb.insert('comment_likes', [{ comment_id: commentId }], { returning: false })
      : sb.remove('comment_likes', `comment_id=eq.${commentId}&user_id=eq.${sb.userId}`);
  },
  playlistCreate: (p) => sb.insert('playlists', [{ id: p.id, name: p.name, video_ids: p.videoIds }], { returning: false }),
  playlistUpdate: (p) => sb.update('playlists', `id=eq.${p.id}`, { name: p.name, video_ids: p.videoIds }),
  playlistDelete: (id) => sb.remove('playlists', `id=eq.${id}`),
};

/* ------------------------------------------------------------------ */
/* Counts from other people (the UI adds the current user's own state) */
/* ------------------------------------------------------------------ */
const notMe = () => (sb.userId ? `&user_id=neq.${sb.userId}` : '');

export async function likesFromOthers(videoId) {
  const rows = await sb.select('video_ratings', `video_id=eq.${encodeURIComponent(videoId)}&value=eq.1&select=user_id${notMe()}`);
  return rows.length;
}

export async function subscribersFromOthers(channelId) {
  const rows = await sb.select('subscriptions', `channel_id=eq.${encodeURIComponent(channelId)}&select=user_id${notMe()}`);
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Videos                                                              */
/* ------------------------------------------------------------------ */
export function normalizeVideo(r, makeThumb) {
  const v = {
    id: r.id, channelId: r.owner_id, ownerId: r.owner_id, title: r.title, description: r.description || '',
    category: r.category, visibility: r.visibility, duration: r.duration || 0, views: Number(r.views) || 0,
    likes: 0, createdAt: r.created_at, size: r.size, tags: [], live: false, uploaded: true, remote: true,
    videoPath: r.video_path, thumbPath: r.thumb_path,
    src: sb.storage.publicUrl('videos', r.video_path),
  };
  v.thumb = r.thumb_path ? sb.storage.publicUrl('thumbnails', r.thumb_path) : makeThumb(v);
  return v;
}

export const listPublicVideos = () => sb.select('videos', 'visibility=eq.public&select=*&order=created_at.desc&limit=500');
export const listMyVideos = () => sb.select('videos', `owner_id=eq.${sb.userId}&select=*&order=created_at.desc`);
export async function fetchVideo(id) {
  if (!isUuid(id)) return null;
  const [row] = await sb.select('videos', `id=eq.${id}&select=*`);
  return row || null;
}

const extOf = (file, fallback) => {
  const fromName = (file.name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  return fromName || fallback;
};

/**
 * Upload a video (and optional thumbnail) to Storage, then create its row.
 * onProgress receives 0–1 across both files.
 */
export async function uploadVideo({ file, thumbFile, title, description, category, visibility, duration }, onProgress) {
  const uid = sb.userId;
  if (!uid) throw new Error('Please sign in again.');
  const id = newId();
  const videoPath = `${uid}/${id}.${extOf(file, file.type === 'video/webm' ? 'webm' : 'mp4')}`;
  const thumbPath = thumbFile ? `${uid}/${id}.${extOf(thumbFile, 'jpg')}` : null;
  const total = file.size + (thumbFile?.size || 0);
  await sb.storage.upload('videos', videoPath, file, { onProgress: (p) => onProgress?.((p * file.size) / total) });
  try {
    if (thumbFile) await sb.storage.upload('thumbnails', thumbPath, thumbFile, { onProgress: (p) => onProgress?.((file.size + p * thumbFile.size) / total) });
    await sb.insert('videos', [{
      id, title, description, category, visibility, video_path: videoPath, thumb_path: thumbPath,
      duration: Math.round((duration || 0) * 10) / 10, size: file.size,
    }], { returning: false });
  } catch (err) {
    // Don't leave orphaned files behind if the second step failed.
    await sb.storage.remove('videos', [videoPath]).catch(() => {});
    if (thumbPath) await sb.storage.remove('thumbnails', [thumbPath]).catch(() => {});
    throw err;
  }
  return id;
}

export async function updateVideo(id, patch) {
  const rows = await sb.update('videos', `id=eq.${id}`, patch);
  if (!rows.length) throw new Error('You can only edit your own videos.');
  return rows[0];
}

export async function deleteVideo(id) {
  const rows = await sb.remove('videos', `id=eq.${id}`);
  if (!rows.length) throw new Error('You can only delete your own videos.');
  const r = rows[0];
  await sb.storage.remove('videos', [r.video_path]).catch(() => {});
  if (r.thumb_path) await sb.storage.remove('thumbnails', [r.thumb_path]).catch(() => {});
}

export const incrementView = (id) => (isUuid(id) ? sb.rpc('increment_view', { vid: id }).catch(() => {}) : null);

/* ------------------------------------------------------------------ */
/* Comments and reports                                                */
/* ------------------------------------------------------------------ */
const toComment = (c, likeCounts) => {
  const a = c.author || profiles.get(c.author_id) || {};
  return {
    id: c.id, parentId: c.parent_id, userId: c.author_id,
    author: a.display_name || 'Deleted user', initial: a.initial || '?', color: a.color || '#475569',
    text: c.body, createdAt: c.created_at, likes: likeCounts[c.id] || 0, replies: [],
  };
};

/** Comments for a video, newest first, with replies nested one level. */
export async function fetchComments(videoId) {
  const rows = await sb.select('comments',
    `video_id=eq.${encodeURIComponent(videoId)}&select=id,parent_id,body,created_at,author_id,author:profiles!comments_author_id_fkey(display_name,initial,color)&order=created_at.desc&limit=500`);
  const likeCounts = {};
  if (rows.length) {
    const likes = await sb.select('comment_likes', `comment_id=${inList(rows.map((r) => r.id))}&select=comment_id${notMe()}`);
    likes.forEach((l) => { likeCounts[l.comment_id] = (likeCounts[l.comment_id] || 0) + 1; });
  }
  const all = rows.map((r) => toComment(r, likeCounts));
  const byId = new Map(all.map((c) => [c.id, c]));
  const top = [];
  for (const c of all) {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId).replies.unshift(c); // replies oldest first
    else if (!c.parentId) top.push(c);
  }
  return top;
}

export async function addComment(videoId, text, parentId = null) {
  const [row] = await sb.insert('comments', [{ video_id: videoId, body: text, parent_id: parentId }]);
  return toComment(row, {});
}

export async function deleteComment(id) {
  const rows = await sb.remove('comments', `id=eq.${id}`);
  if (!rows.length) throw new Error('You can only delete your own comments.');
}

export async function reportVideo(videoId, reason) {
  try {
    await sb.insert('reports', [{ video_id: videoId, reason }], { returning: false });
  } catch (err) {
    if (err.code === '23505') return; // already reported by this user: treat as success
    throw err;
  }
}
