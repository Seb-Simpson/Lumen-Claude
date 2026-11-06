// Comments: built-in sample comments plus people's comments, stored in
// Supabase when it's configured or in this browser otherwise.
// Replies are one level deep.

import { h, timeAgo, formatCount, uid } from '../utils.js';
import { store } from '../store.js';
import { auth } from '../auth.js';
import { library } from '../library.js';
import { seedComments } from '../data/seed.js';
import { avatar, toast } from './ui.js';
import { icon } from './icons.js';
import * as remote from '../backend/remote.js';
import { confirmDialog } from './ui.js';

const MAX_LEN = 1000;
const userKey = (videoId) => `comments:${videoId}`;

/** All comments for a video: people's comments (newest first), then the samples. */
export async function getComments(videoId) {
  if (remote.REMOTE) return [...await remote.fetchComments(videoId), ...seedComments(videoId)];
  const local = store.get(userKey(videoId), { top: [], replies: {} });
  const seeds = seedComments(videoId);
  const all = [...local.top, ...seeds];
  return all.map((c) => ({ ...c, replies: [...(c.replies || []), ...(local.replies[c.id] || [])] }));
}

async function addComment(videoId, text, parentId = null) {
  if (remote.REMOTE) return remote.addComment(videoId, text, parentId);
  const me = auth.currentUser();
  const comment = {
    id: uid('c'), author: me.displayName, color: me.color, initial: me.initial, userId: me.id,
    text, likes: 0, createdAt: new Date().toISOString(), replies: [],
  };
  const ok = store.update(userKey(videoId), (d) => {
    const next = { top: [...d.top], replies: { ...d.replies } };
    if (parentId) next.replies[parentId] = [...(next.replies[parentId] || []), comment];
    else next.top.unshift(comment);
    return next;
  }, { top: [], replies: {} });
  if (!ok) throw new Error('Could not save your comment (storage is full or blocked).');
  return comment;
}

function composer({ placeholder, submitLabel, onSubmit, onCancel, autofocus = false }) {
  const me = auth.currentUser();
  const ta = h('textarea', { class: 'comment-input', rows: 1, maxlength: MAX_LEN, placeholder, aria: { label: placeholder } });
  const submit = h('button', { class: 'btn btn-primary btn-sm', type: 'submit', disabled: true }, submitLabel);
  const actions = h('div', { class: 'composer-actions', hidden: !autofocus },
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { ta.value = ''; submit.disabled = true; if (onCancel) onCancel(); else actions.hidden = true; } }, 'Cancel'),
    submit);
  ta.addEventListener('focus', () => { actions.hidden = false; });
  ta.addEventListener('input', () => {
    submit.disabled = !ta.value.trim();
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  });
  const form = h('form', { class: 'composer', onSubmit: async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text || submit.disabled) return;
    submit.disabled = true;
    try {
      await onSubmit(text);
      ta.value = '';
    } catch (err) {
      toast(err.message, { type: 'error' });
      submit.disabled = false;
    }
  } },
  avatar({ initial: me.initial, color: me.color, size: 36 }),
  h('div', { class: 'composer-main' }, ta, actions));
  if (autofocus) queueMicrotask(() => ta.focus());
  return form;
}

function commentItem(videoId, c, { isReply = false, rerender, videoOwnerId }) {
  const me = auth.currentUser();
  // Sample comments can't be replied to on the server (they aren't stored there).
  const canReply = !isReply && (!remote.REMOTE || remote.isUuid(c.id));
  const canDelete = remote.REMOTE && me && remote.isUuid(c.id) && (c.userId === me.id || videoOwnerId === me.id);
  const liked = library.commentLiked(c.id);
  const likeBtn = h('button', {
    class: `chip-btn ${liked ? 'active' : ''}`, type: 'button', aria: { pressed: String(liked), label: `Like comment by ${c.author}` },
    onClick: () => {
      const now = library.toggleCommentLike(c.id);
      likeBtn.classList.toggle('active', now);
      likeBtn.setAttribute('aria-pressed', String(now));
      count.textContent = formatCount(c.likes + (now ? 1 : 0));
    },
  }, icon('like', { size: 18 }));
  const count = h('span', { class: 'like-count' }, formatCount(c.likes + (liked ? 1 : 0)));
  const replySlot = h('div', { class: 'reply-slot' });

  const deleteBtn = canDelete ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: async () => {
    if (!(await confirmDialog({ title: 'Delete comment?', message: 'This comment and its replies will be removed for everyone.', confirmLabel: 'Delete', danger: true }))) return;
    try { await remote.deleteComment(c.id); toast('Comment deleted'); rerender(); } catch (err) { toast(err.message, { type: 'error' }); }
  } }, 'Delete') : null;

  const replyBtn = !canReply ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => {
    if (!auth.currentUser()) { toast('Sign in to reply.'); location.hash = '#/login'; return; }
    if (replySlot.firstChild) { replySlot.replaceChildren(); return; }
    replySlot.append(composer({
      placeholder: `Reply to ${c.author}…`, submitLabel: 'Reply', autofocus: true,
      onCancel: () => replySlot.replaceChildren(),
      onSubmit: async (text) => { await addComment(videoId, text, c.id); rerender(); toast('Reply posted'); },
    }));
  } }, 'Reply');

  const replies = !isReply && c.replies?.length
    ? h('details', { class: 'replies', open: !!me && c.replies.some((r) => r.userId === me.id) },
      h('summary', {}, `${c.replies.length} ${c.replies.length === 1 ? 'reply' : 'replies'}`),
      h('ul', { class: 'comment-list' }, c.replies.map((r) => commentItem(videoId, r, { isReply: true, rerender, videoOwnerId }))))
    : null;

  return h('li', { class: `comment ${isReply ? 'is-reply' : ''}` },
    avatar({ initial: c.initial || c.author[0], color: c.color, size: isReply ? 28 : 40 }),
    h('div', { class: 'comment-main' },
      h('p', { class: 'comment-head' }, h('strong', {}, c.author), ' ', h('span', { class: 'muted' }, timeAgo(c.createdAt))),
      h('p', { class: 'comment-text' }, c.text),
      h('div', { class: 'comment-actions' }, likeBtn, count, replyBtn, deleteBtn),
      replySlot,
      replies));
}

export function commentsSection(videoId, { videoOwnerId = null } = {}) {
  const section = h('section', { class: 'comments', aria: { labelledby: 'comments-title' } },
    h('h2', { id: 'comments-title' }, 'Comments'), h('p', { class: 'muted' }, 'Loading comments…'));
  const render = async () => {
    let list;
    try {
      list = await getComments(videoId);
    } catch (err) {
      section.replaceChildren(h('h2', { id: 'comments-title' }, 'Comments'),
        h('p', { class: 'muted' }, `Comments couldn't be loaded. ${err.message}`),
        h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onClick: render }, 'Try again'));
      return;
    }
    if (!section.isConnected && section.dataset.mounted) return;
    section.dataset.mounted = '1';
    const count = list.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);
    const me = auth.currentUser();
    section.replaceChildren(
      h('h2', { id: 'comments-title' }, `${count} Comments`),
      me
        ? composer({ placeholder: 'Add a comment…', submitLabel: 'Comment', onSubmit: async (text) => { await addComment(videoId, text); await render(); toast('Comment posted'); } })
        : h('p', { class: 'signin-prompt' }, h('a', { href: '#/login' }, 'Sign in'), ' to join the conversation.'),
      h('ul', { class: 'comment-list' }, list.map((c) => commentItem(videoId, c, { rerender: render, videoOwnerId }))));
  };
  render();
  return section;
}
