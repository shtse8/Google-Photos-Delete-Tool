# Google Photos Delete Tool vision

This file is the canonical product destination. It is not a current milestone,
release claim, or proof that Google Photos' live DOM still matches the tool.

## What finished is

A person can inspect the media in the Google Photos view they chose, deliberately
move matching items to Trash in bounded batches, and optionally empty Trash
without the tool guessing at a destructive control or reporting completion from
a click alone.

## For whom

People reclaiming storage or removing a known collection from their own Google
Photos account, while present to choose the scope, acknowledge the risk, and
stop or pause the run.

## Product promise

**Chosen view -> explicit intent -> bounded DOM action -> observed
postcondition.**

The customer contract is:

- A dry run observes the current view without clicking media or destructive
  controls. It is a preview, not authority to delete.
- Every real run is refused until the local consent acknowledgement exists.
  Selecting `Empty trash afterwards` also presents the permanent-action warning.
- Media, counters, containers, and action controls are recognized through the
  versioned selector pack. A destructive control requires a pack-owned exact
  action selector or a positive accessible label, tooltip, or text match;
  unknown DOM stops the action.
- Selection, scrolling, action discovery, dialog discovery, and confirmation
  waits have explicit batch, retry, settle, or time bounds. Pause, resume, and
  stop remain user-controlled.
- A batch contributes to the deleted count only after the selected counter
  returns to zero. Optional empty-trash completion is stronger: `done` requires
  the empty action and dialog to disappear or an explicit empty-state signal.
- Empty-trash navigation is admitted only after a clean real run deleted at
  least one item. Its handoff is single-use, expires after three minutes, and is
  accepted only on the exact `/trash` path family.

## Boundary

- The product acts only on `photos.google.com`. It is not a Google Photos API
  client, downloader, multi-site automation service, or unattended scheduler.
- Supported customer surfaces are the Chrome/Firefox extension and the
  userscript. The standalone build is a development artifact, not a third
  supported product surface.
- The deletion engine, dry run, and optional empty-trash flow are the core
  product. Local Pro licensing may unlock analysis and filters, but it must not
  weaken the destructive-action contract.
- The browser runtime is local: no product server or telemetry is required.
  Google owns its DOM, Trash behavior, and server-side state.
- A DOM postcondition proves what the tool observed in that page. It does not by
  itself prove whole-account or server-side deletion.

## Oracle

Source and local tests prove deterministic engine, selector, consent, handoff,
and failure behavior. A current live-product claim additionally requires the
disposable-account protocol in [RELEASE_GATE.md](RELEASE_GATE.md), including
known seeded items, per-batch counter resets, exact Trash contents, the
empty-state postcondition, stop/restart behavior, and a localized run. Docs, CI,
a store listing, or a release artifact alone are not live-browser proof.

The durable product responsibilities and dependency edges are in
[capabilities.md](capabilities.md).
