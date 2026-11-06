# Lumen

Lumen is a video sharing website in the style of YouTube, built with plain HTML, CSS and JavaScript. It has no dependencies and no build step. You can run it in a GitHub Codespace, publish it for free with GitHub Pages, and connect it to a free Supabase database so people can share videos with each other.

**Live site:** https://seb-simpson.github.io/Lumen-Claude/

## Two modes

Lumen runs in one of two modes, chosen by `src/js/config.js`:

| | **Database mode** (this site) | **Browser-only demo mode** |
| --- | --- | --- |
| Turned on by | `SUPABASE_URL` and `SUPABASE_KEY` filled in | Both values left empty |
| Accounts | Real accounts (email and password) handled by Supabase Auth | Demo accounts in this browser only (salted SHA-256; not real security) |
| Uploads, comments, likes, subscriptions, playlists | Stored in Supabase and **shared with everyone**, on any device | Stored only in this browser |
| Upload size | 50 MB (Supabase free plan) | 500 MB (browser storage permitting) |
| Watch history, Watch later, settings | This browser | This browser |

Setting up database mode takes about 5 minutes in the browser. See **[supabase/README.md](supabase/README.md)**.

## Features

- **Home:** a responsive grid of videos, category chips (All, Music, Gaming, Science, Coding, Sports, Live), a "Load more" button, loading skeletons and empty states.
- **Watch:** a custom video player with play/pause, a seek bar, volume, speed, full screen and keyboard shortcuts. The page also has like/dislike, subscribe, share (copies the link), save to Watch later or to a playlist, an expandable description, comments with one level of replies and comment likes, an "Up next" list, remembered playback position and optional autoplay.
- **Search:** results sorted by relevance, upload date or view count, with filters for All, Videos, Live and Channels. The header search box shows suggestions as you type, after a short pause.
- **Channels:** a banner, avatar, subscriber count, subscribe button, and Videos and About tabs.
- **Upload and Studio:** drag and drop an MP4 or WebM file (up to 500 MB), and add a thumbnail, title, description, category and visibility. A progress bar shows the upload. Studio lists your videos so you can edit or delete them.
- **Accounts:** sign up, sign in, sign out, and edit your profile (display name, bio, avatar initial and color).
- **Library:** History, Liked videos, Watch later and a Subscriptions feed.
- **Playlists:** create playlists from any video, then rename them, reorder or remove videos, or delete them. "Play all" plays a playlist in order: a side panel shows your place, and the next video starts on its own when one ends.
- **Settings:** theme (light, dark or follow your device), default playback speed, autoplay, and a button to clear your watch history.
- **Pages:** About, Privacy, Terms and Help, a keyboard shortcuts dialog (press `?`), and a styled 404 page.

## Run it in a Codespace (step by step)

You only need a web browser. Nothing gets installed on your computer.

1. Open this repository on GitHub.
2. Click the green **Code** button, open the **Codespaces** tab, then click **Create codespace on main**.
3. Wait a minute while the Codespace starts. The included `.devcontainer` starts the web server for you (`python3 -m http.server 8000`) in a terminal.
4. A **preview** of port 8000 should open on its own. If it doesn't:
   - open the **Ports** tab at the bottom of the screen,
   - find port **8000** ("Lumen preview"),
   - click the globe icon to open it in a new browser tab.
5. If the server isn't running, open a terminal (**Terminal → New Terminal**) and type:
   ```bash
   python3 -m http.server 8000
   ```
6. To run the unit tests, add `/tests/` to the end of the preview address, for example `https://…-8000.app.github.dev/tests/`. The page shows how many tests passed. GitHub also runs these tests automatically (see below).

To stop the server, click in its terminal and press `Ctrl + C`.

## Publish with GitHub Pages

The workflow in `.github/workflows/pages.yml` has two jobs:

- **test** runs on every push and pull request. It checks that every file is served, then runs the unit tests in headless Chrome using `tests/run-headless.sh`, with no npm needed.
- **deploy** publishes the site, but only for `main` and only when the tests pass. A failing test stops a broken version from going live.

You need to turn Pages on once:

