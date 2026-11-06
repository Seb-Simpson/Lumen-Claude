// Hash-based router (#/watch/abc?t=10). Works on static hosts like GitHub
// Pages because the server only ever serves index.html.

const routes = [];
let current = { token: 0, cleanups: [] };
let outletEl = null;
let notFoundHandler = null;
const afterHooks = [];

/** Compile '/watch/:id' into a matcher. Exported for tests. */
export function matchRoute(pattern, path) {
  const pParts = pattern.split('/').filter(Boolean);
  const parts = path.split('/').filter(Boolean);
  if (pParts.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(':')) {
      try { params[pParts[i].slice(1)] = decodeURIComponent(parts[i]); } catch { return null; }
    } else if (pParts[i] !== parts[i]) return null;
  }
  return params;
}

/** Split a hash like '#/search?q=a' into { path, query }. */
export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path.startsWith('/') ? path : `/${path}`, query: new URLSearchParams(qs) };
}

export function route(pattern, handler) { routes.push({ pattern, handler }); }
export function notFound(handler) { notFoundHandler = handler; }
export function afterEach(fn) { afterHooks.push(fn); }

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (replace) history.replaceState(null, '', target);
  else if (location.hash === target) resolve();
  else location.hash = target;
  if (replace) resolve();
}

export const currentPath = () => parseHash(location.hash).path;

function setMeta(title, description) {
  document.title = title ? `${title} - Lumen` : 'Lumen — Watch, share and discover videos';
  const desc = document.querySelector('meta[name="description"]');
  if (desc && description) desc.setAttribute('content', description);
  const og = document.querySelector('meta[property="og:title"]');
  if (og) og.setAttribute('content', document.title);
}

export async function resolve() {
  const { path, query } = parseHash(location.hash);
  current.cleanups.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  const token = current.token + 1;
  current = { token, cleanups: [] };

  let match = null;
  for (const r of routes) {
    const params = matchRoute(r.pattern, path);
    if (params) { match = { ...r, params }; break; }
  }
  const handler = match ? match.handler : notFoundHandler;
  const ctx = {
    outlet: outletEl,
    params: match ? match.params : {},
    query,
    path,
    setMeta,
    onCleanup: (fn) => current.cleanups.push(fn),
    /** False once the user has navigated away (guards async renders). */
    isActive: () => current.token === token,
  };
  outletEl.replaceChildren();
  outletEl.removeAttribute('aria-busy');
  window.scrollTo(0, 0);
  try {
    await handler(ctx);
  } catch (err) {
    console.error(err);
    if (ctx.isActive()) {
      outletEl.replaceChildren();
      const p = document.createElement('p');
      p.className = 'page';
      p.textContent = 'Something went wrong while loading this page. Please try again.';
      outletEl.append(p);
    }
  }
  if (ctx.isActive()) afterHooks.forEach((fn) => fn(ctx));
}

export function start(outlet) {
  outletEl = outlet;
  window.addEventListener('hashchange', resolve);
  if (!location.hash) history.replaceState(null, '', '#/');
  resolve();
}
