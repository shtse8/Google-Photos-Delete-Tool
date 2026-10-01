# Storefront

`listing.json` is the **only** place store listing copy is written.
Screenshots and post drafts live here too.

| Path | Purpose |
|---|---|
| `listing.json` | All store copy: CWS, Edge Add-ons, AMO. Validated by `bun run listing:check` in CI. |
| `posts/` | Copy-paste-ready content drafts (Show HN, Reddit, dev.to, Product Hunt). |
| `screenshots/` | Real product captures listed in `listing.json`. |

## Editing listing copy

1. Edit `storefront/listing.json` only. Never edit copy in a store dashboard
   directly — the dashboard is a consumer of this file, not a source.
2. Run `bun run listing:check` locally; CI enforces the same limits:
   - CWS summary ≤ 132 chars, CWS detailed description ≤ 16,000 chars
   - Edge detailed description ≤ 10,000 chars
   - AMO summary ≤ 250 chars, AMO detailed description ≤ 10,000 chars
   - names: CWS ≤ 75, Edge ≤ 45, AMO ≤ 50
3. `listing.appliesTo` must equal the current `package.json` version.
4. Commit. The Chrome Web Store listing is pushed by the
   `update-cws-listing.yml` workflow (dispatchable) or updated manually in
   the dashboard for Edge/AMO at bootstrap time.

## Screenshots

Real captures only — no mockups. Capture at 1280×800 from a real
`photos.google.com` session:

1. `dry-run.png` — dry-run result with count
2. `running.png` — real run with live stats
3. `filters.png` — Pro type filters
4. `empty-trash.png` — verified empty-trash done state

## Localized store name and description

`_locales/<code>/messages.json` (Chrome codes: en default, de, es, fr, it, nl,
pt_BR, zh_CN, zh_TW, ja) holds `appName` (max 75), `appNameEdge` (max 45; used
by the Edge and Firefox builds), `appShortName` (max 12), `appDescription` (max
132) and `appActionTitle`. The manifest references them as `__MSG_*__` with
`default_locale: "en"`. `cws.localized` in `listing.json` repeats title and
summary per locale for the dashboard's per-language listing; `listing:check`
fails if it drifts from `_locales`.
