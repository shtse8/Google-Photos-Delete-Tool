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
    sectionLabel: 'Statistieken',
    deleted: 'Verwijderd',
    rate: 'Per minuut',
    elapsed: 'Verstreken',
    eta: 'Resterend',
  },
  settings: {
    sectionLabel: 'Instellingen',
    maxCount: {
      label: 'Foto’s per batch',
      hint: 'In lussen tot de galerij leeg is',
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
    navigateFirst: 'Open eerst {url}.',
  },
}

export default nl
