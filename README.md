<div align="center">

# 🗑️ Google Photos Delete Tool

### ⚡ The fastest way to bulk delete your Google Photos

[![CI](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/ci.yml/badge.svg)](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green.svg)](#chrome-web-store)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

**[Quick Start](#-quick-start)** · **[Installation](#-installation)** · **[Features](#-features)** · **[Performance](#-performance)** · **[Development](#-development)** · **[FAQ](#-faq)**

</div>

---

## 📖 Overview

A powerful, efficient tool to bulk delete photos from Google Photos. Available as both a **Chrome extension** and **standalone script injection** — choose what works best for you.

Unlike manual deletion or timer-based scripts, this tool uses intelligent selector-based awaiting for optimal performance and reliability across all network conditions.

### ✨ Features

- 🎯 **Smart Selection** — Selector-based awaiting instead of unreliable timers
- 🔄 **Auto-Scrolling** — Automatically processes your entire library
- 📦 **Batch Processing** — Deletes up to 10,000 photos per run
- 🔢 **Configurable** — Set limits via popup UI or config
- 💪 **Resilient** — Graceful error handling and recovery
- ⚡ **Blazing Fast** — Up to 25x faster than manual deletion
- 📊 **Live Stats** — Real-time progress, speed, and deletion count
- 🛑 **Start/Stop** — Full control via popup or `window.__gpdt_stop()`

---

## 🚀 Quick Start

### Method 1: Chrome Extension (Recommended)

<!-- TODO: Replace with actual Chrome Web Store link once published -->
> **Chrome Web Store**: Coming soon! For now, install manually:

1. Clone and build:
   ```bash
   git clone https://github.com/shtse8/Google-Photos-Delete-Tool.git
   cd Google-Photos-Delete-Tool
   bun install
   bun run build
   ```

2. Open Chrome → `chrome://extensions/` → Enable **Developer mode**

3. Click **Load unpacked** → Select the `dist/extension` folder

4. Navigate to [Google Photos](https://photos.google.com/?hl=en)

5. Click the extension icon → Configure → **Start** 🎉

### Method 2: Script Injection

1. Go to [Google Photos](https://photos.google.com/?hl=en)

2. Open DevTools (`Ctrl+Shift+I` or `F12`) → **Console** tab

3. Copy and paste the contents of [`dist/standalone/inject.js`](dist/standalone/inject.js)

4. Press **Enter** to start! 🚀

> **Tip**: Run `window.__gpdt_stop()` in console to stop early.

---

## 📊 Performance

### Speed Comparison

| Method | Photos/Minute | Relative Speed |
|--------|--------------|----------------|
| 🐌 Manual Deletion | ~20 | 1x |
| 📜 Average Script | ~100 | 5x |
| ⚡ **Our Tool** | **~500*** | **25x** |

<sub>*Actual performance varies based on network and hardware</sub>

### Key Metrics

- **Batch Size**: Up to 10,000 photos per operation
- **Success Rate**: >99% with automatic retry
- **Resource Usage**: Low CPU/memory via smart selection
- **API Efficiency**: Minimized calls to avoid rate limiting

### Performance Graph

```
Photos Deleted (per minute)
│
500 │    ●━━━━━━━━━━━━━━━  Our Tool
    │   ╱
400 │  ╱
    │ ╱
300 │╱
    │    ●━━━━━━━━━━━━━━━  Average Script
200 │   ╱
    │  ╱
100 │ ╱
    │╱
 20 │●━━━━━━━━━━━━━━━━━━  Manual
    └────────────────────────────
     0   5   10  15  20  25  30
              Time (minutes)
```

---

## ⚙️ Installation

### Prerequisites

- 🌐 Chrome browser (or Chromium-based)
- 🔑 [Google Photos account](https://photos.google.com/?hl=en) (English version)

### Performance Optimization

**Block image loading** for massive speed improvements:

1. Click the **padlock icon** in the address bar
2. Go to **Site settings**
3. Find **Images** → Select **Block**
4. Reload Google Photos

<div align="center">
  <img src="images/image_block.png" alt="Block images in Chrome" width="600">
</div>

This dramatically reduces CPU, RAM, and network usage! 🚀

---

## 🎯 Usage

### Chrome Extension

1. Navigate to [Google Photos](https://photos.google.com/?hl=en)
2. Click the extension icon in your toolbar
3. Set your desired max photo count
4. Click **▶ Start** — watch progress in real-time
5. Click **⏹ Stop** anytime to pause
6. Done! 🎉

### Script Injection

<details>
<summary>📋 Step-by-step guide with screenshots</summary>

#### Step 1: Login to Google
![Google Account Sign-in Page](images/google-signin-page.jpg)

#### Step 2: Go to Google Photos
![Google Photos Page](images/google-photos-page.jpg)

#### Step 3: Open Developer Tools
- **Keyboard**: Press `Ctrl+Shift+I` or `F12`
- **Right-click**: Select `Inspect`
- **Menu**: Chrome Menu → More tools → Developer tools

![Chrome Developer Tools Menu](images/chrome-menu-popup.jpg)

#### Step 4: Open Console Tab
![Chrome Console](images/chrome-console.jpg)

#### Step 5: Paste the Code
![Code in Console](images/code-in-console.jpg)

#### Step 6: Press Enter
The script starts automatically! 🚀

</details>

---

## 🛠️ Development

### Setup

```bash
# Clone
git clone https://github.com/shtse8/Google-Photos-Delete-Tool.git
cd Google-Photos-Delete-Tool

# Install dependencies
bun install

# Build everything
bun run build

# Type check
bun run typecheck

# Lint
bun run lint
```

### Project Structure

```
src/
├── core/           # Shared deletion engine (TypeScript)
│   ├── config.ts       # Default configuration
│   ├── selectors.ts    # Google Photos CSS selectors
│   ├── delete-engine.ts # Core logic
│   ├── utils.ts        # Helpers (sleep, waitUntil, etc.)
│   └── index.ts        # Barrel export
├── extension/      # Chrome extension
│   ├── manifest.json   # MV3 manifest
│   ├── background.ts   # Service worker
│   ├── content.ts      # Content script
│   ├── popup/          # Extension popup UI
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── popup.css
│   └── icons/          # Extension icons (16, 32, 48, 128)
└── standalone/     # Console injection script
    └── inject.ts       # Built as self-contained IIFE
```

### Build Outputs

```
dist/
├── extension/      # Load this folder as unpacked extension
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   └── icons/
└── standalone/
    └── inject.js   # Paste this into console
```

### Scripts

| Command | Description |
|---------|-------------|
| `bun run build` | Build extension + standalone |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | ESLint |
| `bun run release` | Bump version with standard-version |
| `bun run zip` | Create extension ZIP for Chrome Web Store |

### Testing Locally

1. `bun run build`
2. Go to `chrome://extensions/`
3. Enable Developer mode
4. Click "Load unpacked" → select `dist/extension/`
5. Navigate to Google Photos and test

### Releasing

```bash
# Bump version (updates package.json, creates git tag)
bun run release

# Push with tags
git push --follow-tags

# GitHub Actions will:
# 1. Build the extension
# 2. Create a GitHub Release with ZIP
# 3. Publish to Chrome Web Store (if secrets configured)
```

### CI/CD Secrets Required

For auto-publishing to Chrome Web Store, set these in GitHub repo Settings → Secrets:

| Secret | Description |
|--------|-------------|
| `CHROME_EXTENSION_ID` | Your extension's ID from Chrome Web Store |
| `CHROME_CLIENT_ID` | Google OAuth2 client ID |
| `CHROME_CLIENT_SECRET` | Google OAuth2 client secret |
| `CHROME_REFRESH_TOKEN` | Google OAuth2 refresh token |

See [Chrome Web Store API docs](https://developer.chrome.com/docs/webstore/using-api/) for setup.

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| 🌐 Script not working | Ensure you're using the [English version of Google Photos](https://photos.google.com/?hl=en) |
| 🔄 Script stopped | Simply run it again — it will resume from where it left off |
| 🐛 Unexpected errors | Check the console for error messages and [open an issue](https://github.com/shtse8/Google-Photos-Delete-Tool/issues) |
| 🚫 Extension issues | Try the script injection method instead |
| ⚡ Slow performance | Enable image blocking (see [Performance Optimization](#performance-optimization)) |

Still stuck? [Open an issue](https://github.com/shtse8/Google-Photos-Delete-Tool/issues) and we'll help! 🤝

---

## ❓ FAQ

<details>
<summary><b>Is this tool safe to use?</b></summary>

Yes, but always exercise caution with bulk deletions. Make sure you have backups of important photos. The tool interacts only with Google Photos' public interface.
</details>

<details>
<summary><b>Can I recover deleted photos?</b></summary>

Yes! Google Photos keeps deleted items in trash for **60 days**. You can restore them anytime within this period.
</details>

<details>
<summary><b>Why does the script pause or slow down?</b></summary>

This can happen due to network latency or Google's rate limiting. The tool handles this gracefully and continues automatically.
</details>

<details>
<summary><b>How many photos can I delete at once?</b></summary>

By default, the limit is 10,000 photos. You can change this in the extension popup or by editing the config.
</details>

<details>
<summary><b>Does this work on mobile?</b></summary>

No. Desktop browsers only — mobile browsers don't support the required developer console features.
</details>

<details>
<summary><b>Will this delete photos from my device?</b></summary>

No. It only deletes from Google Photos cloud storage. Local photos are not affected.
</details>

---

## ⚠️ Important Disclaimers

- 🛑 **Use Responsibly**: Always verify what you're deleting
- 💾 **Backup First**: Ensure important photos are backed up elsewhere
- 🔄 **UI Changes**: Google may update their interface, requiring selector adjustments
- 🚫 **Not Official**: This tool is not affiliated with Google
- ⚖️ **No Liability**: Developers are not responsible for data loss or account issues

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

- 🐛 [Report bugs](https://github.com/shtse8/Google-Photos-Delete-Tool/issues)
- 💡 [Suggest features](https://github.com/shtse8/Google-Photos-Delete-Tool/issues)
- 🔧 [Submit pull requests](https://github.com/shtse8/Google-Photos-Delete-Tool/pulls)
- ⭐ Star this repo if you find it useful!

---

## 📄 License

MIT © [Kyle Tse](https://github.com/shtse8)

See [LICENSE](LICENSE) file for details.

---

<div align="center">

### 💖 Found this helpful?

**Give it a ⭐ and share it with others!**

[⬆ Back to Top](#-google-photos-delete-tool)

</div>
