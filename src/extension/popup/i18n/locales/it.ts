import type { Translations } from '../types'

const it: Translations = {
  header: {
    title: 'Pulizia Photos',
    subtitle: 'Eliminazione in massa di Google Photos',
  },
  status: {
    ready: 'Pronto',
    selecting: 'Selezione foto…',
    deleting: 'Eliminazione lotto…',
    scrolling: 'Caricamento altre foto…',
    paused: 'In pausa',
    done: 'Completato',
    error: 'Errore',
    idle: 'Inattivo',
    navigatingTrash: 'Apertura del cestino…',
    emptyingTrash: 'Svuotamento del cestino…',
  },
  stats: {
    deleted: 'Eliminate',
    rate: 'Al minuto',
    elapsed: 'Trascorso',
    eta: 'Rimanente',
  },
  settings: {
    sectionLabel: 'Impostazioni',
    maxCount: {
      label: 'Foto max',
      hint: 'Dimensione lotto e tetto',
    },
    dryRun: {
      label: 'Prova a vuoto',
      hint: 'Conta senza eliminare',
    },
    emptyTrash: {
      label: 'Svuota cestino',
      hint: 'Elimina definitivamente dopo',
    },
    language: {
      label: 'Lingua',
      trigger: 'Cambia lingua',
    },
  },
  actions: {
    start: 'Avvia',
    pause: 'Pausa',
    resume: 'Riprendi',
    stop: 'Arresta',
  },
  notes: {
    navigateFirst: 'Apri prima photos.google.com.',
  },
}

export default it
