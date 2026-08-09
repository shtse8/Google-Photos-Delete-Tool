# Release Gate — Live-Run Evidence Protocol

Every release of Google Photos Delete Tool must carry **live-run
evidence** in its release notes. A green CI pipeline proves the source;
only a real run against Google Photos proves the product. This gate is
that second proof.

## Why

- Google Photos changes its DOM and localization without notice; selectors
  and dialog flows drift.
- "Done" for a destructive tool must mean *verified* done.
- The selector pack (`src/selector-packs/pack-v1.json`) is a data patch
  precisely so that a drift found here is cheap to fix and re-verify.

## Protocol (per release)

Use a **disposable Google account** and a gallery you do not care about.

1. **Seed** — upload N known photos (mix of photos, at least one
   screenshot and one video) to a fresh account. Record N and the exact
   labels for a few items.
2. **Dry-run** — run the tool in dry-run mode from the top of the gallery.
   Record the reported total. It must be `>= N` (it can exceed N because
   burst/label collisions can undercount, never overcount in a way that
   matters here — the count is a floor).
3. **Real run, default settings** — run a real delete with default
   maxCount (500). Record:
   - final deleted count == N
   - the selection counter reset to 0 after every batch (the engine
     already fails closed if it does not, but record it)
   - the gallery reached end-of-list and the final partial batch flushed
4. **Trash postcondition** — verify `/trash` contains exactly the N seeded
   items (restore not needed; just confirm presence).
5. **Empty-trash (opt-in)** — run one small deletion followed by "Empty
   trash afterwards"; record that the flow navigated to `/trash`, clicked
   empty, and reported `done` only after the empty-state postcondition.
6. **Stop / pause / resume** — start a run on a large gallery, stop it
   mid-batch; record that it reports stopped/idle (never error) and that a
   subsequent run starts cleanly.
7. **Localized UI spot check** — repeat step 3 in at least one non-English
   locale (fr or zh) to exercise the keyword matchers.
8. **Speed measurement** — from step 3, record photos/minute (deleted /
   elapsed) for the release notes.

## Evidence record

Release notes must include a table:

| Check | Result | Evidence |
|---|---|---|
| Dry-run total vs seeded N | `>= N` | count + N |
| Deleted == N | pass | deleted count |
| Batch counter resets | pass | per-batch logs |
| Trash contents | N items present | screenshot/URL |
| Empty-trash postcondition | done after verify | status logs |
| Stop mid-batch | idle, no error | status logs |
| Locale spot check | pass | locale + count |

If any check fails: fix the root cause (usually a selector-pack data
patch), bump the pack version, and re-run the whole gate before tagging.

## Drift triage SLA

- Diagnostic reports arrive via the **Report issue** button (panel) or
  popup; each carries the pack version + selector-match evidence.
- A confirmed selector drift gets a pack patch (data change, `patch`
  version bump) within 48h; the full release gate re-runs before publish.
