# Pro — Local License Verification (zero-server)

Pro unlocks the **analysis layer**: type filters and the dry-run
report/export. The delete engine, dry-run, and empty-trash are free
forever.

The license is an Ed25519-signed token verified entirely in the user's
browser (WebCrypto `SubtleCrypto`). There is **no account, no backend, no
telemetry** — the token never leaves the device.

## Token format

```
${base64url(payload)}.${base64url(signature)}
```

where `payload` is JSON:

```json
{ "plan": "pro", "email": "buyer@example.com", "issuedAt": 1786300000000 }
```

- `email` is optional.
- The signature is Ed25519 over the payload bytes, made with the seller's
  private key.
- Verification (see `src/core/license.ts`) checks format, plan, and
  signature with the embedded public key. Bad signature / wrong plan /
  malformed → rejected, never crashed.

## Seller tooling

```bash
# 1. Generate a keypair (creates ~/.gpdt/gpdt-license-private.pem, mode 600)
bun run license:keygen
#    → prints the PUBLIC key to embed in src/core/license.ts
#    → or export it as GPDT_PRO_PRIVATE_KEY for ephemeral CI use

# 2. Issue a Pro token for a buyer
bun run license:issue --email=buyer@example.com

# 3. Verify a token against the embedded key
bun run license:verify <token>
```

## Key custody (critical)

- The private key **never enters this repository**. The canonical record
  is `/home/codex/secure/gpdt-pro-license.key` (base64url PKCS8 DER,
  mode 600); the seller tooling default is `~/.gpdt/gpdt-license-private.pem`
  (same keypair, PEM form, mode 600). Both locations are outside the
  repo; `$GPDT_PRO_PRIVATE_KEY` overrides the path for CI/signing
  servers. The embedded public key in `src/core/license.ts` matches this
  keypair — verified end-to-end (`license:issue` → `license:verify`).
- **Losing the private key invalidates every issued token.** Users cannot
  re-verify. There is no revocation server by design.
- Rotation: run `license:keygen`, embed the new public key in
  `src/core/license.ts`, release. Old tokens stop verifying — that is
  intentional and documented.
- Issued tokens are single-payload licenses; there is deliberately no
  expiry field (a lifetime token cannot be revoked without key rotation).

## Testing

`tests/license.test.ts` verifies the full sign→verify cycle with a
throwaway keypair plus the production-key shape check, without the seller
key.

## Sales integration (user-authority handoff)

1. **Gumroad product.** One-time purchase, digital deliverable. Price is
   a business decision (suggested entry: $5–9 USD — a convenience unlock
   for power users of a free tool).
2. **Delivery.** The checkout confirmation/email tells the buyer to open
   the extension → Pro → paste the token. Tokens are issued per order
   with `bun run license:issue --email=<buyer email>`; keep an order
   ledger (email ↔ token ↔ date) outside the repo for support.
3. **Manual issuance is correct at this scale.** If volume ever makes it
   painful, add a serverless issuer (still Ed25519; the embedded public
   key does not change). Paddle License API is the managed alternative —
   it adds an account system and a server; do not adopt it until manual
   issuance actually hurts.

## Chrome Web Store compliance note

The extension itself is free and its core functionality (batch delete,
dry-run, empty-trash) is fully free. Pro unlocks **additive analysis**
(type filters, dry-run report/export) via a token sold outside the
Chrome Web Store — the standard compliant shape for CWS (no in-extension
payment processing, no paywalled core). The CWS listing description must
**disclose the paid Pro layer**; updating the listing text is a
storefront handoff (the current listing still carries v2 wording).
