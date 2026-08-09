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

### Firefox AMO (~30 min, once)

1. Create an [AMO developer account](https://addons.mozilla.org/developers/)
   and generate API credentials at
   `https://addons.mozilla.org/en-US/developers/addon/api/key/`
   (JWT issuer + secret).
2. Create the add-on once in the AMO dev hub: upload
   `google-photos-delete-tool-firefox.zip`, paste listing copy from
   `storefront/listing.json` (`amo` section). The add-on GUID is fixed by
   the manifest: `google-photos-delete-tool@shtse8.github.io`.
3. Add repo secrets:
   - `FIREFOX_JWT_ISSUER` — the API key (JWT issuer)
   - `FIREFOX_JWT_SECRET` — the API secret
4. Dispatch: `gh workflow run "Publish Stores (manual)" -f stores=amo -f tag=v3.0.1`
   — from then on every tag is submitted via AMO API v5 automatically.

### Greasy Fork (20 min, once — no API exists)

Greasy Fork has no public API. Upload
`google-photos-delete.user.js` once after creating an account. The script
header carries `@version` + `@updateURL`/`@downloadURL` pointing at GitHub
releases, so **Greasy Fork users auto-update on every release** — the one
manual upload is the entire cost, forever.

### CWS listing text

`storefront/listing.json` is the single source. Push it with:

```bash
gh workflow run "Update CWS Listing (manual)"
```

Fails loudly while the item is in review — observed live: the API
returns `ITEM_NOT_UPDATABLE` (upload path) or HTTP `304 Not Modified`
(metadata path) until Google clears the review. Re-dispatch after review
clears. Note: Google's metadata endpoints are the only API path and
community tooling reports they may sunset after 2026-10-15; if Google
rejects or sunsets the call, update the dashboard once from the same file
— the file stays the source either way. Edge/AMO listing metadata is
Partner-Center/AMO-dashboard only by design.

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
