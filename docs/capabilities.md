# Google Photos Delete Tool capability graph

The destination is [vision.md](vision.md). This graph records durable product
responsibilities and true dependency edges, not a work queue, release status, or
claim that a live browser run has passed.

| ID | Capability | Depends on | Done when |
| --- | --- | --- | --- |
| GPDT-ENTER | Enter a supported, locally controlled surface | — | The extension or userscript activates only for `photos.google.com`, identifies the chosen current view as the action scope, and offers a click-free dry-run before destructive work. |
| GPDT-OBSERVE | Interpret the current Google Photos DOM fail closed | GPDT-ENTER | A versioned pack identifies media tiles, selection state, scroll container, dialogs, and destructive candidates; action candidates require a pack-owned exact action selector or positive accessible text, unknown DOM returns no candidate, and bounded diagnostics retain the pack and observed match evidence. |
| GPDT-PREVIEW | Preview the current-view scope without mutation | GPDT-OBSERVE | The dry-run path scrolls and counts observed matching labels without invoking any click, clearly treats deduplicated label counts as browser observations, and can be stopped without becoming a destructive run. |
| GPDT-CONSENT | Admit explicit destructive intent | GPDT-ENTER | Every non-dry run is refused when the shared local consent acknowledgement is absent or unreadable, and choosing the permanent empty-trash option makes that consequence visible before admission. |
| GPDT-BATCH | Move matching media to Trash through bounded actions | GPDT-OBSERVE, GPDT-CONSENT | The engine selects only currently unchecked matching tiles up to the configured positive batch limit, bounds selection settling, scroll settling, end-of-list detection, and action/dialog waits, and clicks delete and confirm only after positive identification. |
| GPDT-BATCH-VERIFY | Verify each recoverable deletion batch | GPDT-BATCH | After confirmation, the engine waits within the action timeout for the selected count to return to zero, increments the deleted total only after that observation, flushes a final partial batch, and reports timeout or selector drift as error instead of `done`. |
| GPDT-CONTROL | Keep a run under present user control | GPDT-BATCH | Pause holds progress, resume continues the same engine, stop interrupts action waits and resolves to idle, and a supported surface cannot start a second engine while the first run is settling. |
| GPDT-TRASH-HANDOFF | Bound navigation into the permanent Trash flow | GPDT-BATCH-VERIFY, GPDT-CONSENT | Navigation occurs only when the explicit empty-trash option survived a clean real run that deleted at least one item; a successfully persisted handoff is consumed once, expires after three minutes, and is accepted only on `/trash` or its subpaths. |
| GPDT-EMPTY-VERIFY | Empty Trash only with an exact observed postcondition | GPDT-OBSERVE, GPDT-TRASH-HANDOFF | The flow positively identifies the empty action, dialog, and destructive confirmation within per-step timeouts, then emits `done` only after the action and dialog disappear or an explicit empty-state signal appears; ambiguous or unverifiable state emits an error. |
| GPDT-EVIDENCE | Qualify behavior against the live Google Photos surface | GPDT-PREVIEW, GPDT-BATCH-VERIFY, GPDT-CONTROL, GPDT-EMPTY-VERIFY | Source and local tests pass, and each release making a live claim records the disposable-account checks in `RELEASE_GATE.md`: seeded-item counts, batch resets, exact Trash contents, empty-trash postcondition, stop/restart, and a localized run. |

## Repository evidence

- `GPDT-OBSERVE`: [selector-pack.ts](../src/core/selector-pack.ts),
  [selectors.ts](../src/core/selectors.ts), and
  [selectors.test.ts](../tests/selectors.test.ts)
- `GPDT-PREVIEW`, `GPDT-BATCH`, `GPDT-BATCH-VERIFY`, and `GPDT-CONTROL`:
  [delete-engine.ts](../src/core/delete-engine.ts),
  [config.ts](../src/core/config.ts), and
  [delete-engine.test.ts](../tests/delete-engine.test.ts)
- `GPDT-CONSENT`: [page-runner.ts](../src/core/page-runner.ts),
  [content.ts](../src/extension/content.ts), and
  [ui-wiring.test.ts](../tests/ui-wiring.test.ts)
- `GPDT-TRASH-HANDOFF`: [empty-trash-baton.ts](../src/core/empty-trash-baton.ts)
  and [empty-trash-baton.test.ts](../tests/empty-trash-baton.test.ts)
- `GPDT-EMPTY-VERIFY`: [empty-trash.ts](../src/core/empty-trash.ts) and
  [empty-trash.test.ts](../tests/empty-trash.test.ts)
- `GPDT-EVIDENCE`: [RELEASE_GATE.md](RELEASE_GATE.md)

The source and tests above are source/local evidence at the repository revision
being inspected. The live-release protocol is an additional oracle, not evidence
that this documentation change performed or passed a browser run.
