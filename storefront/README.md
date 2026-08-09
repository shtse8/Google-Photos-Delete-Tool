# Storefront — single source of truth

`listing.json` is the **only** place store listing copy is written.
Screenshots and post drafts live here too.

| Path | Purpose |
|---|---|
| `listing.json` | All store copy: CWS, Edge Add-ons, AMO. Validated by `bun run listing:check` in CI. |
| `posts/` | Copy-paste-ready content drafts (Show HN, Reddit, dev.to, Product Hunt). |
| `screenshots/` | Real product captures listed in `listing.json` (pending capture). |

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
2. `running.png` — real run with honest stats
3. `filters.png` — Pro type filters
4. `empty-trash.png` — verified empty-trash done state
