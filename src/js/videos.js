// Catalog: merges seed videos with uploads from IndexedDB into one shape.

import { SEED_VIDEOS, CHANNELS } from './data/seed.js';
import { thumbnailURI, bannerURI } from './data/thumbs.js';
import { getAllUploads, getUpload, putUpload, deleteUpload } from './db.js';
import { auth } from './auth.js';
import { localViews } from './library.js';
import * as remote from './backend/remote.js';

const { REMOTE } = remote;
let remoteWarned = false;
/** Run a server call; on failure log it and fall back so browsing still works. */
async function fromServer(fn, fallback) {
  try { return await fn(); } catch (err) {
    console.warn('Server unavailable', err);
    if (!remoteWarned) { remoteWarned = true; document.dispatchEvent(new CustomEvent('lumen:offline', { detail: err })); }
    return fallback;
  }
}
const normalizeRemote = (r) => remote.normalizeVideo(r, generatedThumb);

const objectUrls = new Map(); // `${id}:video|thumb` -> blob URL
const thumbCache = new Map();

function blobUrl(id, kind, blob) {
  const k = `${id}:${kind}`;
  if (!objectUrls.has(k) && blob) objectUrls.set(k, URL.createObjectURL(blob));
  return objectUrls.get(k) || '';
}

function revoke(id) {
  for (const kind of ['video', 'thumb']) {
    const k = `${id}:${kind}`;
    if (objectUrls.has(k)) { URL.revokeObjectURL(objectUrls.get(k)); objectUrls.delete(k); }
  }
  thumbCache.delete(id);
}

function generatedThumb(v) {
  const key = `${v.id}|${v.title}|${v.category}`;
  if (!thumbCache.has(v.id) || thumbCache.get(v.id).key !== key) thumbCache.set(v.id, { key, uri: thumbnailURI(v) });
  return thumbCache.get(v.id).uri;
}

function normalizeSeed(v) {
  return { ...v, uploaded: false, views: v.views + localViews(v.id), thumb: generatedThumb(v) };
}

function normalizeUpload(r) {
  return {
    id: r.id,
    channelId: r.channelId,
    ownerId: r.ownerId,
    category: r.category,
    title: r.title,
    description: r.description,
    tags: [],
    live: false,
    duration: r.duration || 0,
    views: localViews(r.id),
    likes: 0,
    createdAt: r.createdAt,
    visibility: r.visibility,
    uploaded: true,
    size: r.size,
    get src() { return blobUrl(r.id, 'video', r.videoBlob); },
    thumb: r.thumbBlob ? blobUrl(r.id, 'thumb', r.thumbBlob) : generatedThumb(r),
  };
}

async function uploads() {
  try { return (await getAllUploads()).map(normalizeUpload); } catch (err) { console.warn('Uploads unavailable', err); return []; }
}

/** Public videos for browsing (excludes private/unlisted uploads). */
export async function getPublicVideos() {
  const ups = REMOTE
    ? (await fromServer(remote.listPublicVideos, [])).map(normalizeRemote)
    : (await uploads()).filter((v) => v.visibility === 'public');
  return [...ups, ...SEED_VIDEOS.map(normalizeSeed)];
}

/** Single video by id. Private uploads are only visible to their owner. */
export async function getVideo(id) {
  const seed = SEED_VIDEOS.find((v) => v.id === id);
  if (seed) return normalizeSeed(seed);
  if (REMOTE) {
    const row = await fromServer(() => remote.fetchVideo(id), null);
    return row ? normalizeRemote(row) : null;
  }
  const rec = await getUpload(id).catch(() => null);
  if (!rec) return null;
  if (rec.visibility === 'private' && rec.ownerId !== auth.currentUserId()) return null;
  return normalizeUpload(rec);
}

export async function getMyUploads() {
  if (REMOTE) return auth.currentUser() ? (await remote.listMyVideos()).map(normalizeRemote) : [];
  const me = auth.currentUserId();
  return (await uploads()).filter((v) => v.ownerId === me).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function saveUpload(record) { await putUpload(record); revoke(record.id); }

export async function updateUpload(id, patch) {
  if (REMOTE) {
    await remote.updateVideo(id, patch);
    thumbCache.delete(id);
    return;
  }
  const rec = await getUpload(id);
  if (!rec || rec.ownerId !== auth.currentUserId()) throw new Error('You can only edit your own videos.');
  await putUpload({ ...rec, ...patch });
  thumbCache.delete(id);
}

export async function removeUpload(id) {
  if (REMOTE) return remote.deleteVideo(id);
  const rec = await getUpload(id);
  if (!rec || rec.ownerId !== auth.currentUserId()) throw new Error('You can only delete your own videos.');
  await deleteUpload(id);
  revoke(id);
}

/** Seed channels plus a channel per registered user. */
export function getChannel(id) {
  const seed = CHANNELS.find((c) => c.id === id);
  if (seed) return { ...seed, banner: bannerURI(seed), initial: seed.name[0] };
  if (id && id.startsWith('u-')) {
    const u = auth.getUser(id.slice(2));
    if (!u) return null;
    return userChannel(id, u);
  }
  if (REMOTE && remote.isUuid(id)) {
    const u = remote.profileById(id);
    return u ? userChannel(id, u) : null;
  }
  return null;
}

const userChannel = (id, u) => ({
  id, name: u.displayName, handle: `@${u.username}`, color: u.color, initial: u.initial,
  subscribers: 0, joined: u.createdAt, about: u.bio || 'This creator hasn\'t written a bio yet.',
  banner: bannerURI({ id, color: u.color }), isUser: true,
});

export function allChannels() {
  return [...CHANNELS.map((c) => getChannel(c.id)), ...auth.allUsers().map((u) => getChannel(u.id))];
}

export const channelName = (id) => getChannel(id)?.name || 'Unknown channel';
