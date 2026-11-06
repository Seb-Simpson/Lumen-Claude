// Generates SVG thumbnails, banners and avatars as data: URIs.
// Any text placed inside the SVG is XML-escaped first.

import { escapeHTML, seededRandom, svgDataUri } from '../utils.js';

const PALETTES = {
  Music: ['#7c3aed', '#db2777'],
  Gaming: ['#1d4ed8', '#22d3ee'],
  Science: ['#0f766e', '#84cc16'],
  Coding: ['#111827', '#6366f1'],
  Sports: ['#c2410c', '#facc15'],
  Other: ['#334155', '#94a3b8'],
};

function decoration(category, rnd) {
  const r = () => Math.round(rnd() * 1000) / 1000;
  switch (category) {
    case 'Music':
      return Array.from({ length: 5 }, (_, i) =>
        `<circle cx="${980 + r() * 60}" cy="${260 + r() * 40}" r="${80 + i * 70}" fill="none" stroke="#fff" stroke-opacity="${0.22 - i * 0.035}" stroke-width="18"/>`).join('');
    case 'Gaming':
      return Array.from({ length: 7 }, () => {
        const x = 700 + r() * 520, y = 40 + r() * 420, s = 50 + r() * 110;
        return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="14" fill="#fff" fill-opacity="${0.08 + r() * 0.16}" transform="rotate(${r() * 45} ${x} ${y})"/>`;
      }).join('');
    case 'Science':
      return `<g fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="8">
        <ellipse cx="1000" cy="260" rx="230" ry="80" transform="rotate(30 1000 260)"/>
        <ellipse cx="1000" cy="260" rx="230" ry="80" transform="rotate(-30 1000 260)"/>
        <ellipse cx="1000" cy="260" rx="230" ry="80" transform="rotate(90 1000 260)"/></g>
        <circle cx="1000" cy="260" r="42" fill="#fff" fill-opacity=".85"/>`;
    case 'Coding':
      return `<text x="1180" y="330" text-anchor="end" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="260" font-weight="700" fill="#fff" fill-opacity=".18">&lt;/&gt;</text>
        ${Array.from({ length: 6 }, (_, i) => `<rect x="${760 + r() * 80}" y="${70 + i * 52}" width="${120 + r() * 300}" height="18" rx="9" fill="#fff" fill-opacity=".14"/>`).join('')}`;
    case 'Sports':
      return `<g fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="10">
        <rect x="700" y="60" width="520" height="400" rx="12"/><line x1="960" y1="60" x2="960" y2="460"/>
        <circle cx="960" cy="260" r="90"/></g>`;
    default:
      return `<circle cx="1000" cy="250" r="180" fill="#fff" fill-opacity=".15"/>`;
  }
}

/** Break a title into at most 3 lines of ~maxChars. */
export function wrapTitle(title, maxChars = 20, maxLines = 3) {
  const words = String(title).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,1}$/, '…'); }
  return lines;
}

export function thumbnailSVG({ id, title, category, live = false }) {
  const [c1, c2] = PALETTES[category] || PALETTES.Other;
  const rnd = seededRandom(String(id));
  const lines = wrapTitle(title);
  const text = lines.map((l, i) => `<tspan x="64" dy="${i === 0 ? 0 : 82}">${escapeHTML(l)}</tspan>`).join('');
  const liveBadge = live ? '<rect x="64" y="56" width="150" height="56" rx="10" fill="#dc2626"/><text x="139" y="96" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="800" fill="#fff">LIVE</text>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>
<rect width="1280" height="720" fill="url(#g)"/>${decoration(category, rnd)}<rect width="1280" height="720" fill="url(#s)"/>${liveBadge}
<text x="64" y="${640 - (lines.length - 1) * 82}" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="72" font-weight="800" fill="#fff">${text}</text>
</svg>`;
}

export const thumbnailURI = (v) => svgDataUri(thumbnailSVG(v));

export function bannerURI({ id, color = '#334155' }) {
  const rnd = seededRandom(`banner-${id}`);
  const blobs = Array.from({ length: 6 }, () =>
    `<circle cx="${Math.round(rnd() * 1600)}" cy="${Math.round(rnd() * 260)}" r="${Math.round(60 + rnd() * 160)}" fill="#fff" fill-opacity="${(0.05 + rnd() * 0.12).toFixed(2)}"/>`).join('');
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 260" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
<rect width="1600" height="260" fill="url(#b)"/>${blobs}</svg>`);
}
