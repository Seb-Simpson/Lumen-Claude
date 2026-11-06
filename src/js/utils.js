// Small, dependency-free helpers shared across the app.

/** Escape text for safe use inside HTML/XML markup (used for generated SVG). */
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/**
 * Hyperscript-style element builder. Children that are strings become text
 * nodes, so user-provided text is never parsed as HTML.
 *   h('a', { href: '#/', class: 'x', onClick: fn, aria: { label: 'Home' } }, 'Home')
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  let value;
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val == null || val === false) continue;
    if (key === 'value') value = val; // applied after children so <select> options exist
    else if (key === 'class') el.className = Array.isArray(val) ? val.filter(Boolean).join(' ') : val;
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key === 'aria') for (const [k, v] of Object.entries(val)) { if (v != null) el.setAttribute(`aria-${k}`, String(v)); }
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    else if (key in el && typeof val !== 'string') el[key] = val;
    else if (val === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(val));
  }
  append(el, children);
  if (value !== undefined) el.value = value;
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replace all children of a node. */
export function mount(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
  return parent;
}

/** 1234 -> "1.2K", 2500000 -> "2.5M". */
export function formatCount(n) {
  n = Number(n) || 0;
  const abs = Math.abs(n);
  const fmt = (v, s) => `${(Math.floor(v * 10) / 10).toString().replace(/\.0$/, '')}${s}`;
  if (abs >= 1e9) return fmt(n / 1e9, 'B');
  if (abs >= 1e6) return fmt(n / 1e6, 'M');
  if (abs >= 1e3) return fmt(n / 1e3, 'K');
  return String(Math.trunc(n));
}

export function formatViews(n) {
  n = Number(n) || 0;
  return `${formatCount(n)} ${n === 1 ? 'view' : 'views'}`;
}

/** Seconds -> "m:ss" or "h:mm:ss". */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = String(s % 60).padStart(2, '0');
  return hrs ? `${hrs}:${String(mins).padStart(2, '0')}:${secs}` : `${mins}:${secs}`;
}

/** Relative time like "3 days ago". */
export function timeAgo(date, now = Date.now()) {
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 45) return 'just now';
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [name, secs] of units) {
    const v = Math.floor(diff / secs);
    if (v >= 1) return `${v} ${name}${v === 1 ? '' : 's'} ago`;
  }
  return '1 minute ago';
}

export function formatDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function debounce(fn, wait = 250) {
  let t;
  const debounced = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  debounced.cancel = () => clearTimeout(t);
  return debounced;
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function uid(prefix = '') {
  const bytes = new Uint8Array(8);
  (globalThis.crypto || {}).getRandomValues?.(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 11) + Date.now().toString(36).slice(-3);
}

/** Deterministic PRNG (mulberry32) for repeatable seed data. */
export function seededRandom(seed) {
  let a = typeof seed === 'number' ? seed : hashString(seed);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h1 = 2166136261;
  for (let i = 0; i < str.length; i++) { h1 ^= str.charCodeAt(i); h1 = Math.imul(h1, 16777619); }
  return h1 >>> 0;
}

/** Build a data: URI from an SVG string. */
export const svgDataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
