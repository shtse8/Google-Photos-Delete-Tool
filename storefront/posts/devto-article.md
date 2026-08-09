# dev.to article outline

Title: "I automated a website that has no delete API — without breaking
the safety rules"

Hook: Google Photos has no "delete all" and its Library API cannot delete
media items. The only practical path is DOM automation — which is
exactly the kind of thing that scares people. This post is about the
constraints that make it safe.

## Outline

1. The problem
   - No bulk delete in the product; Library API list/get/batchGet/batchCreate
     only — no delete endpoint.
   - "Just click buttons in a loop" is the naive answer and it's wrong.
2. The safety model (the interesting part)
   - Fail-closed matching: positive multilingual keyword match against
     aria-label/tooltip/text; unknown UI → stop and error, never guess.
   - Consent gate; opt-in empty-trash with verified postcondition.
   - Versioned selector packs: UI drift = data patch, not code surgery
     (show the pack JSON and the diagnostic blob).
3. The release gate
   - Tag == package.json version enforced in CI; artifacts byte-verified;
     evidence per layer (source / CI / deploy / live).
4. Distribution as a system
   - One tag → GitHub release; stores published by a stateful retry loop
     that treats review queues as expected states (store-state branch).
5. Numbers so far
   - 10k+ CWS installs, 9 languages, 100% issue reports with diagnostic
     blobs (replace with current numbers at publish time — do not invent).

## Where to publish

dev.to, then cross-link from the README. Also post the safety-architecture
section on r/webdev / r/opensource as text (no link first — offer it in
reply only if asked).
