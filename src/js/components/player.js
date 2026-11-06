// HTML5 video player with custom, keyboard-accessible controls.
// Shortcuts (when focus isn't in a text field): Space/K play, ←/→ seek 5s,
// J/L seek 10s, ↑/↓ volume, M mute, F fullscreen, 0–9 jump to 0–90%, </> speed.

import { h, formatDuration, clamp } from '../utils.js';
import { icon } from './icons.js';
import { store } from '../store.js';

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function createPlayer(video, { startAt = 0, speed = 1, autoplay = false, onTime, onEnded } = {}) {
  const media = h('video', {
    class: 'player-video', playsinline: true, preload: 'metadata', poster: video.thumb,
  });
  media.playbackRate = speed;
  const vol = store.get('volume', { level: 1, muted: false });
  media.volume = vol.level;
  media.muted = vol.muted;

  const playBtn = h('button', { class: 'pc-btn', type: 'button', aria: { label: 'Play (k)' } }, icon('play'));
  const bigPlay = h('button', { class: 'big-play', type: 'button', aria: { label: 'Play video' } }, icon('play', { size: 48 }));
  const seek = h('input', { class: 'seek', type: 'range', min: 0, max: 1000, step: 1, value: '0', aria: { label: 'Seek', valuetext: '0:00 of 0:00' } });
  const muteBtn = h('button', { class: 'pc-btn', type: 'button', aria: { label: 'Mute (m)' } }, icon('volume'));
  const volume = h('input', { class: 'volume', type: 'range', min: 0, max: 1, step: 0.05, value: String(media.muted ? 0 : media.volume), aria: { label: 'Volume' } });
  const time = h('span', { class: 'pc-time', aria: { live: 'off' } }, '0:00 / 0:00');
  const speedSel = h('select', { class: 'pc-speed', aria: { label: 'Playback speed' } },
    SPEEDS.map((s) => h('option', { value: String(s) }, s === 1 ? 'Normal' : `${s}×`)));
  speedSel.value = String(speed);
  const fsBtn = h('button', { class: 'pc-btn', type: 'button', aria: { label: 'Full screen (f)' } }, icon('fullscreen'));
  const status = h('div', { class: 'visually-hidden', role: 'status', aria: { live: 'polite' } });
  const errorBox = h('div', { class: 'player-error', hidden: true },
    icon('info', { size: 40 }),
    h('p', { class: 'pe-title' }, 'This video can\'t be played right now.'),
    h('p', { class: 'pe-text' }, 'The video source may be offline, blocked by your network, or in a format your browser doesn\'t support. Try another video or check your connection.'),
    h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => { errorBox.hidden = true; root.classList.remove('has-error'); media.load(); } }, 'Try again'));
  const spinner = h('div', { class: 'player-spinner', hidden: true, aria: { hidden: 'true' } });

  // Same-origin clips are fetched into a Blob URL: Python's built-in
  // http.server ignores HTTP Range requests, which would break seeking.
  let destroyed = false;
  let blobSrc = null;
  (async () => {
    const src = video.src;
    if (/^(blob:|data:|https?:)/i.test(src)) { media.src = src; return; }
    spinner.hidden = false;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (destroyed) return;
      blobSrc = URL.createObjectURL(blob);
      media.src = blobSrc;
    } catch {
      if (!destroyed) media.src = src; // let the media element report the error
    }
  })();

  const controls = h('div', { class: 'player-controls' },
    seek,
    h('div', { class: 'pc-row' },
      playBtn,
      h('div', { class: 'pc-volume' }, muteBtn, volume),
      time,
      h('span', { class: 'pc-spacer' }),
      h('label', { class: 'pc-speed-wrap' }, icon('speed', { size: 20 }), speedSel),
      fsBtn));

  const root = h('div', { class: 'player paused', tabindex: '0', role: 'region', aria: { label: `Video player: ${video.title}` } },
    media, spinner, bigPlay, errorBox, controls, status);

  const announce = (msg) => { status.textContent = msg; };
  const setIcon = (btn, name) => btn.replaceChildren(icon(name));
  let resumed = false;

  const togglePlay = () => {
    if (media.paused || media.ended) {
      const p = media.play();
      if (p?.catch) p.catch(() => { /* autoplay blocked or source error: handled by 'error' */ });
    } else media.pause();
  };
  const seekBy = (d) => { if (Number.isFinite(media.duration)) { media.currentTime = clamp(media.currentTime + d, 0, media.duration); announce(`${formatDuration(media.currentTime)}`); } };
  const setVolume = (v) => {
    media.volume = clamp(v, 0, 1);
    media.muted = media.volume === 0;
    announce(`Volume ${Math.round(media.volume * 100)}%`);
  };
  const toggleMute = () => { media.muted = !media.muted; if (!media.muted && media.volume === 0) media.volume = 0.5; announce(media.muted ? 'Muted' : 'Unmuted'); };
  const toggleFullscreen = () => {
    const doc = document;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
    else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
    else if (media.webkitEnterFullscreen) media.webkitEnterFullscreen(); // iOS Safari
  };
  const setSpeed = (s) => { media.playbackRate = s; speedSel.value = String(s); announce(`Speed ${s}×`); };

  playBtn.addEventListener('click', togglePlay);
  bigPlay.addEventListener('click', togglePlay);
  media.addEventListener('click', togglePlay);
  media.addEventListener('dblclick', toggleFullscreen);
  muteBtn.addEventListener('click', toggleMute);
  fsBtn.addEventListener('click', toggleFullscreen);
  volume.addEventListener('input', () => setVolume(Number(volume.value)));
  speedSel.addEventListener('change', () => setSpeed(Number(speedSel.value)));
  seek.addEventListener('input', () => {
    if (Number.isFinite(media.duration)) media.currentTime = (Number(seek.value) / 1000) * media.duration;
  });

  media.addEventListener('play', () => { root.classList.remove('paused'); setIcon(playBtn, 'pause'); playBtn.setAttribute('aria-label', 'Pause (k)'); });
  media.addEventListener('pause', () => { root.classList.add('paused'); setIcon(playBtn, 'play'); playBtn.setAttribute('aria-label', 'Play (k)'); });
  media.addEventListener('waiting', () => { spinner.hidden = false; });
  media.addEventListener('playing', () => { spinner.hidden = true; });
  media.addEventListener('canplay', () => { spinner.hidden = true; });
  media.addEventListener('volumechange', () => {
    const muted = media.muted || media.volume === 0;
    setIcon(muteBtn, muted ? 'mute' : 'volume');
    muteBtn.setAttribute('aria-label', muted ? 'Unmute (m)' : 'Mute (m)');
    volume.value = String(muted ? 0 : media.volume);
    store.set('volume', { level: media.volume, muted: media.muted });
  });
  media.addEventListener('loadedmetadata', () => {
    if (!resumed && startAt > 5 && startAt < media.duration - 5) {
      media.currentTime = startAt;
      announce(`Resumed at ${formatDuration(startAt)}`);
    }
    resumed = true;
    updateTime();
    if (autoplay) togglePlay();
  });
  const updateTime = () => {
    const d = Number.isFinite(media.duration) ? media.duration : 0;
    const t = media.currentTime;
    time.textContent = `${formatDuration(t)} / ${formatDuration(d)}`;
    seek.value = d ? String(Math.round((t / d) * 1000)) : '0';
    seek.setAttribute('aria-valuetext', `${formatDuration(t)} of ${formatDuration(d)}`);
    seek.style.setProperty('--progress', `${d ? (t / d) * 100 : 0}%`);
    onTime?.(t, d);
  };
  media.addEventListener('timeupdate', updateTime);
  media.addEventListener('ended', () => onEnded?.());
  media.addEventListener('error', () => { spinner.hidden = true; errorBox.hidden = false; root.classList.add('has-error'); });
  const onFsChange = () => {
    const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    setIcon(fsBtn, fs ? 'exitFullscreen' : 'fullscreen');
    fsBtn.setAttribute('aria-label', fs ? 'Exit full screen (f)' : 'Full screen (f)');
  };
  document.addEventListener('fullscreenchange', onFsChange);

  // Show controls briefly on mouse movement while playing.
  let hideTimer;
  root.addEventListener('mousemove', () => {
    root.classList.add('show-controls');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => root.classList.remove('show-controls'), 2500);
  });

  // Keyboard shortcuts are handled at document level while the watch page is open.
  const onKey = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest?.('input, textarea, select, [contenteditable="true"], dialog')) {
      // Let range inputs inside the player keep their native arrow behavior.
      return;
    }
    if (t.closest?.('button, a') && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key.toLowerCase();
    const handled = {
      ' ': togglePlay, k: togglePlay,
      arrowleft: () => seekBy(-5), arrowright: () => seekBy(5),
      j: () => seekBy(-10), l: () => seekBy(10),
      arrowup: () => setVolume(media.volume + 0.05), arrowdown: () => setVolume(media.volume - 0.05),
      m: toggleMute, f: toggleFullscreen,
      '>': () => setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(media.playbackRate) + 1)] || 1),
      '<': () => setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(media.playbackRate) - 1)] || 1),
    }[k];
    if (handled) { e.preventDefault(); handled(); return; }
    if (/^[0-9]$/.test(k) && Number.isFinite(media.duration)) { e.preventDefault(); media.currentTime = media.duration * (Number(k) / 10); }
  };
  document.addEventListener('keydown', onKey);

  return {
    el: root,
    media,
    destroy() {
      destroyed = true;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFsChange);
      clearTimeout(hideTimer);
      media.pause();
      media.removeAttribute('src');
      media.load();
      if (blobSrc) URL.revokeObjectURL(blobSrc);
    },
  };
}
