import { h, mount, formatCount, formatDate, timeAgo } from '../utils.js';
import { getVideo, getPublicVideos, getChannel } from '../videos.js';
import { library, addView } from '../library.js';
import { getSettings } from '../store.js';
import { createPlayer } from '../components/player.js';
import { commentsSection } from '../components/comments.js';
import { videoCard } from '../components/videoCard.js';
import { avatar, toast, emptyState, copyText, skeletonList } from '../components/ui.js';
import { icon } from '../components/icons.js';
import { navigate } from '../router.js';
import { openSaveToPlaylist } from '../components/playlistDialog.js';
import { playlistHref } from './playlists.js';
import * as remote from '../backend/remote.js';
import { auth } from '../auth.js';
import { openModal } from '../components/ui.js';

export function subscribeButton(channel, { onChange } = {}) {
  const btn = h('button', { class: 'btn', type: 'button' });
  const paint = () => {
    const subbed = library.isSubscribed(channel.id);
    btn.className = `btn ${subbed ? 'btn-secondary' : 'btn-primary'} subscribe-btn`;
    btn.textContent = subbed ? 'Subscribed' : 'Subscribe';
    btn.setAttribute('aria-pressed', String(subbed));
    btn.setAttribute('aria-label', `${subbed ? 'Unsubscribe from' : 'Subscribe to'} ${channel.name}`);
  };
  btn.addEventListener('click', () => {
    const now = library.toggleSubscribe(channel.id);
    paint();
    onChange?.(now);
    toast(now ? `Subscribed to ${channel.name}` : `Unsubscribed from ${channel.name}`);
  });
  paint();
  return btn;
}