1. On GitHub, open the repository and go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab. If the "Test and deploy" run failed before you turned Pages on, open it and click **Re-run all jobs**. You can also push any new commit.
4. When the run turns green, your site is live at `https://<your-username>.github.io/<repository-name>/`. For this repository that is https://seb-simpson.github.io/Lumen-Claude/.

All paths in the site are relative, so it works from a subfolder such as `/Lumen-Claude/`. If you rename the repository or use a custom domain, update the absolute URLs in `index.html` (the canonical, Open Graph and Twitter tags), `robots.txt` and `sitemap.xml`.

## Project structure

```
index.html              App shell, SEO tags, Content-Security-Policy
404.html                Self-contained "page not found" page for GitHub Pages
manifest.webmanifest    Web app manifest
robots.txt, sitemap.xml
assets/                 Favicon, app icons, social image, sample videos
src/css/                base.css (theme tokens), layout.css, components.css, pages.css
src/js/
  app.js                Entry point: registers routes and global shortcuts
  router.js             Hash router (#/watch/abc) that updates the title and meta description
  store.js              localStorage wrapper with events, quota handling and an in-memory fallback
  config.js             Supabase URL and publishable key (empty = browser-only mode)
  backend/supabase.js   Tiny Supabase client on fetch: auth with token refresh, tables, storage uploads
  backend/remote.js     Lumen's shared data in Supabase (profiles, videos, comments, reactions, reports)
  auth.js               Accounts: Supabase Auth, or demo accounts (salted SHA-256) in browser-only mode
  db.js                 IndexedDB storage for uploads in browser-only mode
  library.js            Per-user history, likes, watch later, subscriptions, playlists, playback positions
  videos.js             Combines seed videos and uploads into one catalog; channel lookup
  search.js             Search and sort functions (no DOM, so they're easy to test)
  theme.js              Light, dark and system themes
  utils.js              Escaping, the safe h() element builder, formatting, debounce
  data/seed.js          27 sample videos, 9 channels and seed comments
  data/thumbs.js        Generated SVG thumbnails and banners
  components/           Header and sidebar (shell.js), player, comments, video card, icons, ui helpers
  views/                One file per page
tests/                  Browser test runner (open /tests/); run-headless.sh runs it in CI
supabase/               setup.sql (tables, storage, security rules), setup guide, and tests of the rules
```

## Decisions and notes

- **Repository.** The brief asked for a repository called `lumen`. This workspace already had **`Seb-Simpson/Lumen-Claude`** cloned, so the project lives there. The Pages URL is therefore `/Lumen-Claude/`.
- **Sample videos are hosted in the repository.** The brief suggested Google's public sample bucket (`commondatastorage.googleapis.com/gtv-videos-bucket`). On 2026-11-06 that bucket answered **403 AccessDenied** to every request, so the videos would never play. Instead, `assets/videos/` holds six short original clips generated with ffmpeg (about 3.6 MB in total). They are MIT licensed like the rest of the project and are served from the same origin, so they work offline and on Pages. To use remote videos, change `SAMPLE_SOURCES` in `src/js/data/seed.js` and add the video host to `media-src` in the CSP.
- **Seeking with Python's server.** `python3 -m http.server` doesn't support HTTP Range requests, and browsers need those to seek in a video. To work around this, the player downloads small same-origin clips as a Blob first. Uploads already play from Blobs.
- **No `innerHTML` for user text.** All UI is built with the `h()` helper, which adds strings as text nodes. Text inside generated SVGs is XML-escaped. The only markup-like strings are static icon paths.
- **CSP.** `script-src 'self'` with no inline scripts. The theme is applied before the first paint by a small external script, `src/js/theme-init.js`. `404.html` has to work at any URL depth, so it inlines its style and a script that is allowed by its SHA-256 hash.
- **Accessibility.** The site has a skip link, landmarks, labelled controls, visible focus rings and live regions for toasts and player status. Focus moves to each new page's heading on navigation, menus work with the arrow keys and Esc, and dialogs use the native `<dialog>` element. The color tokens were chosen for WCAG AA contrast in both themes, and `prefers-reduced-motion` turns animations off.
- **"Live" videos are labelled as demos.** There is no streaming server, so items in the Live category are recorded clips. Cards say "Live demo", and the description explains it.
- **Playlists always play through.** Inside a playlist the next video starts even when Autoplay is off, because "Play all" asks for that. Playlists are private to each account on the browser.
- **Database without npm.** The Supabase client in `src/js/backend/supabase.js` is about 200 lines of plain `fetch`, not the official SDK, so the project still needs no npm. The publishable key in `config.js` is meant to be public. All protection comes from the Row Level Security rules in `supabase/setup.sql`, which are checked by 62 tests (`supabase/tests/`).
- **What's shared and what isn't.** Accounts, uploads, comments, likes, subscriptions and playlists live in Supabase. Watch history, Watch later, playback positions and settings stay in each browser, so they're private and fast, and they don't use any database quota. Built-in sample videos stay in the site's files, but people's comments and likes on them are shared.
- **Short CDN caching for uploads.** Uploaded files are cached for 5 minutes. On Supabase's free plan, the content delivery network keeps serving a file until its cache time runs out, even after it's deleted, so a long cache would keep deleted videos watchable.
- **Seed numbers.** View counts, likes and dates in the sample data are fixed fake values. Views you add are counted per browser.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `?` | Show shortcuts |
| `/` | Focus search |
| `Space` / `K` | Play / pause |
| `←` / `→` | Seek 5 s |
| `J` / `L` | Seek 10 s |
| `↑` / `↓` | Volume |
| `M` | Mute |
| `F` | Full screen |
| `0`–`9` | Jump to 0–90% |
| `<` / `>` | Slower / faster |

