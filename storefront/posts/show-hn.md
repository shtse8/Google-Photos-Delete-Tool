# Show HN draft

Post time: Tuesday 9:00–9:30am ET (or Saturday). Paste the title and the
body below; add the first comment within minutes (HN culture expects the
author's context comment).

## Title

Show HN: I built a fail-closed bulk delete for Google Photos (no delete API exists)

## Body (first comment)

Google Photos has no "delete all" — and its Library API has no
mediaItems.delete either (list/get/batchGet/batchCreate only). So I built
an extension/userscript that automates the select → trash → confirm loop
a human would do, in batches of up to 500, until the current view is empty.

What took the time wasn't the clicking — it was making it safe:

- Fail-closed matching: the delete/confirm/empty-trash buttons are matched
  by multilingual keywords against aria-labels and tooltips. Unknown UI
  means stop and error, never "click the last non-cancel button".
- Consent gate on the first real run; nothing is scheduled or unattended.
- Deleted photos go to the 60-day Trash; "empty trash afterwards" is
  opt-in and only reports done after it verifies the trash actually emptied.
- Versioned selector packs: a Google UI drift is a data patch, not code surgery.
- Zero servers, zero telemetry. Pro (one-time license, local Ed25519
  verification) adds type filters and a dry-run report; the delete engine
  is free forever.

Chrome Web Store: https://chromewebstore.google.com/detail/google-photos-delete-tool/jiahfbbfpacpolomdjlpdpiljllcdenb
Source (MIT): https://github.com/shtse8/Google-Photos-Delete-Tool

Happy to answer questions about the matching strategy, the release gate
(version/artifact verification), or why DOM automation beats the API here.
