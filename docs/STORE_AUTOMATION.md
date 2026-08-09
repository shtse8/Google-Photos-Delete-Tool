# Store Automation — architecture, bootstrap, runbook, evidence

The distribution system is **agent-native after one bootstrap**: a tag on
`master` becomes GitHub release assets immediately, and each store is
published by a scheduled retry loop as soon as that store's review queue
allows. The only human steps are the ones platforms require: account
creation, credential issuance, and the very first product submission.

## Model

```
git tag v3.1.0
   │
   ▼
release.yml ──▶ GitHub Release assets (source of truth, always green)
   │
   ▼
store-retry.yml (every 6h) ──▶ store-publish.yml
                                  ├─ cws  : upload → publish → state ✓
                                  ├─ edge : upload → poll → publish → state ✓
                                  └─ amo  : wdzeng/firefox-addon → state ✓
```

- **`store-state` branch** (`state.json`) records what is **live** per
  store — not what was pushed. State advances only after the platform API
  confirms a publish.
- **Review queues are expected.** `ITEM_NOT_UPDATABLE` (CWS),
  `InProgressSubmission` / `NoModulesUpdated` (Edge) exit 0 with a notice
  and retry next cycle. Real failures (auth, validation) exit 1 and never
  advance state.
- **One concurrency group** (`store-publish`) prevents overlapping runs
  from racing the state branch.

## What is automated vs one-time human

| Step | Who | When |
|---|---|---|
| GitHub release from tag | agent | every tag |
| CWS package publish | agent | retry loop; blocked while item is in review |
| CWS listing text | agent (API) / dashboard fallback | re-dispatch `update-cws-listing.yml` |
| Edge package publish | agent | after one-time bootstrap |
| AMO version publish | agent | after one-time bootstrap |
| Greasy Fork | **human, once** | no public API; script updates itself afterwards |
| Content posts (HN/Reddit/dev.to/PH) | human (or explicit opt-in) | drafts in `storefront/posts/`; auto-posting from fresh accounts is a ban risk, not automation |

## Agent-native execution model (three tiers)

Everything the project can ever need is in one of three tiers. Tier 1 is
the goal; Tier 2 is how the agent works where platforms have no API;
Tier 3 is identity, which no agent should ever hold.

| Tier | Mechanism | Who drives | Examples |
|---|---|---|---|
| **1. API-native** | REST API from CI; secrets in repo | agent, fully unattended | CWS publish, Edge publish, AMO create+publish, listing metadata |
| **2. Browser handoff** | agent drives the USER's already-logged-in Chrome via CDP on 127.0.0.1 | agent operates, user holds identity | Greasy Fork upload, CWS dashboard fallback, real screenshots, Edge product creation |
| **3. Human identity** | account creation / email+phone verification / CAPTCHA | human, once | AMO account, Microsoft developer account, CWS developer account, Greasy Fork account |

Browser handoff is **not** robot automation: no passwords, cookies, or
sessions ever leave the user's machine, and no CAPTCHA is ever bypassed.
The user logs in once; the agent then does the work in that session.

Start Chrome with a local-only debug port (quit Chrome first):
- macOS: `open -a "Google Chrome" --args --remote-debugging-port=9222`
- Linux: `google-chrome --remote-debugging-port=9222`
- Windows: `chrome.exe --remote-debugging-port=9222`

Then run the handoff scripts: `node scripts/greasy-fork-upload.mjs`,
`node scripts/cws-listing.mjs`, `node scripts/cws-screenshots.mjs`,
`node scripts/edge-bootstrap.mjs <open|upload-zip|fill-listing|submit>`.
Every script fails loudly and prints the live page text on selector
drift — the agent adapts, never fakes.

## One-time bootstrap checklist (do once, then no human in the loop)

### 1Password inventory — what to store, where it goes

Store these in 1Password (never in chat). Each maps to a repo secret or
a session:

| 1Password item | Fields | Repo secret / use |
|---|---|---|
| AMO API credentials | issuer (API key) + secret | `FIREFOX_JWT_ISSUER` / `FIREFOX_JWT_SECRET` |
| Edge Publish API | Client ID + API key + expiry | `EDGE_CLIENT_ID` / `EDGE_API_KEY` / `EDGE_PRODUCT_ID` |
| CWS credentials | (already configured) | `CHROME_*` — no change |
| Greasy Fork | nothing | user's browser session only (Tier 2) |
| Google / Microsoft / Mozilla logins | passwords | NEVER — identity stays with the user |

After adding AMO + Edge secrets, the store-retry loop and this checklist
are the entire system; every remaining step below is Tier 1.

## One-time bootstrap checklist (do once, then no human in the loop)

### Chrome Web Store — done

Secrets already present: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`,
`CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.
v3.0.0 is in Google review; v3.0.1 upload is blocked (`ITEM_NOT_UPDATABLE`)
until review clears — the retry loop publishes it automatically after.

