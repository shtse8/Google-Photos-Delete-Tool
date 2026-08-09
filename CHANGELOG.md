# Changelog

All notable changes to this project will be documented in this file.

## [3.0.0] - 2026-08-09

### Clean break (v3)

A clean-break rewrite: no backward compatibility, no residual legacy
behavior, no dual paths. One engine, one control panel, two surfaces
(extension + userscript), zero servers.

### Added
- Engine on an injected DOM adapter — the FULL run loop is now
  unit-testable (select → cap-flush → scroll → end-of-list →
  flush-last → stop/pause/error), selector/label/keyword coverage, i18n completeness.
- Abort-aware Stop: a stopped run resolves to `idle`, never `error`.
- Wave-based checkbox selection that can never re-click already-selected
  tiles (the old "checkbox flap" bug) plus counter-regression tracking.
- Counter fallback: when the selected-count element is missing or stale,
  the engine falls back to the rendered checked-tile count.
- Versioned, data-driven selector pack (`src/selector-packs/`) — a UI
  drift fix is a data patch, not code surgery.
- Self-diagnosing **Report issue** — a structured diagnostic blob (pack
  version, selector matches, counter fallback, flap recoveries, label
  samples) pre-fills a GitHub issue.
- **Consent gate** for every real (non-dry) run, enforced in the popup,
  panel, and content script.
- **Empty-trash with postcondition proof** — `done` only after the empty
  state is verified; already-empty trash resolves to done instead of error.
- Unified in-page runner + ONE shared floating panel for userscript and
  standalone (identical behavior, tested once). Honest stats: no
  fabricated progress %, no unmeasured ETA (ETA only after a dry-run
  total).
- **Pro** analysis layer: type filters (photo/video/screenshot/animation/
  collage) and dry-run report/CSV export via a locally-verified Ed25519
  license token (zero server, no account).
- Firefox MV3 extension variant (background.scripts, gecko id) derived
  from the same source manifest; Chrome/Firefox-safe API wrapper layer
  (`src/extension/api.ts`).
- Artifact verification gate (`bun run verify`): manifest/package version
  consistency, Firefox manifest shape, IIFE self-containment, no raw
  async `chrome.*` leaks in built extension code, userscript header, pack
  integrity. Unified zip for both stores.
- Live-run release gate protocol (`docs/RELEASE_GATE.md`).
- Popup rewrite: consent-first flow, Pro license field, type filter,
  utility actions (copy summary / CSV export / report issue), i18n across
  9 locales.

### Changed
- Extension permissions narrowed to `["storage"]` (`activeTab` removed).
- Content-script lifecycle fixed: Stop followed by eager Start can no
  longer create a second engine mid-click; cached progress hydrates a
  re-opened popup.
- README/PRIVACY/CHANGELOG rewritten with measured, truthful claims.

### Removed
- Bookmarklet and DevTools-console as product surfaces (their docs
  referenced `window.__gpdt_pause/resume/stop()` globals that did not
  exist in the code).
- Dead code: `Config.timeout`, `retryWithBackoff`,
  `DeletionLog.estimateRemaining`, `abort()` alias, `$`/`$$`, the
  unreachable dry-run branch in `deleteSelected`, the `toggle` message
  action, `vite.inject.config.ts`, `scripts/preview.ts`, legacy
  `images/`, the `docs/screenshot.png` reference.
- Misleading claims: "25× faster", "200–500/min", "maxCount default
  10,000".

### Security
- Every destructive action requires a positive multilingual label match
  (fail closed); confirm buttons are never guessed.
- Pending empty-trash flag: 3-minute TTL, always cleared on first sight,
  path-gated to `/trash`.
- Pro license keypair: the private key never enters the repository;
  verification is local Ed25519.

### Notes
- Chrome Web Store listing is live at v2.0.5; publishing v3 is a
  storefront handoff (`docs/CHROME_WEB_STORE_SETUP.md`).
- Firefox AMO listing and the Pro checkout are user-authority handoffs
  (`docs/PRO.md`).
- Live-run gate protocol: `docs/RELEASE_GATE.md`.

## [2.0.5] - 2026-06-17

### Fixed
- Pin Chrome Web Store release workflow to the compatible upload CLI after the latest CLI introduced a publisher ID requirement.

## [2.0.4] - 2026-06-17

### Fixed
- Update Chrome Web Store release workflow for the current upload CLI credential environment variables.

## [2.0.3] - 2026-06-17

### Fixed
- Prevent empty-trash follow-up when the delete run errors, stops, or deletes zero photos.
- Fix locale/diacritics normalization for multilingual Google Photos labels.
- Make destructive confirmation detection fail closed instead of guessing non-cancel buttons.
- Avoid contextual non-trash remove actions when finding the Google Photos delete toolbar button.

### Added
- Regression tests for destructive-action selector safety.

## [1.1.0] - 2026-02-14

### Added
- Chrome extension popup UI with progress bar and controls
- Userscript support (Tampermonkey/Violentmonkey/Greasemonkey)
- Bookmarklet support — one-click bookmark to start deletion
- TypeScript rewrite with shared core engine
- CI/CD: auto-publish to Chrome Web Store on release
- Proper icon sizes (16, 32, 48, 128)
- Badge shows deletion count in real-time
- Floating control panel for userscript with start/stop, stats, minimize

### Changed
- Migrated from raw JavaScript to TypeScript
- Unified core logic between all distribution formats
- Build system: Vite + custom build script
- All builds now run from a single `bun run build` command

### Fixed
- Content script now self-contained (no ES module imports that break in MV3)

## [1.0.0] - Initial Release

### Added
- Bulk delete photos from Google Photos via script injection
- Smart selector-based awaiting (no unreliable timers)
- Auto-scrolling through photo library
- Configurable batch size (up to 10,000 photos)
- Console-based progress reporting
