# 🗑️ Google Photos Delete Tool

Consent-gated bulk delete for Google Photos: batch select, dry-run, and empty-trash.

- Ordinary: https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb — published Chrome Web Store listing (item `jiahfbbfpacpolomdjlpdpiljllcdenb`, observed live version 3.0.1 with Add to Chrome). Store listing is the ordinary customer surface for this extension. A store `200` is not the product contract.
- Preview: `none` — GitHub Pages is not enabled, and this product has no admitted preview, dogfood, or marketing website. Do not invent a URL.
- Vision: [`docs/vision.md`](docs/vision.md)
- Capabilities: [`docs/capabilities.md`](docs/capabilities.md)

[![CI](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/ci.yml/badge.svg)](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/ci.yml)
[![Release](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/release.yml/badge.svg)](https://github.com/shtse8/Google-Photos-Delete-Tool/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/jiahfbbfpacpolomdjlpdpiljllcdenb?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb)

Google Photos has **no "delete all"**. This tool automates the tedious
select → trash → confirm loop in safe batches so you can reclaim your
storage. It works entirely in your browser: it clicks the same UI elements
a human would click, in batches of up to 500, until your current view is
empty.

> **Why DOM automation?** The Google Photos Library API has no
> `mediaItems.delete` endpoint (list/get/batchGet/batchCreate only) and no
> official bulk-delete feature. DOM automation is the only practical path,
> and this project makes it fail-closed: it never clicks a destructive
> action it cannot positively identify.

---

## Supported surfaces (two, by design)

| Surface | How to get it | Notes |
|---|---|---|
| **Chrome / Firefox extension** | [Chrome Web Store](https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb); Firefox Add-ons not published | Full popup UI, badge, i18n (9 languages), empty-trash flow. Firefox artifact exists in source; the AMO listing is unpublished (404). |
| **Userscript** (Tampermonkey / Violentmonkey / Greasemonkey) | `google-photos-delete.user.js` from the latest release | Same engine, same floating panel, same safety model |

The bookmarklet and DevTools-console distributions were **removed** in v3:
they duplicated the panel with divergent behavior and shipped instructions
that did not match the code. The standalone `inject.js` is still built as a
dev artifact but is not a supported product surface.

## Safety model (non-negotiable)

- **Fail-closed destructive matching.** The delete/confirm/empty-trash
  buttons are matched by positive multilingual keywords against
  `aria-label`/tooltip/text. The tool never guesses "the last non-cancel
  button" — an unknown UI means **stop and error**, not click.
- **Consent gate.** The first real (non-dry) run requires you to
  acknowledge what you are about to do. Nothing is ever scheduled or
  unattended.
- **60-day trash.** Deleted photos go to the Google Photos Trash where
  they stay for 60 days. "Empty trash afterwards" is **opt-in**, permanent,
  and only reported `done` after it verifies the trash actually emptied.
- **Honest numbers.** The progress bar is indeterminate while the total is
  unknown; ETA is shown only after a dry-run established a total. Speed
  claims are measured in the release gate, not invented in marketing.
- **No telemetry, zero server.** Everything runs in your browser. Pro
  license verification is local (Ed25519). Nothing leaves your machine.

## Features

- **Batch delete** — select up to 500 per batch (Google's selection cap),
  loop until the view is empty. The engine detects the cap, scrolls, and
  flushes the final partial batch.
- **Pause / Resume / Stop** — stop is instant and abort-aware; a stopped
  run never reports a false error.
- **Dry run** — scroll-and-count mode that never clicks anything, returns
  a count and (with Pro) a per-type breakdown.
- **Empty trash (opt-in)** — navigates to `/trash`, empties it, and
  verifies the postcondition before reporting done.
- **Type filters (Pro)** — delete only screenshots, videos, animations,
  collages, or photos, matched on the first label token.
- **Versioned selector packs** — all Google-Photos-specific selectors and
  keyword lists live in a versioned JSON data pack; a UI drift fix is a
  data patch, not code surgery.
- **Self-diagnosing reports** — the panel's **Report issue** button opens
  a pre-filled GitHub issue with a structured diagnostic blob (pack
  version, selector matches, observed labels) so "it's broken" becomes
  actionable drift data.
- **9-language extension UI** with compile-time-complete translations.

## Installation

### Chrome / Firefox

1. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb)
   or Firefox Add-ons (when published).
2. Navigate to [photos.google.com](https://photos.google.com/?hl=en).
3. Click the extension icon, confirm the safety notice on your first real
   run, then press **Start**.

Manual load (development): download the release zip, unzip, open
`chrome://extensions` (or `about:debugging#/runtime/this-firefox`), enable
developer mode, and **Load unpacked**.

### Userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) or
   [Violentmonkey](https://violentmonkey.github.io/).
2. Install the latest
   [`google-photos-delete.user.js`](https://github.com/shtse8/Google-Photos-Delete-Tool/releases/latest/download/google-photos-delete.user.js).
3. Open [photos.google.com](https://photos.google.com/?hl=en) — the
   floating panel appears bottom-right.

## Usage

1. Be on the Google Photos view you intend to clean (the tool acts on the
   current view).
2. **Dry run** first to see the count without touching anything.
3. Configure: photos per batch (default 500), empty-trash toggle, optional
   type filter (Pro).
4. **Start**, and use **Pause / Resume / Stop** freely. Stop is immediate.
5. Watch the honest stats: deleted count, rate, elapsed; ETA only when a
   dry-run total is known.

## Privacy

Zero data collection, zero servers, zero telemetry. Full statement in
[`PRIVACY.md`](PRIVACY.md).

## Pro

The delete engine, dry-run, and empty-trash are free forever. A one-time
**Pro** license unlocks the analysis layer: type filters and the dry-run
report/export. Pro is a locally-verified Ed25519 token — no account, no
backend. Seller tooling and key management: see [`docs/PRO.md`](docs/PRO.md).

## Development

```bash
bun install
bun run typecheck   # strict TS
bun run lint        # ESLint (src/ + scripts/)
bun run test        # Vitest — full engine loop on a scripted DOM
bun run build       # all artifacts (Chrome, Firefox, userscript, standalone)
bun run verify      # artifact smoke gate (manifest/pack/IIFE self-containment)
bun run zip         # release zips
bun run package     # build + verify + zip
```

### Architecture

```
src/
├── core/                  # Framework-agnostic engine & domain
│   ├── delete-engine.ts   # Batch loop on an injected DOM adapter (testable)
│   ├── dom-adapter.ts     # EngineDom contract; browserDom = real browser impl
│   ├── selector-pack.ts   # Versioned, data-driven selector + keyword pack
│   ├── empty-trash.ts     # Empty-trash flow WITH postcondition proof
│   ├── empty-trash-baton.ts# Pending-flag semantics (localStorage / chrome)
│   ├── page-runner.ts     # In-page orchestration: consent, license, runner
│   ├── license.ts         # Local Ed25519 Pro license verification
│   ├── photo-filter.ts    # Type classification (first-label-token matching)
│   ├── diagnostics.ts     # Bounded selector/label evidence for issue reports
│   ├── status.ts          # One RunStatus union shared by every surface
│   └── ...
├── selector-packs/        # pack-v1.json (versioned selectors + keywords)
├── ui/panel/              # ONE floating panel (userscript + standalone)
├── extension/             # MV3 manifests, popup (i18n), content, background
│   └── api.ts             # Chrome/Firefox promise wrappers (callback-based)
├── standalone/            # Dev-only console-paste mount
└── userscript/            # Thin mount of the shared panel
scripts/                   # build.ts · zip.ts · verify.ts · license.ts
tests/                     # engine loop on a scripted DOM fake + core/surface suites
```

### Release gate

Every release must pass the live-run protocol documented in
[`docs/RELEASE_GATE.md`](docs/RELEASE_GATE.md): a disposable account, a
fixed deletion scenario, and recorded postconditions (counter resets,
trash contents, empty-trash proof). Release notes carry the evidence.
Selector drift is a patch to the pack data file, triaged from
diagnostic reports.

## FAQ

**Is this safe?** It only clicks what a human would click, matching
destructive actions by positive keywords (never guessing), and deleted
photos sit in Trash for 60 days. The only permanent action is "Empty
trash", which is opt-in, gated by the postcondition check, and never
unattended.

**What happens when Google changes their UI?** The selector pack version
is recorded in every diagnostic report. When a drift is reported, the fix
is a data patch to the pack, shipped as a point release. This is the
maintenance model by design.

**How fast is it?** Deletion runs at Google's UI pace. Exact figures are
measured per release in the release gate, never quoted as marketing.

**What about the trash?** Deleted photos go to Trash for 60 days.
"Empty trash afterwards" empties and permanently removes them — with your
explicit opt-in.

## License & provenance

MIT — see [`LICENSE`](LICENSE). This project is a modernized fork of
[mrishab/google-photos-delete-tool](https://github.com/mrishab/google-photos-delete-tool).
Note: the upstream project ships **no license file**, so the MIT grant
here covers the fork's own original contributions and re-engineering; the
legal status of directly inherited upstream code is ambiguous and should
be treated accordingly.
