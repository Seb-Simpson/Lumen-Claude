# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
