# Growth & Distribution Playbook

Goal: more users, more stars, more Pro sales — with the least effort per
channel and honest measurement. Stars are a **lagging** signal: they come
from users who actually found, used, and liked the tool. The compounding
loop is:

```
store listing (searchable, trusted) → installs → reviews → store ranking → more installs
        ↑                                        ↑
   content (Reddit/HN/YouTube/…)          GitHub stars follow real users
```

Everything below is ordered by effort/impact. Do Phase 0 first — it is
free and was already partially applied on 2026-08-09.

## Phase 0 — Free discoverability (done + remaining)

Already applied:
- ✅ GitHub topics (12): `google-photos`, `chrome-extension`,
  `firefox-extension`, `userscript`, `tampermonkey`, `violentmonkey`,
  `delete-photos`, `photo-management`, `productivity-tool`, `privacy`,
  `open-source`, `typescript` — the repo now appears in
  github.com/topics/* searches.
- ✅ Repo description rewritten to v3 truth (keyword-rich).
- ✅ Homepage → Chrome Web Store listing.

Still to do (user authority — dashboard/credentials):
- **CWS listing text**: still carries v2 wording ("10,000 default",
  old feature list). Rewrite with v3 facts + disclose Pro. This is the
  single highest-ROI ASO item (10k+ existing installs, ranking loop).
- CWS screenshots: one dry-run screenshot, one real-run screenshot,
  one Pro screenshot (filters + CSV export).

## Phase 1 — More stores (1–2 days total)

| Store | Status | Effort | Notes |
|---|---|---|---|
| Chrome Web Store | live (v2.0.5; v3 in review) | — | ASO work above; publish v3.0.1 via `publish-cws.yml` after review clears |
| **Microsoft Edge Add-ons** | not listed | 30–60 min | Edge is Chromium and MV3-ready (MV2 shuts down Dec 2026). The Chrome zip works as-is. Submit at Partner Center → Edge Add-ons (new submission, upload `google-photos-delete-tool.zip`, fill listing, privacy URL = this repo's PRIVACY.md). New storefront = new search surface = new users. |
| **Firefox AMO** | zip ready | ~1 day (account + review) | Submit `google-photos-delete-tool-firefox.zip` at addons.mozilla.org. Firefox variant already has `browser_specific_settings.gecko.id`. AMO review takes days; budget for a rejection round-trip (usually listing-text fixes). |
| **Opera add-ons** | not listed | 30 min | Opera runs Chrome extensions; the Chrome zip works. Submission at addons.opera.com (reviews can be slow — set expectations). Lower priority: Opera users can already install from CWS via Opera's "Install Chrome extensions" add-on. |
| **Brave / Vivaldi / Arc** | — | none | Consume the Chrome Web Store; nothing to do. |
| **Greasy Fork** | not listed | 20 min | Create account → submit `google-photos-delete.user.js`. The header already carries `@version` + `@updateURL`/`@downloadURL` pointing at GitHub releases, so Greasy Fork users auto-update on every release. Second-largest userscript surface after direct install. |
| **OpenUserJS / Userscripts (iOS)** | optional | 10 min each | Copy of the same script; tiny volumes but free. |

## Phase 2 — Content marketing (the star engine)

Rules that keep you from being banned: **value first, promotion second**.
Reddit's self-promotion guideline is ~10% self content; HN Show HN must
be a real product the submitter uses; never astroturf.

High-impact, in order:

1. **Reddit — consumer threads** (this tool's audience is Google Photos
   power users, not just developers):
   - `r/googlephotos` — the obvious home; post a walkthrough (dry-run →
     real run), answer the recurring "how do I delete everything?"
     questions with a helpful answer that links the tool.
   - `r/privacy` / `r/degoogle` — angle: consent-gated, zero-server,
     no telemetry, local Pro verification. Fits the privacy narrative.
   - `r/DataHoarder` — angle: reclaiming storage in bulk; this community
     loves bulk tooling.
   - `r/productivity` / `r/technology` — only with a genuinely useful
     story (e.g., a real before/after).
2. **Show HN** — post at Tue 9am ET or Sat (US) with a strong first
   comment: why it exists (no delete API), how it stays safe (fail-closed
   matching, consent, verified empty-trash), what's measured (release
   gate). HN traffic spikes stars for 24–48h.
3. **Product Hunt** — one launch, timed AFTER CWS v3 is live (a
   storefront link in the launch converts). Angle: "Delete 10,000 Google
   Photos in minutes — safely". Pro = monetization tie-in.
4. **dev.to / X / #buildinpublic** — 1–2 technical posts with a real
   hook: "I built a fail-closed DOM automator for a site with no delete
   API" (the safety architecture is the interesting part). Screenshots +
   numbers (10k users) > generic "I built a tool" posts.
5. **YouTube / TikTok / Shorts** — 30–60s demo ("how to delete all
   Google Photos at once"), real screen capture, dry-run → run →
   trash. This is the highest-reach channel for a consumer tool;
   one decent Shorts can out-deliver a month of text posts.
6. **Quora / StackExchange / forum answers** — the search-forever play:
   answer "How do I delete all photos from Google Photos?" with the
   tool as part of a genuinely helpful answer. Compounds via SEO.

## Phase 3 — Compounding

- **Awesome lists**: submit PRs to curated lists that fit —
  `awesome-chrome-extensions`, `awesome-userscripts`, `awesome-privacy`
  (local verification angle fits), `awesome-photo-management`-type lists.
  Each is a permanent backlink from a high-authority page.
- **CWS ranking loop**: once v3 is live, respond to every review;
  reviews + install velocity are the ranking inputs. The 10k-user base
  is the seed — a listing-text refresh + screenshots can re-activate it.
- **GitHub Trending**: driven by star *velocity*; a coordinated
  Reddit + HN + X burst is what creates the spike. Do not fake it —
  real users first.
- **Newsletters**: Hacker Newsletter, JavaScript Weekly, Chrome
  extension roundups — pitch after the HN/dev.to posts exist (links
  to proof).
- **Pro upsell**: every channel above mentions Pro only where it is a
  feature ("delete only screenshots"), never as the pitch. Gumroad
  product per docs/PRO.md.

## Metrics (what proves it works)

| Signal | Where | Target |
|---|---|---|
| Store installs/velocity | CWS dashboard, Edge, AMO | week-over-week growth after each phase |
| Store reviews | CWS | respond to 100%; rating ≥ 4.5 |
| GitHub stars | repo | velocity spikes after HN/PH/Reddit bursts |
| Userscript installs | Greasy Fork page | trend line up after listing |
| Pro orders | Gumroad ledger | first 10 orders = validation |
| Referral sources | where installs come from | which channel to double down on |

Do not optimize stars directly — optimize the loop. A star with no
install is noise; an install with a review is the loop.
