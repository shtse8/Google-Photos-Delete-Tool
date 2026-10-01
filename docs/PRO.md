# Pro — Local License Verification (zero-server)

Pro unlocks the **analysis layer**: type filters, the date filter and
the dry-run report/export. The delete engine, dry-run, and empty-trash are free
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
  signature with the embedded public keys. Bad signature / wrong plan /
  malformed → rejected, never crashed.

## Seller tooling

```bash
# 1. Generate a keypair (creates ~/.gpdt/gpdt-license-private.pem, mode 600)
bun run license:keygen

# 2. Issue a Pro token for a buyer
bun run license:issue --email=buyer@example.com

# 3. Verify a token against the embedded keys
bun run license:verify <token>
```

`$GPDT_PRO_PRIVATE_KEY` may be either a path to the key file or the key
content itself (PEM or base64url PKCS8). If the value names an existing file it
is read; otherwise it is used as content. `keygen` and `issue` follow the same
rule, and the key is never printed.

## Key custody

- The private key stays outside this repository, in 1Password: item
  "GPDT Pro license private key" in the Sylphx vault.
- Two public keys are accepted, listed in `PRO_PUBLIC_KEYS_BASE64URL`
  (`src/core/license.ts`), and a token is valid if either verifies it:
  1. the original key, whose private half was lost. It stays so every token
     ever issued under it keeps working;
  2. the current key (`-LFAzRTKamgPJ57qEW8-XdOpzFZ50JhT6b7thTQe8GQ`), which
     signs all new tokens.
- Rotation: generate a new pair, append its public key, release. Never remove
  a key that has issued tokens, because that invalidates them.
- There is no revocation server by design, and tokens carry no expiry.

## Testing

`tests/license.test.ts` verifies the full sign→verify cycle with a
throwaway keypair plus the embedded-key list, and
`tests/license-scripts.test.ts` checks that the path and content forms of
`$GPDT_PRO_PRIVATE_KEY` both issue verifiable tokens, without the seller key.
`tests/license-buyer.test.ts` covers `verify-buyer` (old/new key, email match,
wrong plan, foreign signature) with throwaway keys.

## Conversion test

The Pro paywall copy is A/B tested without telemetry. Each install picks
variant `a` (original wording) or `b` (value-first wording, "Unlock Pro") once
at random and keeps it in local storage (`chrome.storage.local` in the
extension, `localStorage` in the userscript); if storage fails it uses `a`.
Nothing is sent anywhere. The variant only appears as `utm_content=a|b` on the
Pro link a user chooses to click, next to `utm_source=extension`,
`utm_medium` (`dryrun_teaser`, `post_run`, `date_filter`, `license_box`) and
`utm_campaign=pro`. All links are built from `PRO_URL` in
`src/core/pro-moments.ts`; point that constant at the Stripe Payment Link to
have Stripe record the UTM parameters on each checkout.

Reading results:

- **Stripe:** checkout sessions (Payments, then Checkout sessions, or the
  Payment Link's detail page) show the URL parameters each session started with;
  count paid sessions per `utm_content` (and per `utm_medium` for the moment).
  Compare against clicks only if the link is served from a page that counts
  them; Stripe alone gives purchases, not impressions.
- **Chrome Web Store dashboard:** installs and uninstalls per period give the
  denominator. Installs are not split by variant, so divide paid sessions of
  each variant by half the installs (the split is random and even), and run
  the test over whole weeks before comparing.
- Keep both variants until the gap is larger than noise at the observed
  purchase counts; then set the winner as the only copy and drop the other.

## Sales

1. **Product:** Pro is sold as a Stripe Payment Link, US$9.99 one-time and
   lifetime, a convenience unlock for power users of a free tool. The
   README `#pro` section links to it (`PAYMENT_LINK_URL`), and both the popup
   and the userscript panel point to that anchor, so the link can change without
   a store release.
2. **Issuance:** automated, one token per paid order, signed with the current
   key and emailed to the buyer, who pastes it under Pro in the extension. The
   issuer's runbook lives outside this repository.
3. **Support:** the order record (email, date) lives in Stripe; reissue with
   `bun run license:issue --email=<buyer email>`.
4. **First-purchase readback:** after the first paid order, check the emailed
   token without printing it back:
   `bun run scripts/license.ts verify-buyer <token> --email=<buyer email>`.
   It prints `valid`, which embedded key verified it (`old` or `new`; new
   orders must say `new`), `plan`, `email match` and `issuedAt` as an ISO time.
   Exit code 0 only when the token is valid, the plan is `pro` and the email
   matches (case-insensitive); anything else exits 1. The token is never
   echoed.

## Chrome Web Store compliance

The extension is free and its core (batch delete, dry run, empty trash) is
fully free. Pro adds analysis (type filters, dry-run report and export) through
a token sold outside the store, the standard compliant shape for the Chrome Web
Store: no in-extension payment and no paywalled core. The store listing
discloses the paid Pro layer.
