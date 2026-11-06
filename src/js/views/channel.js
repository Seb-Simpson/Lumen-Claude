import { h, mount, formatCount, formatDate } from '../utils.js';
import { getChannel, getPublicVideos, getMyUploads } from '../videos.js';
import { videoCard } from '../components/videoCard.js';
import { avatar, emptyState, skeletonGrid } from '../components/ui.js';
import { subscribeButton } from './watch.js';
import { library } from '../library.js';
import { auth } from '../auth.js';

export async function render(ctx) {
  const channel = getChannel(ctx.params.id);
  if (!channel) {
    ctx.setMeta('Channel not found', 'This channel does not exist.');
    mount(ctx.outlet, h('div', { class: 'page' }, emptyState({ iconName: 'user', title: 'Channel not found', level: 1, text: 'This channel doesn\'t exist or was removed.', action: h('a', { class: 'btn btn-primary', href: '#/' }, 'Go to home') })));
    return;
  }
  const tab = ctx.query.get('tab') === 'about' ? 'about' : 'videos';
  ctx.setMeta(channel.name, channel.about);
  const isMe = auth.currentUserId() === channel.id;

  const subs = h('span', {});
  const paintSubs = () => { subs.textContent = `${formatCount(channel.subscribers + (library.isSubscribed(channel.id) ? 1 : 0))} subscribers`; };
  paintSubs();

  const banner = h('div', { class: 'channel-banner' }, h('img', { src: channel.banner, alt: '', width: 1600, height: 260 }));
  const content = h('div', { class: 'channel-content', role: 'tabpanel', id: 'channel-panel', aria: { labelledby: `tab-${tab}` } });
  const tabLink = (key, label) => h('a', {
    class: `tab ${tab === key ? 'active' : ''}`, role: 'tab', id: `tab-${key}`,
    href: `#/channel/${encodeURIComponent(channel.id)}${key === 'about' ? '?tab=about' : ''}`,
    aria: { selected: String(tab === key), controls: 'channel-panel' },
  }, label);

  mount(ctx.outlet, h('div', { class: 'page channel' },
    banner,
    h('div', { class: 'channel-header' },
      avatar({ initial: channel.initial, color: channel.color, size: 96 }),
      h('div', { class: 'channel-id' },
        h('h1', { tabindex: '-1' }, channel.name),
        h('p', { class: 'muted' }, channel.handle, ' • ', subs),
        h('p', { class: 'muted channel-about-short' }, channel.about)),
      isMe ? h('a', { class: 'btn btn-secondary', href: '#/studio' }, 'Manage videos') : subscribeButton(channel, { onChange: paintSubs })),
    h('div', { class: 'tabs', role: 'tablist', aria: { label: 'Channel sections' } }, tabLink('videos', 'Videos'), tabLink('about', 'About')),
    content));

  if (tab === 'about') {
    mount(content, h('div', { class: 'about-panel' },
      h('h2', {}, 'Description'),
      h('p', { class: 'pre-line' }, channel.about),
      h('h2', {}, 'Stats'),
      h('ul', { class: 'plain-list' },
        h('li', {}, `Joined ${formatDate(channel.joined)}`),
        h('li', {}, subs.textContent))));
    return;
  }
  content.append(skeletonGrid(4));
  let vids = (await getPublicVideos()).filter((v) => v.channelId === channel.id);
  if (isMe) vids = await getMyUploads(); // owners also see private/unlisted
  if (!ctx.isActive()) return;
  vids.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  mount(content, vids.length
    ? h('div', { class: 'video-grid' }, vids.map((v) => videoCard(v, { showChannelAvatar: false })))
    : emptyState({ title: 'No videos yet', text: isMe ? 'Upload your first video to get started.' : 'This channel hasn\'t uploaded any public videos.', action: isMe ? h('a', { class: 'btn btn-primary', href: '#/upload' }, 'Upload video') : null }));
}
