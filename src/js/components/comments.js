// Comments: seed comments + comments stored locally. Replies are one level deep.

import { h, timeAgo, formatCount, uid } from '../utils.js';
import { store } from '../store.js';
import { auth } from '../auth.js';
import { library } from '../library.js';
import { seedComments } from '../data/seed.js';
import { avatar, toast } from './ui.js';
import { icon } from './icons.js';

const MAX_LEN = 1000;
const userKey = (videoId) => `comments:${videoId}`;

/** All comments for a video, newest local ones first, then seed comments. */
export function getComments(videoId) {
  const local = store.get(userKey(videoId), { top: [], replies: {} });
  const seeds = seedComments(videoId);
  const all = [...local.top, ...seeds];
  return all.map((c) => ({ ...c, replies: [...(c.replies || []), ...(local.replies[c.id] || [])] }));
}

function addComment(videoId, text, parentId = null) {
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
  const form = h('form', { class: 'composer', onSubmit: (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    try {
      onSubmit(text);
      ta.value = '';
      submit.disabled = true;
    } catch (err) { toast(err.message, { type: 'error' }); }
  } },
  avatar({ initial: me.initial, color: me.color, size: 36 }),
  h('div', { class: 'composer-main' }, ta, actions));
  if (autofocus) queueMicrotask(() => ta.focus());
  return form;
}

function commentItem(videoId, c, { isReply = false, rerender }) {
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

  const replyBtn = isReply ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => {
    if (!auth.currentUser()) { toast('Sign in to reply.'); location.hash = '#/login'; return; }
    if (replySlot.firstChild) { replySlot.replaceChildren(); return; }
    replySlot.append(composer({
      placeholder: `Reply to ${c.author}…`, submitLabel: 'Reply', autofocus: true,
      onCancel: () => replySlot.replaceChildren(),
      onSubmit: (text) => { addComment(videoId, text, c.id); rerender(); toast('Reply posted'); },
    }));
  } }, 'Reply');

  const replies = !isReply && c.replies?.length
    ? h('details', { class: 'replies', open: c.replies.some((r) => r.userId) },
      h('summary', {}, `${c.replies.length} ${c.replies.length === 1 ? 'reply' : 'replies'}`),
      h('ul', { class: 'comment-list' }, c.replies.map((r) => commentItem(videoId, r, { isReply: true, rerender }))))
    : null;

  return h('li', { class: `comment ${isReply ? 'is-reply' : ''}` },
    avatar({ initial: c.initial || c.author[0], color: c.color, size: isReply ? 28 : 40 }),
    h('div', { class: 'comment-main' },
      h('p', { class: 'comment-head' }, h('strong', {}, c.author), ' ', h('span', { class: 'muted' }, timeAgo(c.createdAt))),
      h('p', { class: 'comment-text' }, c.text),
      h('div', { class: 'comment-actions' }, likeBtn, count, replyBtn),
      replySlot,
      replies));
}

export function commentsSection(videoId) {
  const section = h('section', { class: 'comments', aria: { labelledby: 'comments-title' } });
  const render = () => {
    const list = getComments(videoId);
    const count = list.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);
    const me = auth.currentUser();
    section.replaceChildren(
      h('h2', { id: 'comments-title' }, `${count} Comments`),
      me
        ? composer({ placeholder: 'Add a comment…', submitLabel: 'Comment', onSubmit: (text) => { addComment(videoId, text); render(); toast('Comment posted'); } })
        : h('p', { class: 'signin-prompt' }, h('a', { href: '#/login' }, 'Sign in'), ' to join the conversation.'),
      h('ul', { class: 'comment-list' }, list.map((c) => commentItem(videoId, c, { rerender: render }))));
  };
  render();
  return section;
}
