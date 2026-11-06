// DEMO-ONLY authentication. Accounts live in this browser's localStorage.
// Passwords are hashed with SHA-256 and a random per-user salt (Web Crypto),
// so plain-text passwords are never stored — but this is NOT real security:
// anyone with access to the browser can read or edit the data. A real site
// must authenticate on a server (see README "Adding a real backend").

import { store as defaultStore } from './store.js';
import * as remote from './backend/remote.js';

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 8;
export const AVATAR_COLORS = ['#c2410c', '#b91c1c', '#7c3aed', '#1d4ed8', '#0f766e', '#15803d', '#a16207', '#be185d'];

const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export function generateSalt(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

export async function hashPassword(password, salt) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure hashing is unavailable. Open Lumen over https or localhost.');
  }
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

/** Constant-time-ish comparison of two hex strings. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function validateSignup({ username, displayName, password, confirm }) {
  const errors = {};
  const u = String(username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(u)) errors.username = 'Use 3–20 lowercase letters, numbers or underscores.';
  if (!String(displayName || '').trim()) errors.displayName = 'Enter a display name.';
  else if (String(displayName).trim().length > 40) errors.displayName = 'Keep it under 40 characters.';
  if (String(password || '').length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
  if (confirm !== undefined && confirm !== password) errors.confirm = 'Passwords do not match.';
  return errors;
}

/** Strip secrets before handing a user record to the UI. */
const publicUser = (u) => u && ({
  id: u.id, username: u.username, displayName: u.displayName, bio: u.bio || '',
  color: u.color, initial: u.initial, createdAt: u.createdAt,
});

