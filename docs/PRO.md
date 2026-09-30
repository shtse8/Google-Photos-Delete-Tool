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

## Key custody

- The private key stays outside this repository. The seller tooling reads
  `~/.gpdt/gpdt-license-private.pem` (mode 600), or the path in
  `$GPDT_PRO_PRIVATE_KEY` for CI. The public key embedded in
  `src/core/license.ts` matches it.
- Losing the private key invalidates every issued token, and there is no
  revocation server by design.
- Rotation: run `license:keygen`, embed the new public key, release. Old tokens
  stop verifying.
- Tokens carry no expiry field; a lifetime token cannot be revoked without key
  rotation.

## Testing

`tests/license.test.ts` verifies the full sign→verify cycle with a
throwaway keypair plus the production-key shape check, without the seller
key.

## Sales

1. **Gumroad product:** one-time purchase, digital deliverable, a convenience
   unlock for power users of a free tool.
2. **Delivery:** the checkout email tells the buyer to open the extension, then
   Pro, and paste the token. Issue one per order with
   `bun run license:issue --email=<buyer email>` and keep an order ledger
   (email, token, date) outside the repo for support.
3. **Scale:** manual issuance fits current volume. A serverless issuer keeps the
   same Ed25519 key; Paddle's License API is the managed alternative.

## Chrome Web Store compliance

The extension is free and its core (batch delete, dry run, empty trash) is
fully free. Pro adds analysis (type filters, dry-run report and export) through
a token sold outside the store, the standard compliant shape for the Chrome Web
Store: no in-extension payment and no paywalled core. The store listing
discloses the paid Pro layer.
