# Google Photos Delete Tool vision

## Goal

A person can inspect the media in the Google Photos view they chose, find
look-alike copies, deliberately move matching or chosen items to Trash in
bounded batches, and optionally empty Trash, without the tool ever guessing at a
destructive control or reporting completion from a click alone.

Capabilities and their code: [capabilities.md](capabilities.md).

## For whom

People reclaiming storage or removing a known collection from their own Google
Photos account, present to choose the scope, accept the risk, and stop the run.

## Promise

**Chosen view -> explicit intent -> bounded DOM action -> observed
postcondition.**

- A dry run observes the view without clicking media or destructive controls.
- Find duplicates hashes each tile's thumbnail locally and groups look-alikes at
  a similarity the person sets. Every group keeps at least one item, the person
  reviews each keep/Trash choice, and only approved ids reach the batch flow.
- Every real run needs the local consent acknowledgement; choosing
  "Empty trash afterwards" shows the permanent-action warning.
- A destructive control needs a pack-owned exact selector or a positive
  accessible label, tooltip or text; an unknown DOM stops the action.
- Selection, scrolling, dialog discovery and confirmation waits have explicit
  batch, retry and time bounds; pause, resume and stop stay with the user.
- A batch counts as deleted only after the selection counter returns to zero.
  Empty-trash `done` requires the empty action and dialog to disappear or an
  explicit empty-state signal.
- Empty-trash navigation happens only after a clean real run that deleted at
  least one item, through a single-use handoff that expires after three minutes
  and is accepted only on the `/trash` path.

## Boundaries

- The tool acts only on `photos.google.com`. It is not a Google Photos API
  client, a downloader, a multi-site service or an unattended scheduler.
- Supported surfaces: the Chromium/Firefox MV3 extension and the userscript.
  The standalone build is a development artifact.
- The deletion engine, dry run and empty-trash flow are free. Pro licensing
  unlocks analysis and filters and never weakens the destructive-action contract.
- No product server or telemetry. Google owns its DOM, Trash behavior and
  server-side state; a DOM postcondition proves what the tool saw in the page.

## Target metrics

- Zero deletions of a photo the person did not choose or approve.
- Zero `done` reports without an observed postcondition.
- A Google UI change is fixed by a selector-pack patch within 48 hours of a
  confirmed report ([RELEASE_GATE.md](RELEASE_GATE.md)).
- Store rating 4.5 or higher, with every review answered.

## How it is judged

Source and local tests cover engine, selector, consent, handoff and failure
behavior. A claim about the live product additionally needs the
disposable-account protocol in [RELEASE_GATE.md](RELEASE_GATE.md).
