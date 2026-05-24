/**
 * Shape of a locale's translations. French is the reference locale —
 * every locale file must export an object that conforms to this type.
 * TypeScript will fail compilation if a translation is missing.
 *
 * Keep keys grouped by UI section so the popup.ts code stays readable.
 */
export interface Translations {
  header: {
    title: string
    subtitle: string
  }
  status: {
    ready: string
    selecting: string
    deleting: string
    scrolling: string
    paused: string
    done: string
    error: string
    idle: string
  }
  stats: {
    deleted: string
    rate: string
    elapsed: string
    eta: string
  }
  settings: {
    sectionLabel: string
    maxCount: { label: string; hint: string }
    dryRun: { label: string; hint: string }
    language: { label: string; trigger: string }
  }
  actions: {
    start: string
    pause: string
    resume: string
    stop: string
  }
  notes: {
    navigateFirst: string
  }
}

/** Browser-language → locale-code mapping for first-run auto-detect. */
export type LocaleCode = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt' | 'nl' | 'ja' | 'zh'

/** A locale option shown in the language picker. */
export interface LocaleEntry {
  code: LocaleCode
  /** Native name of the language ("Français", "English", "日本語"…) */
  label: string
  translations: Translations
}
