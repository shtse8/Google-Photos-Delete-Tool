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
    navigatingTrash: 'Opening trash…',
    emptyingTrash: 'Emptying trash…',
  },
  stats: {
    sectionLabel: 'Stats',
    deleted: 'Deleted',
    rate: 'Per minute',
    elapsed: 'Elapsed',
    eta: 'ETA',
  },
  settings: {
    sectionLabel: 'Settings',
    maxCount: {
      label: 'Photos per batch',
      hint: 'Looped until the gallery is empty',
    },
    dryRun: {
      label: 'Dry run',
      hint: 'Count only, no deletion',
    },
    emptyTrash: {
      label: 'Empty trash',
      hint: 'Permanently delete afterwards',
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
    navigateFirst: 'Open {url} first.',
  },
}

export default en
