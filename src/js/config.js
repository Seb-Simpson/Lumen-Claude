// Backend configuration.
//
// When both values are set, Lumen stores accounts, uploads, comments, likes,
// subscriptions and playlists in Supabase so everyone shares them.
// Leave them empty to run in browser-only demo mode (everything stays in
// this browser's storage).
//
// Both values are PUBLIC by design: the publishable key only allows what the
// database's Row Level Security rules allow (see supabase/setup.sql).
// Never put a "secret" or "service_role" key here.
//
// If you change SUPABASE_URL, also update the Content-Security-Policy in
// index.html (connect-src, img-src and media-src).

export const SUPABASE_URL = 'https://mnbyhvymukcekgldxcfb.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_-ldMVnN_9c5kILtuVbRO0w_Vz42LxXe';

/** Maximum upload size in Supabase mode (the free plan allows 50 MB per file). */
export const REMOTE_MAX_UPLOAD = 50 * 1024 * 1024;
