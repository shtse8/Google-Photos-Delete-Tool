# Changelog

All notable changes to this project will be documented in this file.

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
