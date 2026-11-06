// Shared UI building blocks: toasts, modals, avatars, empty states, skeletons.

import { h } from '../utils.js';
import { icon } from './icons.js';

/* ---------- Toasts ---------- */
export function toast(message, { type = 'info', timeout = 4000 } = {}) {
  const region = document.getElementById('toasts');
  if (!region) return;
  const close = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 200); };
  const el = h('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : null },
    h('span', { class: 'toast-msg' }, message),
    h('button', { class: 'icon-btn small', type: 'button', aria: { label: 'Dismiss notification' }, onClick: close }, icon('close', { size: 18 })));
  region.append(el);
  if (timeout) setTimeout(close, timeout);
}

/* ---------- Modal dialog (native <dialog>: focus trap + Esc for free) ---------- */
export function openModal({ title, body, actions = [], onClose, className = '' }) {
  const returnFocus = document.activeElement;
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  const dlg = h('dialog', { class: `modal ${className}`, aria: { labelledby: titleId } },
    h('div', { class: 'modal-head' },
      h('h2', { id: titleId }, title),
      h('button', { class: 'icon-btn', type: 'button', aria: { label: 'Close dialog' }, onClick: () => close() }, icon('close'))),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-actions' }, actions) : null);
  const close = (value) => {
    if (!dlg.open) return;
    dlg.close();
    dlg.remove();
    onClose?.(value);
    returnFocus?.focus?.();
  };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); }); // backdrop click
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, close };
}

export function confirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal({
      title,
      body: h('p', {}, message),
      onClose: () => resolve(result),
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => m.close() }, 'Cancel'),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onClick: () => { result = true; m.close(); } }, confirmLabel),
      ],
    });
  });
}

/* ---------- Avatar ---------- */
export function avatar({ initial = '?', color = '#475569', size = 36, label } = {}) {
  const el = h('span', { class: 'avatar', role: label ? 'img' : null, aria: label ? { label } : { hidden: 'true' } }, String(initial).slice(0, 2));
  el.style.background = color;
  el.style.width = el.style.height = `${size}px`;
  el.style.fontSize = `${Math.round(size * 0.45)}px`;
  return el;
}

/* ---------- Empty / error states ---------- */
export function emptyState({ iconName = 'video', title, text, action, level = 2 }) {
  return h('div', { class: 'empty-state' },
    h('div', { class: 'empty-icon' }, icon(iconName, { size: 48 })),
    h(`h${level}`, { tabindex: level === 1 ? '-1' : null }, title),
    text ? h('p', {}, text) : null,
    action || null);
}

/* ---------- Skeletons ---------- */
export function skeletonGrid(n = 8) {
  return h('div', { class: 'video-grid', aria: { hidden: 'true' } },
    Array.from({ length: n }, () => h('div', { class: 'card skeleton-card' },
      h('div', { class: 'skeleton thumb-skel' }),
      h('div', { class: 'skel-meta' },
        h('div', { class: 'skeleton circle' }),
        h('div', { class: 'skel-lines' }, h('div', { class: 'skeleton line' }), h('div', { class: 'skeleton line short' }))))));
}

export function skeletonList(n = 6) {
  return h('div', { class: 'video-list', aria: { hidden: 'true' } },
    Array.from({ length: n }, () => h('div', { class: 'row-card skeleton-card' },
      h('div', { class: 'skeleton thumb-skel' }),
      h('div', { class: 'skel-lines' }, h('div', { class: 'skeleton line' }), h('div', { class: 'skeleton line short' })))));
}

/** Page header helper used by most views. */
export function pageTitle(text, ...extra) {
  return h('div', { class: 'page-head' }, h('h1', { tabindex: '-1' }, text), ...extra);
}

/** Copy text with a fallback for older browsers / insecure contexts. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { class: 'visually-hidden', readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}
