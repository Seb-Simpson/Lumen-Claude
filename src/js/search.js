// Pure search and sort helpers (no DOM), so they are easy to unit test.

export const tokenize = (q) => String(q || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9#+]+/).filter(Boolean);

/** Score how well a video matches the query tokens. 0 means no match. */
export function scoreVideo(video, tokens, channelName = '') {
  if (!tokens.length) return 1;
  const title = video.title.toLowerCase();
  const desc = (video.description || '').toLowerCase();
  const tags = (video.tags || []).join(' ').toLowerCase();
  const chan = channelName.toLowerCase();
  const cat = (video.category || '').toLowerCase();
  let score = 0;
  for (const t of tokens) {
    let s = 0;
    if (title.includes(t)) s += title.split(/\W+/).includes(t) ? 5 : 3;
    if (tags.includes(t)) s += 2;
    if (chan.includes(t)) s += 2;
    if (cat === t) s += 2;
    if (desc.includes(t)) s += 1;
    if (!s) return 0; // every token must match somewhere
    score += s;
  }
  if (title.includes(tokens.join(' '))) score += 4; // phrase bonus
  return score;
}

export function sortVideos(list, sort = 'relevance') {
  const out = [...list];
  if (sort === 'date') out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  else if (sort === 'views') out.sort((a, b) => b.views - a.views);
  else out.sort((a, b) => (b._score || 0) - (a._score || 0) || b.views - a.views);
  return out;
}

/**
 * @param videos   normalized videos
 * @param query    free text
 * @param options  { sort: 'relevance'|'date'|'views', type: 'all'|'video'|'live', channelName: id => name }
 */
export function searchVideos(videos, query, { sort = 'relevance', type = 'all', channelName = () => '' } = {}) {
  const tokens = tokenize(query);
  const matches = [];
  for (const v of videos) {
    if (type === 'live' && !v.live) continue;
    if (type === 'video' && v.live) continue;
    const s = scoreVideo(v, tokens, channelName(v.channelId));
    if (s > 0) matches.push({ ...v, _score: s });
  }
  return sortVideos(matches, sort);
}

export function searchChannels(channels, query) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  return channels.filter((c) => {
    const hay = `${c.name} ${c.handle} ${c.about || ''}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}
