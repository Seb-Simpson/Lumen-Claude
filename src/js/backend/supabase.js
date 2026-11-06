// Tiny Supabase client built on fetch (no SDK, no build step).
// Covers what Lumen needs: email/password auth with token refresh,
// PostgREST table queries, RPC calls and Storage uploads with progress.

export class SupabaseError extends Error {
  constructor(message, { status = 0, code = '', details = '' } = {}) {
    super(message);
    this.name = 'SupabaseError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Turn Supabase/PostgREST/GoTrue error bodies into friendly messages. */
export function friendlyError(status, body = {}) {
  const raw = String(body.msg || body.message || body.error_description || body.error || '').trim();
  const code = String(body.code || body.error_code || '');
  const lower = raw.toLowerCase();
  let message = raw || `Request failed (${status})`;
  if (status === 0) message = 'Can\'t reach the server. Check your internet connection and try again.';
  else if (code === 'user_already_exists' || lower.includes('already registered')) message = 'An account with that email already exists. Try signing in.';
  else if (code === 'invalid_credentials' || lower.includes('invalid login credentials')) message = 'Incorrect email or password.';
  else if (code === 'weak_password' || lower.includes('password should')) message = 'That password is too weak. Use at least 8 characters.';
  else if (code === 'email_address_invalid' || lower.includes('email address') && lower.includes('invalid')) message = 'That email address isn\'t valid.';
  else if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) message = 'Too many attempts. Please wait a minute and try again.';
  else if (lower.includes('database error saving new user')) message = 'That username is taken or invalid. Try another one.';
  else if (code === '23505') message = 'That already exists.';
  else if (code === '23514') message = 'Some of the details aren\'t allowed (too long, empty or invalid).';
  else if (code === '42501' || status === 403 || lower.includes('row-level security')) message = 'You don\'t have permission to do that.';
  else if (status === 413 || lower.includes('maximum allowed size') || lower.includes('payload too large')) message = 'That file is too large for the server (50 MB maximum).';
  else if (lower.includes('mime type') || lower.includes('invalid_mime_type')) message = 'That file type isn\'t allowed.';
  else if (lower.includes('jwt expired')) message = 'Your session expired. Please sign in again.';
  return new SupabaseError(message, { status, code, details: raw });
}

/** Encode a storage object path, keeping the slashes. */
export const encodePath = (path) => String(path).split('/').map(encodeURIComponent).join('/');

/** Build a PostgREST "in" filter value: in.("a","b"). */
export function inList(values) {
  return `in.(${values.map((v) => `"${String(v).replace(/["\\]/g, '\\$&')}"`).join(',')})`;
}

export function createClient(url, key, { storage, sessionKey = 'sbSession', onAuthChange } = {}) {
  const base = url.replace(/\/+$/, '');
  let session = storage?.get(sessionKey) || null;
  let refreshing = null;

  const saveSession = (s) => {
    session = s;
    if (s) storage?.set(sessionKey, s); else storage?.remove(sessionKey);
    onAuthChange?.(s);
  };

  const withExpiry = (s) => ({ ...s, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600) });

  async function raw(path, { method = 'GET', headers = {}, body, auth = true } = {}) {
    const h = { apikey: key, ...headers };
    if (auth && session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    let res;
    try {
      res = await fetch(base + path, { method, headers: h, body });
    } catch {
      throw friendlyError(0);
    }
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = text; } }
    if (!res.ok) throw friendlyError(res.status, typeof data === 'object' && data ? data : { message: text });
    return { data, res };
  }

  /** Refresh the access token if it expires within 60 seconds. */
  async function ensureFresh() {
    if (!session?.refresh_token) return;
    if (session.expires_at && session.expires_at - 60 > Date.now() / 1000) return;
    if (!refreshing) {
      refreshing = raw('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', auth: false, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      }).then(({ data }) => saveSession(withExpiry(data)))
        .catch((err) => { if (err.status >= 400 && err.status < 500) saveSession(null); throw err; })
        .finally(() => { refreshing = null; });
    }
    await refreshing;
  }

  async function request(path, opts = {}) {
    if (opts.auth !== false) await ensureFresh().catch(() => {});
    return raw(path, opts);
  }

  const json = (obj) => ({ 'Content-Type': 'application/json', body: JSON.stringify(obj) });

  const client = {
    url: base,
    get session() { return session; },
    get userId() { return session?.user?.id || null; },

    auth: {
      async signUp({ email, password, data }) {
        const { body, ...h } = json({ email, password, data });
        const { data: res } = await raw('/auth/v1/signup', { method: 'POST', auth: false, headers: h, body });
        if (!res?.access_token) {
          throw new SupabaseError('Check your email to confirm your account, then sign in.', { code: 'confirmation_required' });
        }
        saveSession(withExpiry(res));
        return res.user;
      },
      async signIn({ email, password }) {
        const { body, ...h } = json({ email, password });
        const { data: res } = await raw('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, headers: h, body });
        saveSession(withExpiry(res));
        return res.user;
      },
      async signOut() {
        const had = session;
        saveSession(null);
        if (had?.access_token) {
          await fetch(`${base}/auth/v1/logout`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${had.access_token}` } }).catch(() => {});
        }
      },
      ensureFresh,
    },

    /** PostgREST: GET /rest/v1/<table>?<query> */
    async select(table, query = '') {
      const { data } = await request(`/rest/v1/${table}?${query}`);
      return data || [];
    },
    async insert(table, rows, { returning = true, upsert = false, onConflict } = {}) {
      const prefer = [returning ? 'return=representation' : 'return=minimal'];
      if (upsert) prefer.push('resolution=merge-duplicates');
      const q = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
      const { data } = await request(`/rest/v1/${table}${q}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: prefer.join(',') }, body: JSON.stringify(rows),
      });
      return data;
    },
    async update(table, filter, patch) {
      const { data } = await request(`/rest/v1/${table}?${filter}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(patch),
      });
      return data || [];
    },
    async remove(table, filter) {
      const { data } = await request(`/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      return data || [];
    },
    async rpc(fn, args = {}) {
      const { data } = await request(`/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
      return data;
    },

    storage: {
      publicUrl: (bucket, path) => `${base}/storage/v1/object/public/${bucket}/${encodePath(path)}`,
      /** Upload a file with progress (0–1). Uses XHR because fetch has no upload progress. */
      async upload(bucket, path, file, { onProgress, contentType } = {}) {
        await ensureFresh().catch(() => {});
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${base}/storage/v1/object/${bucket}/${encodePath(path)}`);
          xhr.setRequestHeader('apikey', key);
          if (session?.access_token) xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
          xhr.setRequestHeader('Content-Type', contentType || file.type || 'application/octet-stream');
          xhr.setRequestHeader('x-upsert', 'false');
          // Short cache: on the free plan the CDN keeps serving a deleted file until this expires.
          xhr.setRequestHeader('cache-control', 'max-age=300');
          xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
          xhr.onload = () => {
            let body = {};
            try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* not JSON */ }
            if (xhr.status >= 200 && xhr.status < 300) resolve(body);
            else reject(friendlyError(Number(body.statusCode) || xhr.status, body));
          };
          xhr.onerror = () => reject(friendlyError(0));
          xhr.send(file);
        });
      },
      async remove(bucket, paths) {
        if (!paths.length) return;
        await request(`/storage/v1/object/${bucket}`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }),
        });
      },
    },
  };
  return client;
}
