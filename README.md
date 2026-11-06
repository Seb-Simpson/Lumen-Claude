# Lumen

Lumen is a video sharing website in the style of YouTube, built with plain HTML, CSS and JavaScript. It has no dependencies, no build step and no server code. You can run it in a GitHub Codespace and publish it for free with GitHub Pages.

**Live site:** https://seb-simpson.github.io/Lumen-Claude/ (works once Pages is turned on; see [Publish with GitHub Pages](#publish-with-github-pages)).

> **Demo only.** Accounts, comments, likes and uploads are saved **only in your browser** (localStorage and IndexedDB). Passwords are salted and hashed with SHA-256, but this is **not** real security, because there is no server. Don't reuse a real password.

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
  auth.js               Demo accounts (SHA-256 with a per-user salt, via Web Crypto)
  db.js                 IndexedDB storage for uploads, with an in-memory fallback
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

- **No real backend.** All data stays in one browser. Other people can't see your uploads or comments, and clearing your site data deletes everything.
- **Demo-only authentication.** Hashing in the browser stops passwords from being stored in plain text, but anyone with access to the device can read or change the data. Passwords can't be reset.
- **Browser storage limits.** Large uploads can go over your browser's storage quota. When that happens, Lumen shows an error message. In some private browsing modes IndexedDB isn't available, so uploads only last until you close the tab.
- **Hash URLs** (`#/watch/…`) don't get indexed as separate pages by search engines, and link previews show the site-wide Open Graph tags.
- **No real live streaming.** "Live" videos are recorded clips, labelled as demos.
- The duration of an upload is only shown if your browser can read the file's metadata.

## Adding a real backend later

The data layer is kept in a few modules, so you can replace them without rewriting the pages:

1. **Auth (`src/js/auth.js`).** Replace it with calls to a real identity provider, such as Supabase Auth, Firebase Auth, Auth0 or your own server using sessions in HttpOnly cookies. Hash passwords on the server with a slow algorithm such as Argon2id or bcrypt, never in the browser. Keep the same `currentUser / logIn / signUp / logOut / updateProfile` functions.
2. **Videos (`src/js/videos.js`, `src/js/db.js`).** Upload files to object storage (S3, R2 or GCS) with pre-signed URLs. Then transcode them to HLS or DASH, for example with Mux, Cloudflare Stream or ffmpeg workers, and store the metadata in a database. `getPublicVideos`, `getVideo` and `saveUpload` become API calls.
3. **Library and comments (`src/js/library.js`, `src/js/components/comments.js`).** Move them to API endpoints. Keep the escaping rules and add server-side validation, rate limits and moderation.
4. **Security.** Send the CSP as an HTTP header instead of a meta tag, add `frame-ancestors 'none'`, protect cookie-based requests against CSRF, and update `connect-src` / `media-src` for your API and CDN hosts.
5. **Routing.** If you move to a host that supports rewrites, you can switch to History API URLs (`/watch/abc`) for better SEO, and render pages on the server for link previews.

## License

[MIT](LICENSE)