export async function render(ctx) {
  const id = ctx.params.id;
  mount(ctx.outlet, h('div', { class: 'page watch' }, h('div', { class: 'watch-main' }, h('div', { class: 'skeleton player-skel' })), h('aside', { class: 'watch-side' }, skeletonList(5))));
  const video = await getVideo(id);
  if (!ctx.isActive()) return;
  if (!video) {
    ctx.setMeta('Video unavailable', 'This video is unavailable.');
    mount(ctx.outlet, h('div', { class: 'page' }, emptyState({
      iconName: 'video', title: 'This video isn\'t available', level: 1,
      text: 'It may have been deleted, made private, or the link is wrong.',
      action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Go to home'),
    })));
    return;
  }
  const channel = getChannel(video.channelId) || { id: video.channelId, name: 'Unknown channel', initial: '?', color: '#475569', subscribers: 0 };
  ctx.setMeta(video.title, (video.description || '').split('\n')[0].slice(0, 160));

  if (video.remote) remote.incrementView(video.id); else addView(video.id);
  library.addToHistory(video.id);
  const settings = getSettings();
  const all = await getPublicVideos();
  if (!ctx.isActive()) return;
  const upNext = all.filter((v) => v.id !== video.id)
    .sort((a, b) => (b.channelId === video.channelId) - (a.channelId === video.channelId) || (b.category === video.category) - (a.category === video.category) || b.views - a.views)
    .slice(0, 12);

  // Playing from a playlist (#/watch/id?list=pl-…): show it and play through it.
  const plId = ctx.query.get('list');
  const playlist = plId ? library.getPlaylist(plId) : null;
  const plVideos = playlist?.videoIds.includes(video.id)
    ? (await Promise.all(playlist.videoIds.map((vid) => getVideo(vid)))).filter(Boolean)
    : null;
  if (!ctx.isActive()) return;
  const plIndex = plVideos ? plVideos.findIndex((v) => v.id === video.id) : -1;

  // --- Player ---
  let lastSave = 0;
  let autoplayTimer = null;
  const autoplayNote = h('div', { class: 'autoplay-note', role: 'status', hidden: true });
  const player = createPlayer(video, {
    startAt: library.position(video.id),
    speed: settings.speed,
    autoplay: false,
    onTime: (t, d) => {
      if (Date.now() - lastSave > 3000 && d) {
        lastSave = Date.now();
        library.savePosition(video.id, t > d - 5 ? 0 : t);
      }
    },
    onEnded: () => {
      library.savePosition(video.id, 0);
      // Playlists always continue to their next video; otherwise follow the autoplay setting.
      const next = plVideos ? plVideos[plIndex + 1] : upNext[0];
      if (!next || (!plVideos && !getSettings().autoplay)) {
        if (plVideos) { mount(autoplayNote, h('span', {}, `End of playlist “${playlist.name}”.`)); autoplayNote.hidden = false; }
        return;
      }
      const nextPath = plVideos ? playlistHref(playlist.id, next.id).slice(1) : `/watch/${encodeURIComponent(next.id)}`;
      let n = 5;
      const cancel = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { clearInterval(autoplayTimer); autoplayNote.hidden = true; } }, 'Cancel');
      const label = h('span', {});
      mount(autoplayNote, label, cancel);
      autoplayNote.hidden = false;
      const tick = () => {
        label.textContent = `Up next in ${n}s: ${next.title} `;
        if (n-- <= 0) { clearInterval(autoplayTimer); navigate(nextPath); }
      };
      tick();
      autoplayTimer = setInterval(tick, 1000);
    },
  });
  ctx.onCleanup(() => {
    clearInterval(autoplayTimer);
    if (player.media.currentTime > 0 && !player.media.ended) library.savePosition(video.id, player.media.currentTime);
    player.destroy();
  });

  // --- Actions ---
  const likeCount = h('span', {});
  const likeIcon = h('span', { class: 'seg-icon' });
  const dislikeIcon = h('span', { class: 'seg-icon' });
  const likeBtn = h('button', { class: 'seg-btn', type: 'button' }, likeIcon, likeCount);
  const dislikeBtn = h('button', { class: 'seg-btn', type: 'button', aria: { label: 'Dislike this video' } }, dislikeIcon);
  const paintRating = () => {
    const r = library.rating(video.id);
    // Outline = not chosen; filled and coloured = your choice.
    likeIcon.replaceChildren(icon(r === 1 ? 'like' : 'likeOutline', { size: 20 }));
    dislikeIcon.replaceChildren(icon(r === -1 ? 'dislike' : 'dislikeOutline', { size: 20 }));
    likeBtn.title = r === 1 ? 'You liked this' : 'I like this';
    dislikeBtn.title = r === -1 ? 'You disliked this' : 'I dislike this';
    likeBtn.classList.toggle('active', r === 1);
    dislikeBtn.classList.toggle('active', r === -1);
    likeBtn.setAttribute('aria-pressed', String(r === 1));
    dislikeBtn.setAttribute('aria-pressed', String(r === -1));
    const n = video.likes + (r === 1 ? 1 : 0);
    likeCount.textContent = formatCount(n);
    likeBtn.setAttribute('aria-label', `Like this video (${n.toLocaleString()} ${n === 1 ? 'like' : 'likes'})`);
  };
  const needSignIn = () => { if (remote.REMOTE && !auth.currentUser()) { toast('Sign in to like videos.'); return true; } return false; };
  likeBtn.addEventListener('click', () => { if (needSignIn()) return; const r = library.rate(video.id, 1); paintRating(); if (r === 1) toast('Added to Liked videos'); });
  dislikeBtn.addEventListener('click', () => { if (needSignIn()) return; library.rate(video.id, -1); paintRating(); });
  paintRating();
  if (remote.REMOTE) {
    // Add other people's likes to the count (the current user's own like is added in paintRating).
    remote.likesFromOthers(video.id).then((n) => { if (ctx.isActive()) { video.likes += n; paintRating(); } }).catch(() => {});
  }

  const laterBtn = h('button', { class: 'btn btn-secondary', type: 'button' });
  const paintLater = () => {
    const on = library.inWatchLater(video.id);
    laterBtn.replaceChildren(icon(on ? 'check' : 'clock', { size: 20 }), h('span', {}, on ? 'Saved' : 'Save'));
    laterBtn.setAttribute('aria-pressed', String(on));
    laterBtn.setAttribute('aria-label', on ? 'Remove from Watch later' : 'Save to Watch later');
  };
  const playlistBtn = h('button', { class: 'btn btn-secondary', type: 'button', aria: { haspopup: 'dialog' } },
    icon('playlistAdd', { size: 20 }), h('span', {}, 'Playlist'));
  const paintPlaylistBtn = () => {
    const n = library.playlistsWith(video.id).length;
    playlistBtn.setAttribute('aria-label', n ? `Save to playlist (in ${n} playlist${n === 1 ? '' : 's'})` : 'Save to playlist');
    playlistBtn.classList.toggle('is-saved', n > 0);
  };
  playlistBtn.addEventListener('click', () => openSaveToPlaylist(video.id, { onChange: paintPlaylistBtn }));
  paintPlaylistBtn();

  laterBtn.addEventListener('click', () => { const on = library.toggleWatchLater(video.id); paintLater(); toast(on ? 'Saved to Watch later' : 'Removed from Watch later'); });
  paintLater();

  const shareBtn = h('button', { class: 'btn btn-secondary', type: 'button', onClick: async () => {
    const url = `${location.origin}${location.pathname}#/watch/${encodeURIComponent(video.id)}`;
    toast((await copyText(url)) ? 'Link copied to clipboard' : 'Could not copy the link', { type: 'info' });
  } }, icon('share', { size: 20 }), h('span', {}, 'Share'));

  // --- Description (expandable) ---
  const descText = h('p', { class: 'desc-text' }, video.description || 'No description.');
  const descToggle = h('button', { class: 'link-btn desc-toggle', type: 'button', aria: { expanded: 'false', controls: 'desc' } }, 'Show more');
  const desc = h('div', { class: 'description collapsed', id: 'desc' },
    h('p', { class: 'desc-meta' }, h('strong', {}, video.live ? 'Live demo (recorded clip)' : `${video.views.toLocaleString()} views`), ' • ',
      h('time', { datetime: video.createdAt, title: formatDate(video.createdAt) }, `${formatDate(video.createdAt)} (${timeAgo(video.createdAt)})`),
      ' • ', h('a', { href: `#/?c=${encodeURIComponent(video.category)}` }, `#${video.category}`)),
    descText, descToggle);
  descToggle.addEventListener('click', () => {
    const collapsed = desc.classList.toggle('collapsed');
    descToggle.textContent = collapsed ? 'Show more' : 'Show less';
    descToggle.setAttribute('aria-expanded', String(!collapsed));
  });

  const subCount = h('span', { class: 'muted small' });
  const paintSubs = () => { subCount.textContent = `${formatCount(channel.subscribers + (library.isSubscribed(channel.id) ? 1 : 0))} subscribers`; };
  paintSubs();
  if (remote.REMOTE) {
    remote.subscribersFromOthers(channel.id).then((n) => { if (ctx.isActive()) { channel.subscribers += n; paintSubs(); } }).catch(() => {});
  }
  const me = auth.currentUser();
  const reportBtn = video.remote && video.ownerId !== me?.id
    ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openReport(video) }, icon('info', { size: 20 }), h('span', {}, 'Report'))
    : null;

  mount(ctx.outlet, h('div', { class: 'page watch' },
    h('div', { class: 'watch-main' },
      player.el,
      autoplayNote,
      h('h1', { class: 'watch-title', tabindex: '-1' }, video.title),
      h('div', { class: 'watch-bar' },
        h('div', { class: 'channel-mini' },
          h('a', { href: `#/channel/${encodeURIComponent(channel.id)}`, aria: { hidden: 'true' }, tabindex: '-1' }, avatar({ initial: channel.initial, color: channel.color, size: 40 })),
          h('div', {}, h('a', { class: 'channel-name', href: `#/channel/${encodeURIComponent(channel.id)}` }, channel.name), subCount),
          subscribeButton(channel, { onChange: paintSubs })),
        h('div', { class: 'watch-actions' },
          h('div', { class: 'segmented', role: 'group', aria: { label: 'Rate this video' } }, likeBtn, dislikeBtn),
          shareBtn, laterBtn, playlistBtn, reportBtn)),
      desc,
      commentsSection(video.id, { videoOwnerId: video.ownerId || null })),
    h('aside', { class: 'watch-side', aria: { label: plVideos ? 'Playlist and up next' : 'Up next' } },
      plVideos ? playlistPanel(playlist, plVideos, plIndex) : null,
      h('h2', { class: 'side-title' }, 'Up next'),
      upNext.length ? h('div', { class: 'video-list compact' }, upNext.map((v) => videoCard(v, { layout: 'compact' }))) : h('p', { class: 'muted' }, 'Nothing else to watch yet.'))));
}

