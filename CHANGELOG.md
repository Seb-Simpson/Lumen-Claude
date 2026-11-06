# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.0] - 2026-11-06

### Fixed
- Like buttons were confusing: the thumb icon looked filled whether or not you'd liked something, so a like from someone else looked like your own. Now an outline thumb means "not liked" and a filled, coloured thumb means "you liked this" (videos and comments).
- You can now reply to the built-in sample comments in database mode. This needs `supabase/setup.sql` to be re-run once, which adds a `seed_parent_id` column.
- In database mode, liking a video or comment asks you to sign in, so guest likes aren't silently kept in one browser.

## [1.2.0] - 2026-11-06

### Added
- Database mode with Supabase. Real accounts (email and password), plus shared uploads, comments, replies, likes, subscriptions and playlists that work on any device. Built with a small fetch-based client, so there's still no npm.
- `supabase/setup.sql` with tables, storage buckets and Row Level Security rules, a plain-language setup guide, and 62 tests of the rules.
- A Report button on uploaded videos, a delete button for your own comments (and for comments on your videos), and upload progress for real network uploads.
- Privacy, Terms, About and Help text for database mode.

### Fixed
- Uploaded videos no longer show made-up sample comments.
- Reply threads start open only when they contain your own reply.

## [1.1.0] - 2026-11-06

### Added
- Playlists: create from the watch page, plus a Playlists page, a playlist page (rename, reorder, remove, delete), "Play all" with a side panel, continuous playback and a Library shelf.
- Continuous integration: `tests/run-headless.sh` runs the browser tests in headless Chrome (no npm). The workflow tests every push and pull request and deploys only after tests pass.

### Changed
- Each sample video now has its own description, and the fake chapter lists are gone.
- "Live" items are labelled "Live demo" and explain that they are recorded clips.
- Sample clips are re-encoded with their caption at the top, clear of the player controls.

## [1.0.0] - 2026-11-06

### Added
- First release of Lumen, a dependency-free video sharing site.
- Hash router that sets the title and meta description for each page.
- Home grid with category chips, "Load more", skeletons and empty states.
- Watch page with a custom player (keyboard shortcuts, speed, volume, full screen, resume position, autoplay), likes, subscriptions, sharing, Watch later, an expandable description, threaded comments and Up next.
- Search with relevance, date and view sorting and type filters, plus debounced suggestions.
- Channel pages with banner, About tab and subscribe button.
- Upload (drag and drop, validation, progress, IndexedDB storage) and a Studio page to edit and delete videos.
- Demo accounts with salted SHA-256 password hashing, plus profile editing.
- Library: History, Liked, Watch later and Subscriptions feed.
- Settings for theme, default speed, autoplay and clearing history.
- About, Privacy, Terms and Help pages, a shortcuts dialog and a 404 page.
- 27 seed videos across 9 channels, with generated SVG thumbnails and bundled sample clips.
- Browser test runner (`/tests/`), devcontainer and GitHub Pages workflow.
