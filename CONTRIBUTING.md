# Contributing to Lumen

Thanks for helping! Lumen deliberately has **no dependencies and no build step**, so please keep it that way.

## Getting started

1. Open the repository in a GitHub Codespace (or any machine with Python 3).
2. Start the server: `python3 -m http.server 8000`.
3. Open the preview for port 8000. Open `/tests/` to run the unit tests.

## Guidelines

- **Plain web platform only.** Use HTML, CSS and JavaScript ES modules. No npm packages, frameworks or bundlers, and only system fonts.
- **Security.** Never pass user text to `innerHTML`. Use the `h()` helper from `src/js/utils.js` (strings become text nodes), and use `escapeHTML()` when generating markup such as SVG. Don't add inline scripts or `style` attributes in HTML strings, because the Content-Security-Policy blocks them.
- **Structure.** Each page is a module in `src/js/views/` that exports a render function taking `ctx` (`outlet`, `params`, `query`, `setMeta`, `onCleanup`, `isActive`). Register new routes in `src/js/app.js`. Put shared UI in `src/js/components/`.
- **Async renders.** After any `await` in a view, check `ctx.isActive()` before touching the DOM, in case the user has already navigated away.
- **Accessibility.** Use semantic elements and label every control. Keep focus visible, make sure everything works with the keyboard, and check color contrast in both themes.
- **Paths.** Keep every path relative (no leading `/`) so GitHub Pages subfolder hosting keeps working.
- **Tests.** Add or update tests in `tests/tests.js` for logic changes, and make sure `/tests/` shows 0 failures.
- **Style.** Follow `.editorconfig`: 2-space indent, LF line endings, semicolons and single quotes. Keep comments short and useful.

## Pull requests

- Keep each PR focused on one change and describe what changed and why.
- Before you open the PR, check light and dark mode, a phone-sized window and keyboard navigation.
- Add an entry to `CHANGELOG.md` under "Unreleased".
