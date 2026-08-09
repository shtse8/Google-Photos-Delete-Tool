# Privacy Policy — Google Photos Delete Tool

**Last updated:** 2026-08-09

## Overview

Google Photos Delete Tool is a browser extension and userscript that helps
you bulk-delete photos from Google Photos. Your privacy is the product's
core promise: this tool **collects, stores, and transmits nothing**.

## Data Collection

We do not collect, store, or transmit any user data. Specifically:

- No personally identifiable information is collected
- No photo data leaves your browser
- No analytics or tracking is used
- No data is sent to external servers
- No cookies are set
- Pro license verification happens **locally** (Ed25519 signature check in
  your browser) — the license token never leaves your device

## How It Works

The tool operates entirely within your browser. It interacts with the
Google Photos web interface the same way a human would: selecting photos,
clicking "Move to trash", and confirming dialogs. In dry-run mode it reads
the `aria-label` timestamp on each visible tile to count photos — again
entirely in your browser.

On your request, the tool stores **locally**:

- Your preferences (batch size, dry-run, empty-trash, filter) in
  `chrome.storage.local` / `localStorage`
- A short-lived "pending empty-trash" flag after a run that chose to
  continue to `/trash` (expires after 3 minutes and is always cleared on
  first sight)

None of this is transmitted anywhere.

## Permissions

- **`storage`** — saves your preferences and the transient empty-trash
  flag locally.
- **Host access to `https://photos.google.com/*`** — required to interact
  with the Google Photos interface. The tool only runs on this domain.

The former `activeTab` permission was removed in v3.0.0; the content
script is declared directly for the single supported domain.

## Effects on Your Google Photos Account

The tool deletes photos from your account on your behalf. Deleted photos
move to the Google Photos **Trash**, where they remain for 60 days before
permanent deletion (Google's standard policy). You can restore anything
from the trash during that window.

If you enable **"Empty trash"**, the tool navigates to
`photos.google.com/trash` after the main run and clicks "Empty trash" +
confirms — photos cleared this way are permanently gone with no recovery
window. This option is opt-in, requires your consent, and is only reported
complete after the empty state is verified. Use it with caution.

## Third-Party Services

This tool does not integrate with or send data to any third-party
services. No analytics, no telemetry, no remote logging. The **Report
issue** button opens GitHub's issue page with a diagnostic description
that you choose to submit.

## Children's Privacy

The tool is not directed at children under 13 and does not knowingly
collect personal information from anyone under 13.

## Changes to This Policy

If this policy changes, we will update it here with a new "Last updated"
date.

## Contact

For questions, open an issue at
<https://github.com/shtse8/Google-Photos-Delete-Tool/issues> or email
<shtse8@gmail.com>.
