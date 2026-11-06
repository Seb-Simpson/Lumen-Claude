// Upload flow: drag-and-drop or pick a file, validate, read it with progress,
// and store it in IndexedDB.

import { h, mount, formatCount, uid } from '../utils.js';
import { auth } from '../auth.js';
import { saveUpload } from '../videos.js';
import { db, ready } from '../db.js';
import { CATEGORIES } from '../data/seed.js';
import { toast, emptyState, pageTitle } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { navigate } from '../router.js';
import * as remote from '../backend/remote.js';
import { REMOTE_MAX_UPLOAD } from '../config.js';

export const MAX_BYTES = 500 * 1024 * 1024;
/** Upload limit for the current mode: 50 MB with Supabase's free plan, 500 MB in the browser. */
export const maxUploadBytes = () => (remote.REMOTE ? REMOTE_MAX_UPLOAD : MAX_BYTES);
const formatLimit = (bytes) => `${Math.round(bytes / 1048576)} MB`;
export const VIDEO_TYPES = ['video/mp4', 'video/webm'];
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_THUMB = 5 * 1024 * 1024;

/** Validate a video file. Returns an error message or ''. Exported for tests. */
export function validateVideoFile(file, maxBytes = MAX_BYTES) {
  if (!file) return 'Choose a video file.';
  const ext = (file.name || '').toLowerCase().split('.').pop();
  const typeOk = VIDEO_TYPES.includes(file.type) || (!file.type && ['mp4', 'webm'].includes(ext));
  if (!typeOk) return 'Only MP4 and WebM videos are supported.';
  if (file.size > maxBytes) return `That file is larger than ${formatLimit(maxBytes)}.`;
  if (file.size === 0) return 'That file is empty.';
  return '';
}

const formatBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${formatCount(Math.round(b / 1024))} KB`);

/** Read a file into an ArrayBuffer, reporting progress (0–1). */
function readWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Could not read the file.'));
    r.readAsArrayBuffer(file);
  });
}

/** Get duration from metadata (resolves 0 if the browser can't decode it). */
function probeDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (d) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : 0); };
    v.preload = 'metadata';
    v.onloadedmetadata = () => done(v.duration);
    v.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    v.src = url;
  });
}

export async function render(ctx) {
  ctx.setMeta('Upload video', 'Upload a video to Lumen.');
  const me = auth.currentUser();
  if (!me) {
    mount(ctx.outlet, h('div', { class: 'page' }, emptyState({
      iconName: 'upload', title: 'Sign in to upload', level: 1, text: 'Create a free demo account to upload videos and manage them in Studio.',
      action: h('a', { class: 'btn btn-primary', href: '#/login?next=/upload' }, 'Sign in'),
    })));
    return;
  }

  let videoFile = null;
  let thumbFile = null;
  const fileInput = h('input', { type: 'file', accept: 'video/mp4,video/webm', class: 'visually-hidden', id: 'video-file' });
  const fileInfo = h('p', { class: 'file-info', aria: { live: 'polite' } });
  const fileError = h('p', { class: 'field-error', id: 'file-error', role: 'alert' });
  const drop = h('div', { class: 'dropzone' },
    icon('upload', { size: 48 }),
    h('p', { class: 'drop-title' }, 'Drag and drop a video file here'),
    h('p', { class: 'muted' }, `MP4 or WebM, up to ${formatLimit(maxUploadBytes())}`),
    h('label', { class: 'btn btn-primary', for: 'video-file' }, 'Select file'),
    fileInput, fileInfo);

  const title = h('input', { id: 'up-title', type: 'text', required: true, maxlength: 100, aria: { describedby: 'title-count' } });
  const titleCount = h('span', { id: 'title-count', class: 'muted small' }, '0/100');
  const description = h('textarea', { id: 'up-desc', rows: 5, maxlength: 5000 });
  const category = h('select', { id: 'up-cat' }, CATEGORIES.map((c) => h('option', { value: c }, c)));
  const thumbInput = h('input', { id: 'up-thumb', type: 'file', accept: IMAGE_TYPES.join(',') });
  const thumbPreview = h('img', { class: 'thumb-preview', alt: 'Thumbnail preview', hidden: true });
  const visibility = h('fieldset', { class: 'radio-group' }, h('legend', {}, 'Visibility'),
    [['public', 'Public', 'Everyone can find and watch'], ['unlisted', 'Unlisted', 'Anyone with the link can watch'], ['private', 'Private', 'Only you can watch']].map(([v, l, d], i) =>
      h('label', { class: 'radio' }, h('input', { type: 'radio', name: 'visibility', value: v, checked: i === 0 }), h('span', {}, h('strong', {}, l), h('span', { class: 'muted small' }, d)))));
  const progress = h('progress', { max: 100, value: 0, class: 'upload-progress', hidden: true, aria: { label: 'Upload progress' } });
  const progressText = h('p', { class: 'muted small', role: 'status' });
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Upload');

  const setFile = (file) => {
    const err = validateVideoFile(file, maxUploadBytes());
    fileError.textContent = err;
    if (err) { videoFile = null; fileInfo.textContent = ''; toast(err, { type: 'error' }); return; }
    videoFile = file;
    fileInfo.textContent = `Selected: ${file.name} (${formatBytes(file.size)})`;
    if (!title.value) { title.value = file.name.replace(/\.[^.]+$/, '').slice(0, 100); title.dispatchEvent(new Event('input')); }
  };
  fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) setFile(f); });
  title.addEventListener('input', () => { titleCount.textContent = `${title.value.length}/100`; });
  thumbInput.addEventListener('change', () => {
    const f = thumbInput.files[0];
    if (!f) { thumbFile = null; thumbPreview.hidden = true; return; }
    if (!IMAGE_TYPES.includes(f.type) || f.size > MAX_THUMB) {
      toast('Thumbnail must be a PNG, JPEG or WebP image under 5 MB.', { type: 'error' });
      thumbInput.value = ''; thumbFile = null; thumbPreview.hidden = true; return;
    }
    thumbFile = f;
    if (thumbPreview.src) URL.revokeObjectURL(thumbPreview.src);
    thumbPreview.src = URL.createObjectURL(f);
    thumbPreview.hidden = false;
  });
  ctx.onCleanup(() => { if (thumbPreview.src) URL.revokeObjectURL(thumbPreview.src); });

  const form = h('form', { class: 'upload-form', novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const err = validateVideoFile(videoFile, maxUploadBytes());
    if (err) { fileError.textContent = err; drop.querySelector('label').focus(); return; }
    if (!title.value.trim()) { toast('Add a title for your video.', { type: 'error' }); title.focus(); return; }
    submit.disabled = true;
    progress.hidden = false;
    const visibilityValue = form.querySelector('input[name="visibility"]:checked').value;
    if (remote.REMOTE) {
      try {
        progressText.textContent = 'Preparing…';
        const duration = await probeDuration(videoFile);
        const id = await remote.uploadVideo({
          file: videoFile, thumbFile, duration,
          title: title.value.trim(), description: description.value.trim(), category: category.value, visibility: visibilityValue,
        }, (p) => { const pct = Math.min(99, Math.round(p * 100)); progress.value = pct; progressText.textContent = `Uploading… ${pct}%`; });
        progress.value = 100;
        progressText.textContent = 'Upload complete';
        toast('Video uploaded!', { type: 'success' });
        navigate(`/watch/${encodeURIComponent(id)}`);
      } catch (error) {
        console.error(error);
        toast(`Upload failed: ${error.message || 'unknown error'}`, { type: 'error', timeout: 8000 });
        submit.disabled = false;
        progress.hidden = true;
        progressText.textContent = '';
      }
      return;
    }
    try {
      const buf = await readWithProgress(videoFile, (p) => { progress.value = Math.round(p * 90); progressText.textContent = `Uploading… ${Math.round(p * 90)}%`; });
      progressText.textContent = 'Processing…';
      const duration = await probeDuration(videoFile);
      const id = uid('up-');
      await saveUpload({
        id, ownerId: me.id, channelId: me.id,
        title: title.value.trim(), description: description.value.trim(), category: category.value,
        visibility: visibilityValue,
        videoBlob: new Blob([buf], { type: videoFile.type || 'video/mp4' }),
        thumbBlob: thumbFile || null, size: videoFile.size, duration, createdAt: new Date().toISOString(),
      });
      progress.value = 100;
      progressText.textContent = 'Upload complete';
      toast(db.persistent ? 'Video uploaded!' : 'Uploaded for this session only (browser storage unavailable).', { type: 'success' });
      navigate(`/watch/${encodeURIComponent(id)}`);
    } catch (error) {
      console.error(error);
      toast(error.code === 'quota' ? error.message : `Upload failed: ${error.message || 'unknown error'}`, { type: 'error', timeout: 7000 });
      submit.disabled = false;
      progress.hidden = true;
      progressText.textContent = '';
    }
  } },
  drop, fileError,
  h('div', { class: 'field' }, h('div', { class: 'label-row' }, h('label', { for: 'up-title' }, 'Title (required)'), titleCount), title),
  h('div', { class: 'field' }, h('label', { for: 'up-desc' }, 'Description'), description),
  h('div', { class: 'field-grid' },
    h('div', { class: 'field' }, h('label', { for: 'up-cat' }, 'Category'), category),
    h('div', { class: 'field' }, h('label', { for: 'up-thumb' }, 'Thumbnail (optional)'), thumbInput, h('p', { class: 'muted small' }, 'If you skip this, Lumen generates one.'))),
  thumbPreview,
  visibility,
  progress, progressText,
  h('div', { class: 'form-actions' }, h('a', { class: 'btn btn-ghost', href: '#/studio' }, 'Cancel'), submit));

  mount(ctx.outlet, h('div', { class: 'page narrow' }, pageTitle('Upload video'), form));
  if (!remote.REMOTE) ready().then((ok) => { if (!ok && ctx.isActive()) toast('Browser storage is unavailable, so uploads will disappear when you close this tab.', { type: 'error', timeout: 8000 }); });
}
