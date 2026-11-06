// Video card in three layouts: 'grid' (home), 'row' (search/library), 'compact' (up next).

import { h, formatViews, formatDuration, timeAgo } from '../utils.js';
import { avatar } from './ui.js';
import { getChannel } from '../videos.js';

export function videoCard(video, { layout = 'grid', extra = null, showChannelAvatar = true } = {}) {
  const ch = getChannel(video.channelId) || { name: 'Unknown', initial: '?', color: '#475569' };
  const href = `#/watch/${encodeURIComponent(video.id)}`;
  const img = h('img', { src: video.thumb, alt: '', loading: 'lazy', decoding: 'async', width: 320, height: 180 });
  const badge = video.live
    ? h('span', { class: 'badge badge-live' }, 'LIVE')
    : video.duration ? h('span', { class: 'badge' }, formatDuration(video.duration)) : null;
  const meta = [video.live ? 'Live demo' : formatViews(video.views), timeAgo(video.createdAt)];
  if (video.visibility && video.visibility !== 'public') meta.push(video.visibility === 'private' ? 'Private' : 'Unlisted');

  const thumb = h('a', { class: 'thumb', href, tabindex: '-1', aria: { hidden: 'true' } }, img, badge);
  const titleLink = h('a', { class: 'card-title', href }, video.title);
  const channelLink = h('a', { class: 'card-channel', href: `#/channel/${encodeURIComponent(ch.id || video.channelId)}` }, ch.name);
  const info = h('div', { class: 'card-info' },
    h('h3', {}, titleLink),
    channelLink,
    h('p', { class: 'card-meta' }, meta.join(' • ')),
    layout === 'row' && video.description ? h('p', { class: 'card-desc' }, video.description.split('\n')[0]) : null,
    extra);

  return h('article', { class: `card card-${layout}` },
    thumb,
    h('div', { class: 'card-body' },
      layout === 'grid' && showChannelAvatar
        ? h('a', { href: `#/channel/${encodeURIComponent(ch.id || '')}`, class: 'card-avatar', tabindex: '-1', aria: { hidden: 'true' } }, avatar({ initial: ch.initial, color: ch.color, size: 36 }))
        : null,
      info));
}
