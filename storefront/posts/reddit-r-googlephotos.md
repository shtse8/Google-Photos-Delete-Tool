# Reddit r/googlephotos draft

Best used as a walkthrough answer on the recurring "how do I delete
everything?" threads — post it as a reply with the tool as part of a
genuinely helpful answer (r/googlephotos is a consumer subreddit; lead
with the how, not the promotion).

## Draft (reply-style)

If you're cleaning out your Google Photos, the practical path is:

1. Sort by date / month and select the range you want to remove.
2. Google's own limit is 500 per batch — you'll be selecting → trash →
   confirm on repeat.

I built a free open-source tool that automates exactly that loop (it's a
browser extension, also available as a Tampermonkey userscript):

- It works in safe batches of up to 500 and stops the moment it can't
  positively identify a button (no blind clicking).
- First run asks you to confirm; nothing is automated without consent.
- Deleted photos go to your normal 60-day Trash — "empty trash" is a
  separate opt-in step, and it verifies the trash actually emptied before
  saying done.
- Dry-run mode first counts your current view without touching anything.
- Zero data collection, zero servers. Free forever (a one-time license
  adds filters like "only screenshots" and a dry-run report).

Chrome Web Store: https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb
Source: https://github.com/shtse8/Google-Photos-Delete-Tool

r/privacy / r/degoogle angle (only if it fits the thread): consent-gated,
zero-server, no telemetry, local license verification, open source.
r/DataHoarder angle: reclaiming storage in bulk; the dry-run count makes
it safe to try.