export function createAuth(store) {
  const users = () => store.get('users', {});

  const auth = {
    currentUser() {
      const s = store.get('session');
      return s ? publicUser(users()[s.username]) || null : null;
    },
    currentUserId() {
      return auth.currentUser()?.id || 'guest';
    },
    getUser(username) {
      return publicUser(users()[String(username).toLowerCase()]) || null;
    },
    allUsers() {
      return Object.values(users()).map(publicUser);
    },
    async signUp({ username, displayName, password, confirm }) {
      const errors = validateSignup({ username, displayName, password, confirm });
      if (Object.keys(errors).length) throw Object.assign(new Error('Please fix the highlighted fields.'), { fields: errors });
      const name = username.trim().toLowerCase();
      if (users()[name]) throw Object.assign(new Error('That username is taken.'), { fields: { username: 'That username is taken.' } });
      const salt = generateSalt();
      const record = {
        id: `u-${name}`,
        username: name,
        displayName: displayName.trim(),
        bio: '',
        initial: displayName.trim()[0].toUpperCase(),
        color: AVATAR_COLORS[name.length % AVATAR_COLORS.length],
        salt,
        hash: await hashPassword(password, salt),
        createdAt: new Date().toISOString(),
      };
      if (!store.set('users', { ...users(), [name]: record })) throw new Error('Could not save your account (storage is full or blocked).');
      store.set('session', { username: name, at: Date.now() });
      return publicUser(record);
    },
    async logIn(username, password) {
      const record = users()[String(username || '').trim().toLowerCase()];
      // Hash even when the user is missing so timing doesn't reveal existence.
      const hash = await hashPassword(String(password || ''), record ? record.salt : 'missing');
      if (!record || !safeEqual(hash, record.hash)) throw new Error('Incorrect username or password.');
      store.set('session', { username: record.username, at: Date.now() });
      return publicUser(record);
    },
    logOut() {
      store.remove('session');
    },
    updateProfile(patch) {
      const me = auth.currentUser();
      if (!me) throw new Error('You need to be signed in.');
      const all = users();
      const rec = { ...all[me.username] };
      if (patch.displayName !== undefined) {
        const d = String(patch.displayName).trim();
        if (!d || d.length > 40) throw new Error('Display name must be 1–40 characters.');
        rec.displayName = d;
      }
      if (patch.bio !== undefined) rec.bio = String(patch.bio).slice(0, 500);
      if (patch.initial !== undefined) {
        const i = String(patch.initial).trim();
        if (!i) throw new Error('Avatar initial cannot be empty.');
        rec.initial = Array.from(i)[0].toUpperCase();
      }
      if (patch.color !== undefined) {
        if (!/^#[0-9a-f]{6}$/i.test(patch.color)) throw new Error('Pick a valid color.');
        rec.color = patch.color;
      }
      if (!store.set('users', { ...all, [me.username]: rec })) throw new Error('Could not save profile (storage is full or blocked).');
      store.set('session', store.get('session')); // notify listeners
      return publicUser(rec);
    },
  };
  return auth;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Real accounts backed by Supabase Auth (used when config.js is filled in).
 * Same interface as createAuth(), except sign-in uses an email address and
 * signUp/logIn/updateProfile talk to the server.
 */
export function createRemoteAuth(store, r = remote) {
  const auth = {
    remote: true,
    currentUser() {
      const id = r.sb.userId;
      if (!id) return null;
      return r.profileById(id) || store.get('sbProfile') || null;
    },
    currentUserId: () => r.sb.userId || 'guest',
    getUser: (username) => r.profileByUsername(username),
    allUsers: () => r.allProfiles(),
    async signUp({ email, username, displayName, password, confirm }) {
      const errors = validateSignup({ username, displayName, password, confirm });
      if (!EMAIL_RE.test(String(email || '').trim())) errors.email = 'Enter a valid email address.';
      if (Object.keys(errors).length) throw Object.assign(new Error('Please fix the highlighted fields.'), { fields: errors });
      const name = username.trim().toLowerCase();
      if (await r.usernameTaken(name)) throw Object.assign(new Error('That username is taken.'), { fields: { username: 'That username is taken.' } });
      const user = await r.sb.auth.signUp({
        email: email.trim(), password,
        data: { username: name, display_name: displayName.trim(), color: AVATAR_COLORS[name.length % AVATAR_COLORS.length] },
      });
      const profile = await r.loadProfile(user.id);
      if (profile) store.set('sbProfile', r.toUser(profile));
      store.set('session', { remote: true, id: user.id });
      return r.toUser(profile) || { id: user.id, username: name, displayName: displayName.trim() };
    },
    async logIn(email, password) {
      const user = await r.sb.auth.signIn({ email: String(email || '').trim(), password: String(password || '') });
      const profile = await r.loadProfile(user.id);
      if (profile) store.set('sbProfile', r.toUser(profile));
      store.set('session', { remote: true, id: user.id });
      return r.toUser(profile);
    },
    logOut() {
      store.remove('sbProfile');
      return r.sb.auth.signOut();
    },
    async updateProfile(patch) {
      if (!r.sb.userId) throw new Error('You need to be signed in.');
      const row = {};
      if (patch.displayName !== undefined) {
        const d = String(patch.displayName).trim();
        if (!d || d.length > 40) throw new Error('Display name must be 1–40 characters.');
        row.display_name = d;
      }
      if (patch.bio !== undefined) row.bio = String(patch.bio).slice(0, 500);
      if (patch.initial !== undefined) {
        const i = String(patch.initial).trim();
        if (!i) throw new Error('Avatar initial cannot be empty.');
        row.initial = Array.from(i)[0].toUpperCase();
      }
      if (patch.color !== undefined) {
        if (!/^#[0-9a-f]{6}$/i.test(patch.color)) throw new Error('Pick a valid color.');
        row.color = patch.color;
      }
      const user = await r.updateMyProfile(row);
      store.set('sbProfile', user);
      store.set('session', store.get('session')); // notify listeners
      return user;
    },
  };
  return auth;
}

export const auth = remote.REMOTE ? createRemoteAuth(defaultStore) : createAuth(defaultStore);
