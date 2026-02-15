# 🗑️ Google Photos Delete Tool

[![CI](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/ci.yml/badge.svg)](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/ci.yml)
[![Release](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/release.yml/badge.svg)](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/jiahfbbfpacpolomdjlpdpiljllcdenb?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb)

**The fastest way to bulk delete your Google Photos — up to 25× faster than manual deletion.**

Google Photos doesn't provide a "delete all" button. This tool automates the tedious process of selecting and deleting photos in batches, so you can reclaim your storage in minutes instead of hours.

---

## ✨ Features

- 🚀 **Batch Deletion** — Selects and deletes photos in large batches automatically
- ⏸️ **Pause / Resume / Stop** — Full three-state control over the deletion process
- 🧪 **Dry Run Mode** — Count your photos without deleting anything
- 📊 **Live Stats Dashboard** — Deletion count, rate per minute, elapsed time, and ETA
- 🌗 **Auto Dark / Light Mode** — Adapts to your system preference
- 🔄 **Resilient Selectors** — Fallback selectors when Google updates their UI
- 📈 **Smart Rate Tracking** — Sliding window rate calculation for accurate ETAs
- 🔁 **Exponential Backoff** — Intelligent retry logic for reliability
- 🧩 **Multiple Formats** — Chrome extension, userscript, bookmarklet, or console paste

## 📸 Screenshot

> *Coming soon — see `docs/screenshot.png`*

## 📦 Installation

### Chrome Extension (Recommended)

1. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb)
2. Navigate to [photos.google.com](https://photos.google.com/?hl=en)
3. Click the extension icon and press **Start**

### Manual Install (Developer Mode)

1. Download the latest `google-photos-delete-tool.zip` from [Releases](https://github.com/shtse8/Google-Photos-Delete-Tool/releases)
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the extracted folder
5. Navigate to [photos.google.com](https://photos.google.com/?hl=en)

### Userscript (Tampermonkey / Violentmonkey)

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. Download the latest [`google-photos-delete.user.js`](https://github.com/shtse8/Google-Photos-Delete-Tool/releases/latest/download/google-photos-delete.user.js)
3. Navigate to [photos.google.com](https://photos.google.com/?hl=en) — a floating panel will appear

### Bookmarklet

1. Download `bookmarklet.txt` from [Releases](https://github.com/shtse8/Google-Photos-Delete-Tool/releases)
2. Create a new bookmark in your browser
3. Paste the content as the bookmark URL
4. Navigate to [photos.google.com](https://photos.google.com/?hl=en) and click the bookmark

### Console (DevTools)

1. Navigate to [photos.google.com](https://photos.google.com/?hl=en)
2. Open DevTools (`F12` or `Ctrl+Shift+J`)
3. Copy the contents of [`inject.js`](https://github.com/shtse8/Google-Photos-Delete-Tool/releases/latest/download/inject.js) and paste into the console
4. Control with: `__gpdt_pause()`, `__gpdt_resume()`, `__gpdt_stop()`

## 🚀 Usage

### Chrome Extension

1. Go to [photos.google.com](https://photos.google.com/?hl=en)
2. Click the 🗑️ extension icon in your toolbar
3. Configure options:
   - **Max photos** — How many photos to delete (default: 10,000)
   - **Dry run** — Toggle to count photos without deleting
4. Click **▶ Start**
5. Watch the live stats: deletion count, rate, elapsed time, ETA
6. Use **⏸ Pause**, **▶ Resume**, or **⏹ Stop** as needed

### Userscript / Bookmarklet / Console

A floating panel or console output provides the same controls and stats.

## ⚙️ Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxCount` | `number` | `10,000` | Maximum photos to delete per run |
| `dryRun` | `boolean` | `false` | Count photos without deleting |
| `timeout` | `number` | `600,000` | Timeout for DOM operations (ms) |
| `pollDelay` | `number` | `300` | Delay between DOM polls (ms) |

## 🏗️ Development

### Prerequisites

- [Bun](https://bun.sh/) (package manager and runtime)
- [Node.js](https://nodejs.org/) 18+ (for TypeScript tooling)

### Setup

```bash
git clone https://github.com/shtse8/Google-Photos-Delete-Tool.git
cd Google-Photos-Delete-Tool
bun install
```

### Commands

```bash
bun run build       # Build all targets
bun run typecheck   # TypeScript type checking
bun run lint        # ESLint
bun run test        # Run tests (Vitest)
bun run test:watch  # Run tests in watch mode
bun run dev         # Build with watch mode
bun run zip         # Create extension ZIP for upload
```

### Build Targets

| Target | Output | Description |
|--------|--------|-------------|
| Chrome Extension | `dist/extension/` | MV3 extension with popup, content script, background worker |
| Standalone | `dist/standalone/inject.js` | Paste into DevTools console |
| Userscript | `dist/userscript/*.user.js` | Tampermonkey / Violentmonkey |
| Bookmarklet | `dist/bookmarklet.txt` | `javascript:` URL |
| Bookmarklet HTML | `dist/bookmarklet.html` | Draggable install page |

### Architecture

```
src/
├── core/                   # Shared engine (framework-agnostic)
│   ├── config.ts           # Configuration types and defaults
│   ├── delete-engine.ts    # Main deletion engine with EventEmitter
│   ├── deletion-log.ts     # Rate tracking and ETA estimation
│   ├── event-emitter.ts    # Typed EventEmitter (zero deps)
│   ├── selectors.ts        # DOM selectors with fallbacks
│   ├── utils.ts            # Sleep, waitUntil, retry, formatters
│   └── index.ts            # Barrel exports
├── extension/              # Chrome extension
│   ├── background.ts       # Service worker (badge, icon click)
│   ├── content.ts          # Content script (runs DeleteEngine)
│   ├── popup/              # Extension popup UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.ts
│   ├── manifest.json       # MV3 manifest
│   └── icons/              # Extension icons
├── standalone/inject.ts    # Console paste script
├── userscript/             # Tampermonkey/Violentmonkey
└── bookmarklet/            # Bookmarklet template
```

## ❓ FAQ

<details>
<summary><strong>Is this safe to use?</strong></summary>

Yes. The tool only automates clicks that you would normally do manually — selecting photos and clicking "Move to trash". Photos go to your Google Photos trash, where they remain for 60 days before permanent deletion. You can restore them anytime from trash.
</details>

<details>
<summary><strong>Why do I need this?</strong></summary>

Google Photos has no "Select All" or "Delete All" feature. To delete thousands of photos, you'd need to manually select them in batches of ~500 and delete each batch. This tool automates that process.
</details>

<details>
<summary><strong>What happens if Google updates their UI?</strong></summary>

The tool uses resilient selectors with fallbacks. If the primary CSS selector fails, it tries alternative selectors and logs a warning. If all selectors fail, the tool will stop gracefully with an error message.
</details>

<details>
<summary><strong>Can I undo a deletion?</strong></summary>

Yes! Deleted photos go to Google Photos trash and stay there for 60 days. Go to [photos.google.com/trash](https://photos.google.com/trash) to restore them.
</details>

<details>
<summary><strong>How fast is it?</strong></summary>

Typically 200–500 photos per minute, depending on your internet speed and Google's rate limiting. That's roughly 25× faster than manual selection and deletion.
</details>

<details>
<summary><strong>Does it work with Google One / shared storage?</strong></summary>

Yes. It deletes photos from whatever view you're currently on in Google Photos.
</details>

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run `bun run typecheck && bun run lint && bun run test && bun run build`
5. Commit with [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `refactor:`, etc.)
6. Open a Pull Request

## 📄 License

[MIT](LICENSE) © [Kyle Tse](https://github.com/shtse8)

## 🙏 Credits

Originally created by [mrishab](https://github.com/mrishab/google-photos-delete-tool). Forked, modernized, and maintained by [Kyle Tse](https://github.com/shtse8).
