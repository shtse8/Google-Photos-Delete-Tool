# License provenance

This repository is released under **MIT** (see `LICENSE`).

## Upstream

The project is a fork of
[mrishab/google-photos-delete-tool](https://github.com/mrishab/google-photos-delete-tool)
(1.5k+ stars, last upstream commit 2025-01-05).

**Upstream has no LICENSE file** as of 2026-08-09 (verified at
`https://github.com/mrishab/google-photos-delete-tool` — no `LICENSE`
in the root, no license metadata in the repository description).

## What that means

- The fork's MIT claim is a good-faith assumption: the original author
  (mrishab) published the code publicly with no explicit license, which
  under strict copyright law means "all rights reserved". In practice
  the project has been widely forked and reused, and this fork credits
  the original author in README + git history.
- **This is a residual risk, not a clean assertion.** If you intend to
  commercialize beyond the current scope, either:
  1. Obtain explicit permission from the upstream author (issue or email),
     or
  2. Reimplement the engine from scratch (the v3 engine, selector pack,
     and diagnostics are already clean-room rewrites — the remaining
     upstream-derived surface is the general idea of automating Google
     Photos' UI, which is not copyrightable as an idea, plus the UI
     look-and-feel of the floating panel).

## v3 status

The v3 codebase (engine refactor, DOM adapter, selector pack, license
layer, diagnostics, tests, build system, docs) is a rewrite produced for
this repository. The MIT claim applies to this repository's own code.
