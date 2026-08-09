import type { Translations } from '../types'

const de: Translations = {
  header: {
    title: "Photos aufräumen",
    subtitle: "Google Photos Massenlöschung",
  },
  status: {
    ready: "Bereit",
    selecting: "Fotos auswählen…",
    deleting: "Stapel wird gelöscht…",
    scrolling: "Mehr Fotos laden…",
    paused: "Pausiert",
    done: "Fertig",
    error: "Fehler",
    idle: "Bereit",
    navigatingTrash: "Papierkorb wird geöffnet…",
    emptyingTrash: "Papierkorb wird geleert…",
    consentRequired: "Zustimmung erforderlich — bestätigen Sie zuerst den Sicherheitshinweis.",
  },
  stats: {
    sectionLabel: "Statistik",
    deleted: "Gelöscht",
    rate: "Pro Minute",
    elapsed: "Vergangen",
    eta: "Verbleibend",
  },
  settings: {
    sectionLabel: "Einstellungen",
    maxCount: {
      label: "Fotos pro Stapel",
      hint: "Schleife bis Galerie leer",
    },
    dryRun: {
      label: "Testlauf",
      hint: "Nur zählen, nicht löschen",
    },
    emptyTrash: {
      label: "Papierkorb leeren",
      hint: "Danach endgültig löschen",
    },
    language: {
      label: "Sprache",
      trigger: "Sprache ändern",
    },
    filter: {
      label: "Filter",
      hint: "Pro: Bereinigung nach Typ eingrenzen",
      all: "Alle Elemente",
      screenshot: "Screenshots",
      video: "Videos",
      photo: "Fotos",
      animation: "Animationen",
      collage: "Collagen",
    },
    license: {
      label: "Pro-Lizenz",
      hint: "Lokal geprüft; verlässt das Gerät nie",
      placeholder: "Lizenz-Token einfügen",
      activate: "Aktivieren",
      active: "Pro aktiv — Filter aktiviert",
      invalid: "Ungültiger Lizenz-Token",
    },
  },
  actions: {
    start: "Starten",
    pause: "Pause",
    resume: "Fortsetzen",
    stop: "Stoppen",
    report: "Problem melden",
    copySummary: "Zusammenfassung kopieren",
    exportCsv: "CSV exportieren",
    viewTrash: "Papierkorb ansehen",
  },
  notes: {
    navigateFirst: "Öffne zuerst {url}.",
  },
  consent: {
    title: "Bevor Sie beginnen",
    trashNote: "Fotos werden in den Papierkorb verschoben (60 Tage wiederherstellbar).",
    permanentNote: "„Papierkorb danach leeren“ ist ENDGÜLTIG — keine Wiederherstellung.",
    check: "Ich verstehe und befinde mich in der Google-Photos-Ansicht, die ich bereinigen möchte.",
    confirm: "Bestätigen und starten",
    cancel: "Abbrechen",
  },
}

export default de