### Microsoft Edge Add-ons (~30 min, once)

1. [Register as an Edge extension developer](https://partner.microsoft.com/dashboard/microsoftedge/overview) (developer account).
2. Create the product once in Partner Center: upload
   `google-photos-delete-tool.zip`, fill listing copy from
   `storefront/listing.json` (`edge` section), privacy/availability.
   This first submission goes through certification manually.
3. In Partner Center → **Publish API** → **Enable** (new experience) →
   **Create API credentials**. Copy the Client ID and the API key.
4. Copy the **Product ID** (GUID from the extension overview URL).
   Steps 2–4 can be driven by the agent through browser handoff
   (`node scripts/edge-bootstrap.mjs open|upload-zip|fill-listing|submit`);
   Partner Center has no product-creation API, so this is Tier 2 once.
5. Add repo secrets:
   - `EDGE_CLIENT_ID` — the Client ID from step 3
   - `EDGE_API_KEY` — the API key from step 3 (note the expiry date)
   - `EDGE_PRODUCT_ID` — the product GUID from step 4
6. Dispatch: `gh workflow run "Publish Stores (manual)" -f stores=edge -f tag=v3.0.1`
   — from then on the retry loop publishes every tag automatically.

Edge API contract (v1.1, verified 2026-08-09 from Microsoft docs):
base `https://api.addons.microsoftedge.microsoft.com/v1`; headers
`Authorization: ApiKey $EDGE_API_KEY` + `X-ClientID: $EDGE_CLIENT_ID`.
No API exists for creating a product or updating listing metadata —
Partner Center only.

### Firefox AMO (~10 min, once — API-native, no browser)

1. Create an [AMO developer account](https://addons.mozilla.org/developers/)
   (Tier 3) and generate API credentials at
   `https://addons.mozilla.org/en-US/developers/addon/api/key/`
   (JWT issuer + secret).
2. Add repo secrets: `FIREFOX_JWT_ISSUER` + `FIREFOX_JWT_SECRET`.
3. Dispatch **once**: `gh workflow run "Bootstrap AMO Add-on (manual, once)"`
   — this creates the add-on and submits the first listed version through
   AMO API v5 (upload → validation → create → description → verify),
   using listing copy from `storefront/listing.json`. No browser, no dev
   hub. Screenshots/icon are the only AMO listing fields the API cannot
   set (Mozilla limitation) — add them once in the dev hub, or via
   browser handoff.
4. From then on every tag is submitted automatically by the retry loop.

### Greasy Fork (20 min, once — no API exists)

Greasy Fork has no public API. After the user creates an account and
logs in once (Tier 3), the agent uploads the script through browser
handoff: `node scripts/greasy-fork-upload.mjs` (form contract verified
from Greasy Fork's own source: `/en/script_versions/new`, fields
`code_upload` / `name` / `description`). The script header carries
`@version` + `@updateURL`/`@downloadURL` pointing at GitHub releases, so
**Greasy Fork users auto-update on every release** — this one upload is
the entire lifetime cost.

### CWS listing text

`storefront/listing.json` is the single source. Push it with:

```bash
gh workflow run "Update CWS Listing (manual)"
```

Fails loudly while the item is in review — observed live: the API
returns `ITEM_NOT_UPDATABLE` (upload path) or HTTP `304 Not Modified`
(metadata path) until Google clears the review. Re-dispatch after review
clears. If Google rejects or sunsets the metadata endpoints (community
tooling reports a 2026-10-15 sunset), the browser-handoff fallback pastes
the same file into the dashboard: `node scripts/cws-listing.mjs --item-id <id>`.
Screenshots: `node scripts/cws-screenshots.mjs` captures real 1280×800
shots from the user's own Google Photos session (dry-run + filters are
safe; running/empty-trash require `--allow-destructive` and the user
watching). Edge/AMO listing metadata is Partner-Center/AMO-dashboard only
by design.

## Runbook

```bash
# publish a specific tag to a specific store right now
gh workflow run "Publish Stores (manual)" -f stores=cws -f tag=v3.0.1

# publish whatever is pending to all stores (same engine as the retry)
gh workflow run "Publish Stores (manual)" -f stores=auto

# run the retry loop once now
gh workflow run "Store Publish Retry (scheduled)"

# check what is live where
git fetch origin store-state && git show origin/store-state:state.json
```

## Evidence per layer

| Layer | Proof |
|---|---|
| Source | `storefront/listing.json` validated by `bun run listing:check` (CI) |
| CI | workflows parse (YAML), listing limits enforced, builds+verify green |
| Deploy | workflow runs: upload/publish steps, operation IDs, status JSON |
| Live | `store-state` branch (`state.json` per store) + store pages readback |

A green workflow run is **not** the proof — the `store-state` record and
the store page are. The workflow prints operation IDs and status bodies
so every claim has a platform-side locator.
