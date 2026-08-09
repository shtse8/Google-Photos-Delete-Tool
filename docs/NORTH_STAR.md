# North Star — Google Photos Delete Tool v3

**Goal:** the most effective bulk-delete capability for Google Photos with
the least system: one engine, thin surfaces, data-driven selectors,
postcondition-verified destructive flows, zero-server licensing, and
evidence per layer (source / CI / deploy / live).

## What the product is (and is not)

- **Is:** a consent-gated automator of the human click sequence
  (select batch → Move to trash → confirm → scroll → repeat), plus an
  optional empty-trash pass. Google Photos exposes **no delete API** for
  media items, so DOM automation is the only viable mechanism.
- **Is not:** a scraping tool, a mass-downloader, an API client, or a
  multi-site tool. It runs only on `photos.google.com`.

## Architecture

```
src/
├── core/            # DOM-free, framework-agnostic engine (unit-testable)
│   ├── delete-engine.ts     # batch loop on injected EngineDom
│   ├── selectors.ts         # pack-driven, fail-closed DOM finders
│   ├── selector-pack.ts     # loads the versioned JSON pack
│   ├── empty-trash.ts       # postcondition-verified empty flow
│   ├── empty-trash-baton.ts # pending-empty semantics (TTL, path gate)
│   ├── license.ts           # local Ed25519 Pro verification (zero server)
│   ├── photo-filter.ts      # pack-driven tile type classification
│   ├── diagnostics.ts       # selector-drift evidence collector
│   └── …                    # config, status, utils, event-emitter, log
├── ui/panel/        # ONE shared floating control panel
├── extension/       # Chrome + Firefox MV3 (content, background, popup,
│                    # api.ts callback wrappers, dual manifest)
├── userscript/      # thin mount (panel + runner)
├── standalone/      # thin mount (panel + runner)
└── selector-packs/  # versioned, data-driven selector/keyword pack
```

### Decisions and why

1. **One engine, injected DOM adapter.** Every DOM interaction goes
   through `EngineDom`; the full loop (select → cap-flush → scroll →
   end-of-list → flush-last → stop/pause/error) is unit-tested against a
   scripted fake. This is the single highest-leverage move: it turns the
   riskiest code from unverifiable browser-only behavior into a
   deterministic, regression-tested module.

2. **Wave-based selection (flap root fix).** Selection only ever clicks
   tiles that are *currently unchecked*, re-querying after each wave.
   Google Photos' async `aria-checked` update can no longer cause a
   re-click (the historical toggle-off flap). Counter regressions are
   counted and surfaced in diagnostics.

3. **Fail-closed destructive matching.** A delete/empty action requires a
   positive keyword match from the pack. The tool never guesses "the last
   non-cancel button". "Empty trash" requires long phrases that can never
   collide with "Delete forever".

4. **Postcondition-verified completion.** Empty-trash reports `done` only
   after the empty state is verified. A permanent action is never claimed
   done without proof.

5. **Data-driven selector pack.** All selectors, action candidates, and
   multilingual keywords (20 languages) live in `pack-v1.json`. A Google
   UI drift fix is a data patch with a version bump; every diagnostic
   report carries the pack version so a broken install maps to its exact
   data.

6. **Self-diagnosing reports.** Every run records selector matches,
   counter fallbacks, flap recoveries, and label samples. "Report issue"
   pre-fills a GitHub issue with that evidence — converting "it's broken"
   into actionable drift data with zero user effort.

7. **Zero-server Pro.** The Pro token is an Ed25519-signed payload
   verified entirely on-device. No license server, no account system, no
   data egress. The seller holds one private key outside the repo.

8. **Consent gate + least permission.** Real runs require explicit
   consent; the manifest asks for `storage` only. No telemetry, no
   remote logging.

9. **Thin surfaces.** Extension popup, userscript panel, and standalone
   panel are thin consumers of the same core. The extension's async
   chrome.* calls go through callback-based wrappers so one codebase runs
   in Chromium and Firefox (no polyfill dependency).

## What was cut and why

| Cut | Why |
|---|---|
| Bookmarklet surface | Fourth distribution channel with zero unique value; a maintenance tax on every UI change. |
| `Config.timeout`, `retryWithBackoff`, `estimateRemaining`, `abort()`, `$`/`$$` | Dead code — zero callers, documented but never read. |
| Unreachable dry-run branch in `deleteSelected` | Dry-run is a pure scan path; the branch could never execute. |
| `toggle` message action, `activeTab` permission | No callers / redundant with host permissions. |
| Unverified claims ("25× faster", "200–500/min", "default 10,000") | Honesty floor: measured claims only. |
| `window.__gpdt_*` globals | False public API that never existed in the shipped surface. |
| `vite.inject.config.ts`, `scripts/preview.ts`, `images/`, `docs/screenshot.png` | Orphaned duplicates / unreferenced assets. |
| `standard-version` | One more release-machinery layer for a single-package repo; version is a one-line bump + tag. |

## Cost model

Cost = lifecycle entropy + human attention. The pack data model exists to
make Google-drift repairs a 5-minute data patch. Diagnostics exist so
users report evidence, not symptoms. The DOM-adapter tests exist so the
engine can be refactored without a browser. Everything else is cut.

## Terminal state

v3 is complete when: no dead code or false claims remain; all four
artifacts build, verify, and zip green; the full test suite passes; the
tagged release carries all assets; and the live-run gate (docs/RELEASE_GATE.md)
is the documented protocol for proving behavior on a real account.
Storefront steps (CWS publish, AMO listing, Gumroad product) are
explicit user-authority handoffs, not code.
