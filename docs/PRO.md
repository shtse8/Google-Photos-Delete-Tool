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

- The private key **never enters this repository**. It lives in
  `~/.gpdt/gpdt-license-private.pem` (mode 600) on the seller's machine
  (or `$GPDT_PRO_PRIVATE_KEY` for CI/signing servers).
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

## Sales integration

Gumroad or equivalent checkout produces the buyer's email → issue a token
offline → deliver it in the checkout confirmation (or via email). The
buyer pastes it into the panel / popup "Pro license" field; it is verified
locally and stored in `localStorage` / `chrome.storage.local`.