/** Side panel listing the playlist being played, with the current video highlighted. */
function playlistPanel(playlist, vids, current) {
  const items = vids.map((v, i) => {
    const card = videoCard(v, { layout: 'compact' });
    card.querySelectorAll(`a[href="#/watch/${encodeURIComponent(v.id)}"]`).forEach((a) => {
      a.href = playlistHref(playlist.id, v.id);
      if (i === current) a.setAttribute('aria-current', 'true');
    });
    return h('li', { class: `pl-item ${i === current ? 'current' : ''}` },
      h('span', { class: 'pl-index', aria: { hidden: 'true' } }, i === current ? '▶' : String(i + 1)), card);
  });
  const panel = h('section', { class: 'pl-panel', aria: { labelledby: 'pl-panel-title' } },
    h('div', { class: 'pl-panel-head' },
      h('h2', { id: 'pl-panel-title' }, h('a', { href: `#/playlist/${encodeURIComponent(playlist.id)}` }, playlist.name)),
      h('p', { class: 'muted small' }, `${current + 1} / ${vids.length}`)),
    h('ol', { class: 'pl-list' }, items));
  // Scroll only the list (not the page) so the current item is visible.
  requestAnimationFrame(() => {
    const list = panel.querySelector('.pl-list');
    const cur = panel.querySelector('.pl-item.current');
    if (list && cur) list.scrollTop = cur.offsetTop - list.offsetTop - 8;
  });
  return panel;
}

