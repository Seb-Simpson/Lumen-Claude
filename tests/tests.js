// Minimal in-browser test runner + Lumen unit tests. No Node required.
// Results are also exposed on window.__TEST_RESULTS__ for headless runs.

import { escapeHTML, formatCount, formatViews, formatDuration, timeAgo, debounce, h } from '../src/js/utils.js';
import { createStore, memoryStorage } from '../src/js/store.js';
import { tokenize, searchVideos, sortVideos, searchChannels } from '../src/js/search.js';
import { createAuth, hashPassword, generateSalt, validateSignup } from '../src/js/auth.js';
import { matchRoute, parseHash } from '../src/js/router.js';
import { validateVideoFile, MAX_BYTES } from '../src/js/views/upload.js';
import { thumbnailSVG, wrapTitle } from '../src/js/data/thumbs.js';
import { SEED_VIDEOS, CHANNELS, seedComments, LIVE_NOTE } from '../src/js/data/seed.js';
import { createLibrary, validatePlaylistName, MAX_PLAYLIST_NAME } from '../src/js/library.js';
import { createClient, friendlyError, inList, encodePath } from '../src/js/backend/supabase.js';
import { isUuid } from '../src/js/backend/remote.js';

const tests = [];
const test = (group, name, fn) => tests.push({ group, name, fn });
const assert = (cond, msg = 'Assertion failed') => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg ? `${msg}: ` : ''}expected ${sb}, got ${sa}`);
};
const rejects = async (p, re) => {
  try { await p; } catch (e) { if (re && !re.test(e.message)) throw new Error(`Wrong error: ${e.message}`); return; }
  throw new Error('Expected promise to reject');
};

/* ---------- Escaping & DOM safety ---------- */
test('Escaping', 'escapes HTML special characters', () => {
  eq(escapeHTML(`<script>alert("x")</script> & 'y'`), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
});
test('Escaping', 'handles null/undefined/numbers', () => {
  eq(escapeHTML(null), ''); eq(escapeHTML(undefined), ''); eq(escapeHTML(42), '42');
});
test('Escaping', 'h() renders strings as text, not markup', () => {
  const el = h('p', {}, '<img src=x onerror=alert(1)>');
  eq(el.children.length, 0, 'no child elements');
  eq(el.textContent, '<img src=x onerror=alert(1)>');
});
test('Escaping', 'thumbnail SVG escapes titles', () => {
  const svg = thumbnailSVG({ id: 'x', title: '</text><script>alert(1)</script>', category: 'Music' });
  assert(!svg.includes('<script>'), 'raw script tag leaked into SVG');
  assert(svg.includes('&lt;script&gt;'));
});

/* ---------- Formatting ---------- */
test('Formatting', 'formatCount abbreviates', () => {
  eq([0, 999, 1000, 1234, 15_500, 999_999, 1_000_000, 2_560_000, 3_200_000_000].map(formatCount),
    ['0', '999', '1K', '1.2K', '15.5K', '999.9K', '1M', '2.5M', '3.2B']);
});
test('Formatting', 'formatViews pluralizes', () => {
  eq(formatViews(1), '1 view'); eq(formatViews(0), '0 views'); eq(formatViews(1500), '1.5K views');
});
test('Formatting', 'formatDuration', () => {
  eq([0, 5, 65, 600, 3599, 3600, 3661, -3, NaN].map(formatDuration), ['0:00', '0:05', '1:05', '10:00', '59:59', '1:00:00', '1:01:01', '0:00', '0:00']);
});
test('Formatting', 'timeAgo', () => {
  const now = Date.parse('2026-06-01T00:00:00Z');
  const ago = (s) => timeAgo(now - s * 1000, now);
  eq(ago(10), 'just now');
  eq(ago(60), '1 minute ago');
  eq(ago(3 * 3600), '3 hours ago');
  eq(ago(86400), '1 day ago');
  eq(ago(14 * 86400), '2 weeks ago');
  eq(ago(65 * 86400), '2 months ago');
  eq(ago(400 * 86400), '1 year ago');
  eq(timeAgo('not a date', now), '');
});
test('Formatting', 'debounce runs once with the last args', async () => {
  const calls = [];
  const d = debounce((x) => calls.push(x), 20);
  d(1); d(2); d(3);
  await new Promise((r) => setTimeout(r, 50));
  eq(calls, [3]);
});
test('Formatting', 'wrapTitle limits lines', () => {
  const lines = wrapTitle('one two three four five six seven eight nine ten eleven twelve', 10, 3);
  eq(lines.length, 3);
  assert(lines[2].endsWith('…'));
});

/* ---------- Store ---------- */
test('Store', 'get/set/update/remove with JSON values', () => {
  const s = createStore(memoryStorage());
  eq(s.get('missing', 'fb'), 'fb');
  s.set('a', { x: 1 }); eq(s.get('a'), { x: 1 });
  s.update('n', (v) => v + 1, 0); s.update('n', (v) => v + 1, 0); eq(s.get('n'), 2);
  s.remove('a'); eq(s.get('a'), null);
});
test('Store', 'emits change events', () => {
  const s = createStore(memoryStorage());
  const seen = [];
  const off = s.on('k', (v) => seen.push(v));
  s.on('*', (v, k) => seen.push(`*${k}`));
  s.set('k', 1); off(); s.set('k', 2);
  eq(seen, [1, '*k', '*k']);
});
test('Store', 'reports quota errors instead of throwing', () => {
  const full = { ...memoryStorage(), getItem: () => null, setItem: () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); } };
  const s = createStore(full);
  let err = null;
  s.on('error', (e) => { err = e; });
  eq(s.set('x', 1), false);
  assert(err && err.quota, 'quota flag set');
});
test('Store', 'ignores corrupt JSON', () => {
  const m = memoryStorage(); m.setItem('lumen:bad', '{not json');
  eq(createStore(m).get('bad', 'fallback'), 'fallback');
});
test('Store', 'removeWhere clears by prefix', () => {
  const s = createStore(memoryStorage());
  s.set('data:u1:a', 1); s.set('data:u1:b', 2); s.set('data:u2:a', 3);
  s.removeWhere('data:u1:');
  eq([s.get('data:u1:a'), s.get('data:u1:b'), s.get('data:u2:a')], [null, null, 3]);
});

/* ---------- Search & sort ---------- */
const sample = [
  { id: 'a', title: 'Learn CSS Grid', description: 'layout tutorial', tags: ['css'], category: 'Coding', views: 10, createdAt: '2026-01-01', channelId: 'c1' },
  { id: 'b', title: 'Grid Strategy Games', description: 'top picks', tags: ['games'], category: 'Gaming', views: 500, createdAt: '2026-03-01', channelId: 'c2' },
  { id: 'c', title: 'Rocket science', description: 'css not included', tags: [], category: 'Science', views: 50, createdAt: '2026-02-01', channelId: 'c1', live: true },
];
test('Search', 'tokenize lowercases and strips accents', () => {
  eq(tokenize('  Café, CSS-Grid! '), ['cafe', 'css', 'grid']);
});
test('Search', 'all tokens must match', () => {
  eq(searchVideos(sample, 'css grid').map((v) => v.id), ['a']);
});
test('Search', 'relevance ranks title matches above description matches', () => {
  eq(searchVideos(sample, 'css').map((v) => v.id), ['a', 'c']);
});
test('Search', 'sort by views and date', () => {
  eq(searchVideos(sample, 'grid', { sort: 'views' }).map((v) => v.id), ['b', 'a']);
  eq(sortVideos(sample, 'date').map((v) => v.id), ['b', 'c', 'a']);
});
test('Search', 'type filter live/video', () => {
  eq(searchVideos(sample, '', { type: 'live' }).map((v) => v.id), ['c']);
  eq(searchVideos(sample, '', { type: 'video' }).length, 2);
});
test('Search', 'matches channel names', () => {
  eq(searchVideos(sample, 'acme', { channelName: (id) => (id === 'c2' ? 'Acme Plays' : '') }).map((v) => v.id), ['b']);
});
test('Search', 'searchChannels', () => {
  eq(searchChannels([{ name: 'Byte Sized', handle: '@bytesized' }, { name: 'Orbit', handle: '@orbit' }], 'byte').length, 1);
  eq(searchChannels([{ name: 'X', handle: '@x' }], '').length, 0);
});

/* ---------- Auth ---------- */
test('Auth', 'hashPassword is deterministic per salt and differs across salts', async () => {
  const a = await hashPassword('hunter22', 'salt1');
  eq(a, await hashPassword('hunter22', 'salt1'));
  assert(a !== await hashPassword('hunter22', 'salt2'), 'salt changes hash');
  assert(/^[0-9a-f]{64}$/.test(a), 'hex sha-256');
});
test('Auth', 'hash equals SHA-256 of "salt:password"', async () => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('s:p'));
  const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  eq(await hashPassword('p', 's'), hex);
});
test('Auth', 'generateSalt is random hex', () => {
  const a = generateSalt(), b = generateSalt();
  assert(/^[0-9a-f]{32}$/.test(a) && a !== b);
});
test('Auth', 'validateSignup rules', () => {
  eq(Object.keys(validateSignup({ username: 'ab', displayName: '', password: 'short', confirm: 'x' })).sort(), ['confirm', 'displayName', 'password', 'username']);
  eq(validateSignup({ username: 'good_name', displayName: 'Good', password: 'longenough', confirm: 'longenough' }), {});
});
test('Auth', 'sign up never stores the plain password', async () => {
  const storage = memoryStorage();
  const auth = createAuth(createStore(storage));
  await auth.signUp({ username: 'alice', displayName: 'Alice', password: 'correct horse', confirm: 'correct horse' });
  const raw = storage.getItem('lumen:users');
  assert(!raw.includes('correct horse'), 'plain text found in storage');
  const rec = JSON.parse(raw).alice;
  assert(rec.salt && rec.hash && rec.hash !== 'correct horse');
  eq(auth.currentUser().username, 'alice');
  assert(!('hash' in auth.currentUser()), 'hash not exposed to UI');
});
test('Auth', 'log in / log out / wrong password / duplicate user', async () => {
  const auth = createAuth(createStore(memoryStorage()));
  await auth.signUp({ username: 'bob', displayName: 'Bob', password: 'password1', confirm: 'password1' });
  auth.logOut();
  eq(auth.currentUser(), null);
  await rejects(auth.logIn('bob', 'nope-nope'), /Incorrect/);
  await rejects(auth.logIn('nobody', 'password1'), /Incorrect/);
  await auth.logIn('BOB', 'password1');
  eq(auth.currentUser().displayName, 'Bob');
  await rejects(auth.signUp({ username: 'bob', displayName: 'B2', password: 'password2', confirm: 'password2' }), /taken/);
});
test('Auth', 'updateProfile validates input', async () => {
  const auth = createAuth(createStore(memoryStorage()));
  await auth.signUp({ username: 'cara', displayName: 'Cara', password: 'password1', confirm: 'password1' });
  auth.updateProfile({ displayName: 'Cara D', bio: 'hi', initial: 'z', color: '#123abc' });
  const u = auth.currentUser();
  eq([u.displayName, u.bio, u.initial, u.color], ['Cara D', 'hi', 'Z', '#123abc']);
  let threw = false;
  try { auth.updateProfile({ color: 'red;background:url(x)' }); } catch { threw = true; }
  assert(threw, 'invalid color rejected');
});

/* ---------- Router ---------- */
test('Router', 'matchRoute extracts params', () => {
  eq(matchRoute('/watch/:id', '/watch/abc%20d'), { id: 'abc d' });
  eq(matchRoute('/watch/:id', '/watch'), null);
  eq(matchRoute('/', '/'), {});
  eq(matchRoute('/search', '/channel'), null);
});
test('Router', 'parseHash splits path and query', () => {
  const { path, query } = parseHash('#/search?q=hello%20world&sort=date');
  eq(path, '/search'); eq(query.get('q'), 'hello world'); eq(query.get('sort'), 'date');
  eq(parseHash('').path, '/');
});

/* ---------- Upload validation ---------- */
test('Upload', 'validateVideoFile', () => {
  eq(validateVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 1000 }), '');
  eq(validateVideoFile({ name: 'a.webm', type: 'video/webm', size: MAX_BYTES }), '');
  assert(validateVideoFile({ name: 'a.mov', type: 'video/quicktime', size: 10 }).includes('MP4'));
  assert(validateVideoFile({ name: 'a.mp4', type: 'video/mp4', size: MAX_BYTES + 1 }).includes('500 MB'));
  assert(validateVideoFile({ name: 'a.mp4', type: 'video/mp4', size: 0 }).includes('empty'));
  assert(validateVideoFile(null).length > 0);
});

/* ---------- Seed data ---------- */
test('Seed data', 'at least 24 videos across 8+ channels', () => {
  assert(SEED_VIDEOS.length >= 24, `only ${SEED_VIDEOS.length} videos`);
  assert(new Set(SEED_VIDEOS.map((v) => v.channelId)).size >= 8);
  const ids = new Set(CHANNELS.map((c) => c.id));
  assert(SEED_VIDEOS.every((v) => ids.has(v.channelId)), 'every video has a channel');
  eq(new Set(SEED_VIDEOS.map((v) => v.id)).size, SEED_VIDEOS.length, 'unique ids');
});
test('Seed data', 'seed comments are deterministic', () => {
  eq(seedComments('v-aurora'), seedComments('v-aurora'));
  assert(seedComments('v-aurora').length >= 2);
  eq(seedComments('123e4567-e89b-42d3-a456-426614174000'), [], 'uploads get no fake comments');
});

test('Seed data', 'every video has its own description; live ones are labelled', () => {
  assert(SEED_VIDEOS.every((v) => v.description && !v.description.startsWith('undefined')), 'missing summary');
  eq(new Set(SEED_VIDEOS.map((v) => v.description)).size, SEED_VIDEOS.length, 'descriptions are unique');
  assert(SEED_VIDEOS.filter((v) => v.live).every((v) => v.description.includes(LIVE_NOTE)), 'live note');
  assert(SEED_VIDEOS.filter((v) => !v.live).every((v) => !v.description.includes(LIVE_NOTE)));
});

/* ---------- Playlists ---------- */
const freshLibrary = (user = 'u1') => {
  const s = createStore(memoryStorage());
  let who = user;
  const lib = createLibrary(s, () => who);
  return { lib, switchUser: (u) => { who = u; } };
};
test('Playlists', 'validatePlaylistName trims and limits length', () => {
  eq(validatePlaylistName('  Road   trip  '), { name: 'Road trip' });
  assert(validatePlaylistName('   ').error);
  assert(validatePlaylistName('x'.repeat(MAX_PLAYLIST_NAME + 1)).error);
  eq(validatePlaylistName('x'.repeat(MAX_PLAYLIST_NAME)).name.length, MAX_PLAYLIST_NAME);
});
test('Playlists', 'create, add, toggle, remove', () => {
  const { lib } = freshLibrary();
  const pl = lib.createPlaylist('Favourites', 'v1');
  eq(lib.getPlaylist(pl.id).videoIds, ['v1']);
  eq(lib.togglePlaylistVideo(pl.id, 'v2'), true);
  eq(lib.togglePlaylistVideo(pl.id, 'v2'), false);
  lib.togglePlaylistVideo(pl.id, 'v3');
  eq(lib.getPlaylist(pl.id).videoIds, ['v1', 'v3']);
  lib.removeFromPlaylist(pl.id, 'v1');
  eq(lib.getPlaylist(pl.id).videoIds, ['v3']);
  eq(lib.playlistsWith('v3'), [pl.id]);
  eq(lib.playlistsWith('v1'), []);
});
test('Playlists', 'newest playlist first, rename and delete', () => {
  const { lib } = freshLibrary();
  const a = lib.createPlaylist('A');
  const b = lib.createPlaylist('B');
  eq(lib.playlists().map((p) => p.id), [b.id, a.id]);
  eq(lib.renamePlaylist(a.id, '  Renamed ').name, 'Renamed');
  let threw = false; try { lib.renamePlaylist(a.id, ''); } catch { threw = true; }
  assert(threw, 'empty rename rejected');
  lib.deletePlaylist(b.id);
  eq(lib.playlists().map((p) => p.name), ['Renamed']);
  threw = false; try { lib.togglePlaylistVideo(b.id, 'v1'); } catch { threw = true; }
  assert(threw, 'editing a deleted playlist throws');
});
test('Playlists', 'reorder and next-video lookup', () => {
  const { lib } = freshLibrary();
  const pl = lib.createPlaylist('Order');
  ['a', 'b', 'c'].forEach((v) => lib.togglePlaylistVideo(pl.id, v));
  lib.moveInPlaylist(pl.id, 'c', -1);
  eq(lib.getPlaylist(pl.id).videoIds, ['a', 'c', 'b']);
  lib.moveInPlaylist(pl.id, 'a', -1); // already first: no-op
  lib.moveInPlaylist(pl.id, 'b', 1);  // already last: no-op
  eq(lib.getPlaylist(pl.id).videoIds, ['a', 'c', 'b']);
  eq(lib.nextInPlaylist(pl.id, 'a'), 'c');
  eq(lib.nextInPlaylist(pl.id, 'b'), null);
  eq(lib.nextInPlaylist(pl.id, 'zzz'), null);
});
test('Playlists', 'are private to each user', () => {
  const { lib, switchUser } = freshLibrary('alice');
  lib.createPlaylist('Alice only');
  switchUser('bob');
  eq(lib.playlists(), []);
  switchUser('alice');
  eq(lib.playlists().length, 1);
});

/* ---------- Supabase client ---------- */
/** Swap globalThis.fetch for a fake while fn runs; returns the recorded calls. */
async function withFakeFetch(responder, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, ...opts });
    const { status = 200, body = [] } = await responder(url, opts, calls.length);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  try { await fn(calls); } finally { globalThis.fetch = real; }
  return calls;
}
test('Supabase', 'friendlyError maps common errors to plain English', () => {
  assert(/already exists/.test(friendlyError(422, { code: 'user_already_exists', msg: 'User already registered' }).message));
  assert(/Incorrect email or password/.test(friendlyError(400, { error_code: 'invalid_credentials' }).message));
  assert(/username is taken/.test(friendlyError(500, { msg: 'Database error saving new user' }).message));
  assert(/permission/.test(friendlyError(403, { message: 'new row violates row-level security policy' }).message));
  assert(/internet connection/.test(friendlyError(0).message));
  assert(/50 MB/.test(friendlyError(413, { message: 'Payload too large' }).message));
});
test('Supabase', 'inList quotes values; encodePath keeps folders', () => {
  eq(inList(['a', 'b"c']), 'in.("a","b\\"c")');
  eq(encodePath('user id/my file.mp4'), 'user%20id/my%20file.mp4');
  assert(isUuid('123e4567-e89b-42d3-a456-426614174000') && !isUuid('v-aurora'));
});
test('Supabase', 'select sends apikey, and the user token only when signed in', async () => {
  const st = createStore(memoryStorage());
  const calls = await withFakeFetch(() => ({ body: [{ id: 1 }] }), async () => {
    const c = createClient('https://x.supabase.co/', 'pub_key', { storage: st });
    eq(await c.select('videos', 'select=id'), [{ id: 1 }]);
    st.set('sbSession', { access_token: 'tok', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600, user: { id: 'u1' } });
    const c2 = createClient('https://x.supabase.co', 'pub_key', { storage: st });
    await c2.select('videos');
    eq(c2.userId, 'u1');
  });
  eq(calls[0].url, 'https://x.supabase.co/rest/v1/videos?select=id');
  eq(calls[0].headers.apikey, 'pub_key');
  assert(!calls[0].headers.Authorization, 'no token for guests');
  eq(calls[1].headers.Authorization, 'Bearer tok');
});
test('Supabase', 'expired session is refreshed before the request', async () => {
  const st = createStore(memoryStorage());
  st.set('sbSession', { access_token: 'old', refresh_token: 'r1', expires_at: 1, user: { id: 'u1' } });
  const calls = await withFakeFetch((url) => (url.includes('grant_type=refresh_token')
    ? { body: { access_token: 'new', refresh_token: 'r2', expires_in: 3600, user: { id: 'u1' } } }
    : { body: [] }), async () => {
    const c = createClient('https://x.supabase.co', 'k', { storage: st });
    await c.select('profiles');
  });
  assert(calls[0].url.endsWith('/auth/v1/token?grant_type=refresh_token'), 'refreshed first');
  eq(calls[1].headers.Authorization, 'Bearer new');
  eq(st.get('sbSession').refresh_token, 'r2');
});
test('Supabase', 'sign-in failure gives a friendly error and keeps you signed out', async () => {
  const st = createStore(memoryStorage());
  await withFakeFetch(() => ({ status: 400, body: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }), async () => {
    const c = createClient('https://x.supabase.co', 'k', { storage: st });
    await rejects(c.auth.signIn({ email: 'a@b.co', password: 'nope' }), /Incorrect email or password/);
    eq(c.userId, null);
  });
});
test('Supabase', 'library mirrors changes to the server only when signed in', async () => {
  const s = createStore(memoryStorage());
  let who = 'guest';
  const seen = [];
  const hooks = {
    rate: (id, v) => seen.push(['rate', id, v]),
    subscribe: (id, on) => seen.push(['sub', id, on]),
    playlistCreate: (p) => seen.push(['plc', p.name]),
    playlistUpdate: (p) => seen.push(['plu', p.videoIds.length]),
    playlistDelete: (id) => seen.push(['pld', typeof id]),
    commentLike: () => Promise.reject(new Error('offline')),
    onError: (err, name) => seen.push(['err', name, err.message]),
  };
  const lib = createLibrary(s, () => who, hooks);
  lib.rate('v1', 1);
  eq(seen, [], 'guests are not synced');
  who = 'u1';
  lib.rate('v1', 1); lib.rate('v1', 1); lib.toggleSubscribe('c1');
  const pl = lib.createPlaylist('Mix'); lib.togglePlaylistVideo(pl.id, 'v1'); lib.deletePlaylist(pl.id);
  lib.toggleCommentLike('x');
  await new Promise((r) => setTimeout(r, 0));
  eq(seen, [['rate', 'v1', 1], ['rate', 'v1', 0], ['sub', 'c1', true], ['plc', 'Mix'], ['plu', 1], ['pld', 'string'], ['err', 'commentLike', 'offline']]);
  assert(isUuid(pl.id), 'playlist ids are UUIDs so the server accepts them');
});
test('Supabase', 'hydrate replaces the signed-in user\'s data', () => {
  const lib = createLibrary(createStore(memoryStorage()), () => 'u1');
  lib.hydrate({ ratings: { v1: 1, v2: -1 }, subs: ['c1'], commentLikes: { k: true }, playlists: [{ id: 'p', name: 'P', videoIds: ['v1'], createdAt: 1, updatedAt: 1 }] });
  eq([lib.rating('v1'), lib.rating('v2'), lib.likedIds(), lib.subscriptions(), lib.commentLiked('k'), lib.playlists().length], [1, -1, ['v1'], ['c1'], true, 1]);
});
test('Upload', 'Supabase mode uses a 50 MB limit', () => {
  const f = { name: 'a.mp4', type: 'video/mp4', size: 60 * 1024 * 1024 };
  eq(validateVideoFile(f), '');
  assert(validateVideoFile(f, 50 * 1024 * 1024).includes('50 MB'));
});

/* ---------- Runner ---------- */
(async () => {
  const list = document.getElementById('results');
  let pass = 0, fail = 0, lastGroup = '';
  const failures = [];
  for (const t of tests) {
    if (t.group !== lastGroup) { list.append(h('li', { class: 'group' }, t.group)); lastGroup = t.group; }
    try {
      await t.fn();
      pass++;
      list.append(h('li', { class: 'pass' }, `✓ ${t.name}`));
    } catch (e) {
      fail++;
      failures.push(`${t.group} › ${t.name}: ${e.message}`);
      list.append(h('li', { class: 'fail' }, `✗ ${t.name}`, h('span', { class: 'err' }, e.message)));
    }
  }
  const summary = document.getElementById('summary');
  summary.textContent = `${pass} passed, ${fail} failed (${tests.length} total)`;
  summary.className = fail ? 'fail' : 'pass';
  document.title = `${fail ? '✗' : '✓'} Lumen tests`;
  window.__TEST_RESULTS__ = { pass, fail, failures };
})();
