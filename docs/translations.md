# Adding a language to the popup UI

The popup uses a tiny custom i18n layer (`src/extension/popup/i18n/`)
with English as the fallback. Adding a new language is a 3-step
process and the type system makes it impossible to ship an incomplete
translation: TypeScript will fail compilation if any key is missing.

> The **engine** itself is locale-agnostic (it matches Google Photos'
> action buttons by multilingual keywords in `src/core/selectors.ts`,
> not by UI language). The i18n described below is purely for the
> extension popup chrome.

## 1. Create the locale file

Copy `src/extension/popup/i18n/locales/en.ts` to
`src/extension/popup/i18n/locales/<code>.ts`, where `<code>` is a
2-letter ISO-639-1 code (e.g. `pl` for Polish, `ko` for Korean,
`ru` for Russian).

Translate every value. Leave the structure and the keys alone — the
`Translations` type in `i18n/types.ts` is the source of truth and
TypeScript will yell if you rename or omit anything.

```ts
import type { Translations } from '../types'

const pl: Translations = {
  header: {
    title: 'Czyszczenie Photos',
    subtitle: 'Hurtowe usuwanie z Google Photos',
  },
  // … translate every other key
}

export default pl
```

Notes on copy:

- The `{url}` placeholder in `notes.navigateFirst` is substituted at
  render time with a clickable anchor pointing at `photos.google.com`.
  Keep the placeholder verbatim; the i18n module interpolates it via
  `tHtml(key, { url })`. Any other `{name}` placeholder you add will
  be HTML-escaped by `t()` and inserted verbatim by `tHtml()` — pick
  the right one for the context.
- Hints (`maxCount.hint`, `dryRun.hint`, `emptyTrash.hint`) are
  shown below their respective field in small grey type — short
  one-liners work best.

## 2. Register the locale

Edit `src/extension/popup/i18n/index.ts`:

```ts
import pl from './locales/pl'

export type LocaleCode = 'en' | 'de' | … | 'pl'   // add the code

export const LOCALES: readonly LocaleEntry[] = Object.freeze([
  // existing entries …
  { code: 'pl', label: 'Polski', translations: pl },
])
```

The `label` field is the **native name** of the language ("Polski",
"한국어", "Русский" — never "Polish", "Korean", "Russian"). This is
what the popup picker displays.

`LocaleCode` is exhaustive on purpose — adding a new code without
registering its file will fail typecheck, and registering without
declaring the code will fail too.

## 3. Verify

```bash
bun run typecheck   # catches a missing key or wrong shape
bun run lint
bun run test        # the suite walks every required UI string
                    # in every registered locale and fails loudly
                    # if anything is missing or returns the fallback
bun run build       # bundles your new locale into popup.js
```

If `bun run test` is green, your locale is shippable.

## 4. (Optional) Make the engine recognise your language too

The engine itself recognises ~25 languages for the actual Google
Photos action buttons via three keyword dictionaries in
`src/core/selectors.ts`:

- `DELETE_KEYWORDS` — words that mean "trash / delete / remove"
- `CANCEL_KEYWORDS` — words that mean "cancel / dismiss / close"
- `EMPTY_TRASH_PHRASES` — multi-word phrases that mean "empty the
  trash" (kept as longer phrases so we never confuse them with
  "delete forever" or "restore" on the `/trash` page)

To add your language:

1. Lowercase and ASCII-fold every keyword you add (drop accents:
   `é → e`, `ö → o`, `ñ → n`). The runtime does the same to the
   text it matches against, so both sides need to be normalised.
2. Avoid keywords that are short Latin substrings of unrelated
   English words (we already learned this the hard way: `'no'`
   was originally a cancel keyword and matched "cesti**no**"). If
   your language's verb for "delete" is only 2–3 Latin characters,
   prefer the multi-word phrase variant.
3. Add tests in `tests/selectors.test.ts` that prove your labels
   match the right dictionary and the wrong dictionaries don't
   match them.

CJK / Cyrillic / Arabic scripts are fine to keep as-is — there's no
substring collision risk and the normaliser leaves them untouched.