/** Ask why a video is being reported, then send the report to the site owner. */
function openReport(video) {
  if (!auth.currentUser()) { toast('Sign in to report a video.'); location.hash = `#/login?next=${encodeURIComponent(`/watch/${video.id}`)}`; return; }
  const reasons = ['Spam or misleading', 'Violent or harmful', 'Hateful or abusive', 'Sexual content', 'Copyright', 'Something else'];
  const select = h('select', { id: 'report-reason' }, reasons.map((r) => h('option', { value: r }, r)));
  const details = h('textarea', { id: 'report-details', rows: 3, maxlength: 400, placeholder: 'Optional details' });
  const form = h('form', { id: 'report-form', onSubmit: async (e) => {
    e.preventDefault();
    const reason = [select.value, details.value.trim()].filter(Boolean).join(': ').slice(0, 500);
    try {
      await remote.reportVideo(video.id, reason);
      m.close();
      toast('Thanks — the report was sent to the site owner.', { type: 'success' });
    } catch (err) { toast(err.message, { type: 'error' }); }
  } },
  h('div', { class: 'field' }, h('label', { for: 'report-reason' }, 'What\'s wrong with this video?'), select),
  h('div', { class: 'field' }, h('label', { for: 'report-details' }, 'Details'), details));
  const m = openModal({
    title: 'Report video', body: form,
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => m.close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'submit', form: 'report-form' }, 'Send report'),
    ],
  });
  select.focus();
}
