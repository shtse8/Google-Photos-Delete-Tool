<div align="center">

# 🗑️ Google Photos Delete Tool

### ⚡ The fastest way to bulk delete your Google Photos

[![CI](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/ci.yml/badge.svg)](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/ci.yml)
[![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/jiahfbbfpacpolomdjlpdpiljllcdenb)](https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb)
[![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/jiahfbbfpacpolomdjlpdpiljllcdenb)](https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb)
[![Chrome Web Store Rating](https://img.shields.io/chrome-web-store/rating/jiahfbbfpacpolomdjlpdpiljllcdenb)](https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/shtse8/Google-Photos-Delete-Tool?style=social)](https://github.com/shtse8/Google-Photos-Delete-Tool)

**[Install](#-installation)** · **[Features](#-features)** · **[Performance](#-performance)** · **[Configuration](#-configuration)** · **[FAQ](#-faq)** · **[Contributing](#-contributing)**

</div>

---

## 📖 Overview

A powerful, efficient tool to bulk delete photos from Google Photos. Choose the method that works best for you — **Chrome extension**, **userscript**, **bookmarklet**, or **script injection**.

Unlike manual deletion or timer-based scripts, this tool uses intelligent selector-based awaiting for optimal performance and reliability across all network conditions.

---

## ✨ Features

- 🎯 **Smart Selection** — Selector-based awaiting instead of unreliable timers
- 🔄 **Auto-Scrolling** — Automatically processes your entire library
- 📦 **Batch Processing** — Deletes up to 10,000 photos per run
- ⚡ **Blazing Fast** — Up to 25x faster than manual deletion
- 📊 **Live Stats** — Real-time progress, speed, and deletion count
- 🛑 **Start/Stop** — Full control at any time
- 💪 **Resilient** — Graceful error handling and recovery
- 🔧 **Configurable** — Set limits via popup UI or config
- 🌗 **Dark UI** — Minimal, non-intrusive floating panel (userscript)

---

## 📦 Installation

### Method 1: Chrome Extension ⭐ Recommended

Install directly from the Chrome Web Store:

**[➡️ Install from Chrome Web Store](https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb)**

1. Click the link above → **Add to Chrome**
2. Navigate to [photos.google.com](https://photos.google.com/?hl=en)
3. Click the extension icon → **Start** 🎉

<details>
<summary>Manual installation (Developer mode)</summary>

```bash
git clone https://github.com/shtse8/Google-Photos-Delete-Tool.git
cd Google-Photos-Delete-Tool
bun install && bun run build
```

1. Open `chrome://extensions/` → Enable **Developer mode**
2. Click **Load unpacked** → Select the `dist/extension` folder
3. Navigate to Google Photos → Click the extension icon → **Start**

</details>

---

### Method 2: Userscript (Tampermonkey / Violentmonkey)

Install with your favourite userscript manager:

**[➡️ Install Userscript](https://github.com/shtse8/Google-Photos-Delete-Tool/releases/latest/download/google-photos-delete.user.js)**

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. Click the link above — your userscript manager will prompt to install
3. Navigate to [photos.google.com](https://photos.google.com/?hl=en)
4. A floating control panel appears in the bottom-right corner → **Start** 🎉

The userscript auto-updates when new releases are published.

---

### Method 3: Bookmarklet

No extensions needed — works in any modern browser.

1. Download [`bookmarklet.txt`](https://github.com/shtse8/Google-Photos-Delete-Tool/releases/latest/download/bookmarklet.txt) from the latest release
2. Create a new bookmark in your browser
3. Paste the contents of `bookmarklet.txt` as the bookmark **URL**
4. Navigate to [photos.google.com](https://photos.google.com/?hl=en) → Click the bookmark

> **Tip**: Or open [`bookmarklet.html`](dist/bookmarklet.html) after building and drag the link to your bookmarks bar.

---

### Method 4: Script Injection (Console Paste)

For one-off use or quick testing.

1. Navigate to [photos.google.com](https://photos.google.com/?hl=en)
2. Open DevTools (`F12` or `Ctrl+Shift+I`) → **Console** tab
3. Copy the contents of [`inject.js`](https://github.com/shtse8/Google-Photos-Delete-Tool/releases/latest/download/inject.js) and paste into the console
4. Press **Enter** 🚀

> **Stop early**: Run `window.__gpdt_stop()` in the console.

<details>
<summary>📋 Step-by-step with screenshots</summary>

#### Step 1: Sign in to Google
![Google Account Sign-in Page](images/google-signin-page.jpg)

#### Step 2: Go to Google Photos
![Google Photos Page](images/google-photos-page.jpg)

#### Step 3: Open Developer Tools
Press `Ctrl+Shift+I` or `F12`, or right-click → **Inspect**.

![Chrome Developer Tools Menu](images/chrome-menu-popup.jpg)

#### Step 4: Open Console Tab
![Chrome Console](images/chrome-console.jpg)

#### Step 5: Paste & Run
![Code in Console](images/code-in-console.jpg)

</details>

---

## 📊 Performance

### Speed Comparison

| Method | Photos/Minute | Relative Speed |
|--------|--------------|----------------|
| 🐌 Manual Deletion | ~20 | 1x |
| 📜 Average Script | ~100 | 5x |
| ⚡ **This Tool** | **~500*** | **25x** |

<sub>*Actual performance varies based on network and hardware</sub>

### Key Metrics

- **Batch Size**: Up to 10,000 photos per operation
- **Success Rate**: >99% with automatic retry
- **Resource Usage**: Low CPU/memory via smart polling
- **API Efficiency**: Minimised calls to avoid rate limiting

### 🚀 Performance Tip: Block Images

For massive speed improvements, block image loading on Google Photos:

1. Click the **padlock icon** in the address bar
2. Go to **Site settings** → **Images** → **Block**
3. Reload Google Photos

<div align="center">
  <img src="images/image_block.png" alt="Block images in Chrome" width="600">
</div>

This dramatically reduces CPU, RAM, and network usage.

---

## ⚙️ Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `maxCount` | `10,000` | Maximum photos to delete per run |
| `timeout` | `600,000` ms | Timeout for waiting operations |
| `pollDelay` | `300` ms | Delay between poll attempts |

**Chrome extension**: Configure via the popup UI.
**Script / Userscript**: Edit the config in the source or pass options to `DeleteEngine`.

---

## ❓ FAQ

<details>
<summary><b>Is this tool safe to use?</b></summary>

Yes, but always exercise caution with bulk deletions. Make sure you have backups of important photos. The tool interacts only with Google Photos' public web interface — no API keys or OAuth required.
</details>

<details>
<summary><b>Can I recover deleted photos?</b></summary>

Yes! Google Photos keeps deleted items in the **Trash for 60 days**. You can restore them anytime within this period.
</details>

<details>
<summary><b>Why does the script pause or slow down?</b></summary>

This can happen due to network latency or Google's rate limiting. The tool handles this gracefully and continues automatically.
</details>

<details>
<summary><b>How many photos can I delete at once?</b></summary>

By default, the limit is 10,000 photos per run. You can change this in the extension popup or config.
</details>

<details>
<summary><b>Does this work on mobile?</b></summary>

No. Desktop browsers only — mobile browsers don't support the required developer features.
</details>

<details>
<summary><b>Will this delete photos from my device?</b></summary>

No. It only deletes from Google Photos cloud storage. Local photos on your device are not affected.
</details>

<details>
<summary><b>The tool says "Photo container not found"</b></summary>

Make sure you're on the English version of Google Photos: [photos.google.com/?hl=en](https://photos.google.com/?hl=en). Google may also update their UI, which can temporarily break selectors — check for updates.
</details>

---

## 🛠️ Development

### Setup

```bash
git clone https://github.com/shtse8/Google-Photos-Delete-Tool.git
cd Google-Photos-Delete-Tool
bun install
bun run build
bun run typecheck
```

### Project Structure

```
src/
├── core/               Shared deletion engine
│   ├── config.ts           Default configuration
│   ├── selectors.ts        Google Photos CSS selectors
│   ├── delete-engine.ts    Core logic
│   ├── utils.ts            Helpers (sleep, waitUntil, $, $$)
│   └── index.ts            Barrel export
├── extension/          Chrome extension (MV3)
│   ├── manifest.json
│   ├── background.ts
│   ├── content.ts
│   └── popup/              Popup UI (html, css, ts)
├── standalone/         Console injection script
│   └── inject.ts
├── userscript/         Tampermonkey / Violentmonkey
│   └── google-photos-delete.user.ts
└── bookmarklet/        Bookmarklet HTML template
    └── template.html
```

### Build Outputs

```
dist/
├── extension/          → Load as unpacked extension
├── standalone/
│   └── inject.js       → Paste into DevTools console
├── userscript/
│   └── google-photos-delete.user.js  → Install in Tampermonkey
├── bookmarklet.txt     → Bookmark URL
└── bookmarklet.html    → Draggable bookmark page
```

### Scripts

| Command | Description |
|---------|-------------|
| `bun run build` | Build all targets |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | ESLint |
| `bun run release` | Bump version with standard-version |
| `bun run zip` | Create extension ZIP for Chrome Web Store |

### Releasing

```bash
bun run release        # Bumps version, creates git tag
git push --follow-tags # GitHub Actions builds & publishes
```

---

## 🤝 Contributing

Contributions are welcome!

- 🐛 [Report bugs](https://github.com/shtse8/Google-Photos-Delete-Tool/issues)
- 💡 [Suggest features](https://github.com/shtse8/Google-Photos-Delete-Tool/issues)
- 🔧 [Submit pull requests](https://github.com/shtse8/Google-Photos-Delete-Tool/pulls)
- ⭐ Star this repo if you find it useful!

---

## ⚠️ Disclaimer

- **Use responsibly** — always verify what you're deleting
- **Backup first** — ensure important photos are saved elsewhere
- **UI changes** — Google may update their interface, requiring selector updates
- **Not affiliated** with Google
- **No liability** — developers are not responsible for data loss or account issues

---

## 🔒 Privacy

This tool runs entirely in your browser. It does not collect, transmit, or store any personal data. No analytics, no telemetry, no third-party services.

See the [Privacy Policy](PRIVACY.md) if applicable.

---

## 📄 License

MIT © [Kyle Tse](https://github.com/shtse8)

See [LICENSE](LICENSE) for details.

---

<div align="center">

**💖 Found this helpful? Give it a ⭐ and share it!**

</div>
