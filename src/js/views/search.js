import { h, mount, formatCount } from '../utils.js';
import { getPublicVideos, channelName, allChannels } from '../videos.js';
import { searchVideos, searchChannels } from '../search.js';
import { videoCard } from '../components/videoCard.js';
import { emptyState, skeletonList, avatar, pageTitle } from '../components/ui.js';
import { navigate } from '../router.js';

const SORTS = [['relevance', 'Relevance'], ['date', 'Upload date'], ['views', 'View count']];
const TYPES = [['all', 'All'], ['video', 'Videos'], ['live', 'Live'], ['channel', 'Channels']];

export async function render(ctx) {
  const q = (ctx.query.get('q') || '').trim();
  const sort = SORTS.some(([k]) => k === ctx.query.get('sort')) ? ctx.query.get('sort') : 'relevance';
  const type = TYPES.some(([k]) => k === ctx.query.get('type')) ? ctx.query.get('type') : 'all';
  ctx.setMeta(q ? `${q}` : 'Search', q ? `Search results for “${q}” on Lumen.` : 'Search Lumen videos and channels.');

  const header = document.getElementById('search-input');
  if (header && header.value !== q) header.value = q;

  const go = (patch) => {
    const p = new URLSearchParams({ q, sort, type, ...patch });
    if (p.get('sort') === 'relevance') p.delete('sort');
    if (p.get('type') === 'all') p.delete('type');
    navigate(`/search?${p}`);
  };
  const select = (label, options, value, key) => h('label', { class: 'field-inline' }, h('span', {}, label),
    h('select', { value, onChange: (e) => go({ [key]: e.target.value }) }, options.map(([k, l]) => h('option', { value: k }, l))));

  const results = h('div', { class: 'search-results' }, skeletonList(4));
  mount(ctx.outlet, h('div', { class: 'page narrow-wide' },
    pageTitle(q ? `Results for “${q}”` : 'Search'),
    h('div', { class: 'filters', role: 'group', aria: { label: 'Search filters' } },
      select('Sort by', SORTS, sort, 'sort'),
      select('Type', TYPES, type, 'type')),
    results));

  if (!q) {
    mount(results, emptyState({ iconName: 'search', title: 'Search Lumen', text: 'Type in the search box above to find videos and channels.' }));
    return;
  }
  const videos = await getPublicVideos();
  if (!ctx.isActive()) return;

  const channels = type === 'all' || type === 'channel' ? searchChannels(allChannels(), q) : [];
  const vids = type === 'channel' ? [] : searchVideos(videos, q, { sort, type, channelName });
  const total = channels.length + vids.length;

  if (!total) {
    mount(results, emptyState({ iconName: 'search', title: 'No results found', text: 'Try different keywords, fewer words, or remove filters.' }));
    return;
  }
  mount(results,
    h('p', { class: 'muted', role: 'status' }, `${total} result${total === 1 ? '' : 's'}`),
    channels.map((c) => h('article', { class: 'channel-result' },
      h('a', { href: `#/channel/${encodeURIComponent(c.id)}`, class: 'channel-result-avatar', tabindex: '-1', aria: { hidden: 'true' } }, avatar({ initial: c.initial, color: c.color, size: 96 })),
      h('div', {},
        h('h2', {}, h('a', { href: `#/channel/${encodeURIComponent(c.id)}` }, c.name)),
        h('p', { class: 'muted' }, `${c.handle} • ${formatCount(c.subscribers)} subscribers`),
        h('p', { class: 'card-desc' }, c.about)))),
    h('div', { class: 'video-list' }, vids.map((v) => videoCard(v, { layout: 'row' }))));
}
