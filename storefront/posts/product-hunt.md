# Product Hunt launch draft

Timing: AFTER CWS v3 is live (a storefront link converts). Use the
existing 10k-user base to seed first-day upvotes (ask in-app/README, not
spam). One launch only — make it count.

## Title (60 chars max)

Delete all Google Photos — safely, in batches

## Tagline

Consent-gated bulk delete for Google Photos: dry-run first, empty trash
optionally, stop anytime.

## Description

Google Photos has no "delete all" — and no delete API. This tool
automates the select → trash → confirm loop in safe batches of up to
500, entirely in your browser.

Safety is the product:
- Fail-closed matching — it never clicks a button it cannot positively
  identify (unknown UI means stop and error).
- Consent gate on the first real run; nothing runs unattended.
- Deleted photos go to the 60-day Trash; empty-trash is opt-in and
  verified.
- Dry run counts your view without touching anything.
- Zero servers, zero telemetry, open source (MIT).

Free forever: delete engine, dry run, empty trash. One-time Pro license
(local, no account) adds type filters — delete only screenshots, videos,
animations — and a dry-run report/export.

Chrome Web Store: (link)
Firefox: (link when AMO live)
Source: https://github.com/shtse8/Google-Photos-Delete-Tool

## First comment

I built this because "delete all" doesn't exist in Google Photos and the
Library API can't delete. The interesting part is the safety model: a
release-gated, versioned-selector automator that stops rather than
guesses. Happy to go deep on the matching strategy or the release
pipeline — AMA.
