# Privacy Policy — Google Photos Delete Tool

**Last updated:** May 24, 2026

## Overview

Google Photos Delete Tool is a browser extension that helps you bulk
delete photos from Google Photos. Your privacy is important to us.

## Data Collection

**We do not collect, store, or transmit any user data.** Specifically:

- No personally identifiable information is collected
- No photo data leaves your browser
- No analytics or tracking is used
- No data is sent to external servers
- No cookies are set by this extension

## How It Works

The extension operates entirely within your browser. It interacts
with the Google Photos web interface to select and delete photos
based on your settings. Specifically, it:

- Reads photo metadata visible in the page (selection state, the
  `aria-label` timestamp on each tile when counting in dry-run mode)
- Clicks the same UI elements (checkboxes, "Move to trash" toolbar
  button, confirmation dialogs) a human user would click

All operations happen locally in your browser tab. No data is
persisted beyond the current browsing session, and the run results
are kept only in transient browser memory.

## Permissions

- **`activeTab`** — used to inject the deletion UI into the active
  Google Photos tab when you click the extension icon
- **`storage`** — used to save your preferences (batch size, dry-run
  toggle, empty-trash toggle, language) locally via
  `chrome.storage.local`. Never transmitted off your device.
- **Host access to `https://photos.google.com/*`** — required to
  interact with the Google Photos interface for photo selection and
  deletion. The extension only runs on this domain; no other site is
  affected.

## Data Security

Because the extension does not collect or store any user data,
there are no extra data-security measures beyond the standard
sandboxing provided by your browser.

## Effects on Your Google Photos Account

The extension deletes photos from your account on your behalf.
Deleted photos move to the Google Photos **Trash**, where they remain
for 60 days before permanent deletion (Google's standard policy). You
can restore anything from the trash during that window.

If you enable the **"Empty trash"** option, the extension navigates
to `photos.google.com/trash` after the main run and clicks "Empty
trash" + confirms — photos cleared this way are permanently gone
with no recovery window. Use that option with caution.

## Third-Party Services

This extension does not integrate with or send data to any
third-party services. No analytics, no telemetry, no remote logging.

## Children's Privacy

The extension is not directed at children under 13 and does not
knowingly collect personal information from anyone under 13.

## Changes to This Policy

If this policy changes, we will update it here with a new
"Last updated" date at the top.

## Contact

For questions or concerns, please open an issue at:
<https://github.com/shtse8/Google-Photos-Delete-Tool/issues>

Or email: <shtse8@gmail.com>
