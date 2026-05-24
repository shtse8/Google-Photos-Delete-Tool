import type { Translations } from '../types'

const en: Translations = {
  header: {
    title: 'Photos Cleanup',
    subtitle: 'Google Photos bulk delete',
  },
  status: {
    ready: 'Ready',
    selecting: 'Selecting photos…',
    deleting: 'Deleting batch…',
    scrolling: 'Loading more photos…',
    paused: 'Paused',
    done: 'Done',
    error: 'Error',
    idle: 'Idle',
  },
  stats: {
    deleted: 'Deleted',
    rate: 'Per minute',
    elapsed: 'Elapsed',
    eta: 'ETA',
  },
  settings: {
    sectionLabel: 'Settings',
    maxCount: {
      label: 'Max photos',
      hint: 'Batch size and run cap',
    },
    dryRun: {
      label: 'Dry run',
      hint: 'Count only, no deletion',
    },
    language: {
      label: 'Language',
      trigger: 'Change language',
    },
  },
  actions: {
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',
  },
  notes: {
    navigateFirst: 'Open photos.google.com first.',
  },
}

export default en
