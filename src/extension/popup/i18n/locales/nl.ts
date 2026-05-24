import type { Translations } from '../types'

const nl: Translations = {
  header: {
    title: 'Photos opruimen',
    subtitle: 'Google Photos bulkverwijdering',
  },
  status: {
    ready: 'Klaar',
    selecting: 'Foto’s selecteren…',
    deleting: 'Batch verwijderen…',
    scrolling: 'Meer foto’s laden…',
    paused: 'Gepauzeerd',
    done: 'Klaar',
    error: 'Fout',
    idle: 'Inactief',
    navigatingTrash: 'Prullenbak openen…',
    emptyingTrash: 'Prullenbak legen…',
  },
  stats: {
    deleted: 'Verwijderd',
    rate: 'Per minuut',
    elapsed: 'Verstreken',
    eta: 'Resterend',
  },
  settings: {
    sectionLabel: 'Instellingen',
    maxCount: {
      label: 'Max. foto’s',
      hint: 'Batchgrootte en plafond',
    },
    dryRun: {
      label: 'Proefrit',
      hint: 'Alleen tellen, niet verwijderen',
    },
    emptyTrash: {
      label: 'Prullenbak legen',
      hint: 'Daarna definitief verwijderen',
    },
    language: {
      label: 'Taal',
      trigger: 'Taal wijzigen',
    },
  },
  actions: {
    start: 'Starten',
    pause: 'Pauzeren',
    resume: 'Hervatten',
    stop: 'Stoppen',
  },
  notes: {
    navigateFirst: 'Open eerst photos.google.com.',
  },
}

export default nl