## Known limitations

**Database mode**
- **Free plan limits.** Each upload can be up to 50 MB, with about 1 GB of file storage in total. The Supabase project pauses after 7 days without visits. You can restore it with one click in the dashboard, and nothing is lost.
- **No password reset yet.** Password reset emails aren't set up. The site owner can reset or delete accounts in the Supabase dashboard.
- **Private videos aren't fully secret.** Private and unlisted videos are hidden from lists and search, and their details are protected by the database. But the video file itself sits in a public bucket under a random, unguessable name, so someone who already has the exact file link can still play it. Fixing this needs a private bucket with signed links.
- **No rate limits or automatic moderation.** You moderate reports and remove content yourself (see [supabase/README.md](supabase/README.md#moderating-content)).
- **No video processing.** Videos play exactly as uploaded: there's no transcoding and there are no quality options.

**Browser-only mode**
- **Nothing is shared.** All data stays in one browser. Other people can't see your uploads or comments, and clearing your site data deletes everything.
- **Demo-only authentication.** Hashing in the browser stops passwords from being stored in plain text, but anyone with access to the device can read or change the data. Passwords can't be reset.
- **Browser storage limits.** Large uploads can go over your browser's storage quota. When that happens, Lumen shows an error message. In some private browsing modes IndexedDB isn't available, so uploads only last until you close the tab.

**Both modes**
- **Hash URLs** (`#/watch/…`) don't get indexed as separate pages by search engines, and link previews show the site-wide Open Graph tags.
- **No real live streaming.** "Live" videos are recorded clips, labelled as demos.
- The duration of an upload is only shown if your browser can read the file's metadata.

## Database setup and next steps

- **Set up or rebuild the database:** follow [supabase/README.md](supabase/README.md). It covers creating the project, running `setup.sql`, the two settings to change, and moderating content.
- **Use a different Supabase project:** put its URL and publishable key in `src/js/config.js`, and replace the Supabase address in the Content-Security-Policy in `index.html` (`connect-src`, `img-src` and `media-src`).
- **Go back to browser-only mode:** set both values in `src/js/config.js` to `''`.

Ideas for later:
1. **Password reset and email confirmation.** Connect your own email service under Supabase → Authentication → Emails, turn "Confirm email" back on, and add a "Forgot password" page that uses `/auth/v1/recover`.
2. **Truly private videos.** Move private uploads to a private bucket and play them through short-lived signed links.
3. **Video processing.** Transcode uploads to HLS with several quality levels (for example Mux or Cloudflare Stream) and generate thumbnails automatically.
4. **Security hardening.** Host the site somewhere that can send HTTP headers, so the CSP can include `frame-ancestors 'none'`, and add rate limits, for example with Supabase Edge Functions.
5. **Better links and SEO.** On a host that supports rewrites, switch to History API URLs (`/watch/abc`) and render pages on the server for link previews.

## License

[MIT](LICENSE)
