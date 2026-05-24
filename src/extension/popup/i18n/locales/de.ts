import type { Translations } from '../types'

const de: Translations = {
  header: {
    title: 'Photos aufräumen',
    subtitle: 'Google Photos Massenlöschung',
  },
  status: {
    ready: 'Bereit',
    selecting: 'Fotos auswählen…',
    deleting: 'Stapel wird gelöscht…',
    scrolling: 'Mehr Fotos laden…',
    paused: 'Pausiert',
    done: 'Fertig',
    error: 'Fehler',
    idle: 'Bereit',
    navigatingTrash: 'Papierkorb wird geöffnet…',
    emptyingTrash: 'Papierkorb wird geleert…',
  },
  stats: {
    deleted: 'Gelöscht',
    rate: 'Pro Minute',
    elapsed: 'Vergangen',
    eta: 'Verbleibend',
  },
  settings: {
    sectionLabel: 'Einstellungen',
    maxCount: {
      label: 'Max. Fotos',
      hint: 'Stapelgröße und Obergrenze',
    },
    dryRun: {
      label: 'Testlauf',
      hint: 'Nur zählen, nicht löschen',
    },
    emptyTrash: {
      label: 'Papierkorb leeren',
      hint: 'Danach endgültig löschen',
    },
    language: {
      label: 'Sprache',
      trigger: 'Sprache ändern',
    },
  },
  actions: {
    start: 'Starten',
    pause: 'Pause',
    resume: 'Fortsetzen',
    stop: 'Stoppen',
  },
  notes: {
    navigateFirst: 'Öffne zuerst photos.google.com.',
  },
}

export default de
