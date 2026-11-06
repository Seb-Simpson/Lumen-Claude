import { h, mount } from '../utils.js';
import { getPublicVideos } from '../videos.js';
import { videoCard } from '../components/videoCard.js';
import { skeletonGrid, emptyState } from '../components/ui.js';
import { CATEGORIES } from '../data/seed.js';

const PAGE = 12;
const CHIPS = ['All', ...CATEGORIES, 'Live'];

export async function render(ctx) {
  const active = CHIPS.includes(ctx.query.get('c')) ? ctx.query.get('c') : 'All';
  ctx.setMeta(active === 'All' ? '' : `${active} videos`, 'Watch music, gaming, science, coding and sports videos on Lumen.');

  const chips = h('div', { class: 'chips', role: 'toolbar', aria: { label: 'Filter by category' } },
    CHIPS.map((c) => h('a', {
      class: `chip ${c === active ? 'active' : ''}`,
      href: c === 'All' ? '#/' : `#/?c=${encodeURIComponent(c)}`,
      aria: { current: c === active ? 'true' : null },
    }, c)));
  const results = h('div', { class: 'home-results', aria: { busy: 'true' } }, skeletonGrid(8));
  mount(ctx.outlet, h('div', { class: 'page home' }, h('h1', { class: 'visually-hidden', tabindex: '-1' }, 'Home'), chips, results));

  const all = await getPublicVideos();
  if (!ctx.isActive()) return;
  const list = all
    .filter((v) => active === 'All' || (active === 'Live' ? v.live : v.category === active))
    .sort((a, b) => (b.live - a.live) || new Date(b.createdAt) - new Date(a.createdAt));

  results.removeAttribute('aria-busy');
  if (!list.length) {
    mount(results, emptyState({
      title: `No ${active.toLowerCase()} videos yet`,
      text: 'Be the first to upload one, or try another category.',
      action: h('a', { class: 'btn btn-primary', href: '#/upload' }, 'Upload a video'),
    }));
    return;
  }

  const grid = h('div', { class: 'video-grid' });
  const more = h('button', { class: 'btn btn-secondary load-more', type: 'button' }, 'Load more');
  const status = h('p', { class: 'visually-hidden', role: 'status' });
  let shown = 0;
  const showMore = () => {
    const next = list.slice(shown, shown + PAGE);
    grid.append(...next.map((v) => videoCard(v)));
    if (shown > 0) {
      status.textContent = `Loaded ${next.length} more videos`;
      grid.children[shown]?.querySelector('.card-title')?.focus();
    }
    shown += next.length;
    more.hidden = shown >= list.length;
  };
  more.addEventListener('click', showMore);
  mount(results, grid, h('div', { class: 'load-more-wrap' }, more), status);
  showMore();
}
