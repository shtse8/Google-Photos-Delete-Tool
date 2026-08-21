import type { Translations } from '../types'

const en: Translations = {
  header: {
    title: "Photos Cleanup",
    subtitle: "Google Photos bulk delete",
  },
  status: {
    ready: "Ready",
    selecting: "Selecting photos…",
    deleting: "Deleting batch…",
    scrolling: "Loading more photos…",
    paused: "Paused",
    done: "Done",
    error: "Error",
    idle: "Idle",
    navigatingTrash: "Opening trash…",
    emptyingTrash: "Emptying trash…",
    consentRequired: "Consent required — confirm the safety notice first.",
  },
  stats: {
    sectionLabel: "Stats",
    deleted: "Deleted",
    rate: "Per minute",
    elapsed: "Elapsed",
    eta: "ETA",
  },
  settings: {
    sectionLabel: "Settings",
    maxCount: {
      label: "Photos per batch",
      hint: "Looped until the gallery is empty",
    },
    dryRun: {
      label: "Dry run",
      hint: "Preview this view without clicking",
    },
    emptyTrash: {
      label: "Empty trash",
      hint: "Permanently delete afterwards",
    },
    language: {
      label: "Language",
      trigger: "Change language",
    },
    filter: {
      label: "Filter",
      hint: "Pro: restrict cleanup by type",
      all: "All items",
      screenshot: "Screenshots",
      video: "Videos",
      photo: "Photos",
      animation: "Animations",
      collage: "Collages",
    },
    license: {
      label: "Pro license",
      hint: "Verified locally; never leaves your device",
      placeholder: "Paste license token",
      activate: "Activate",
      active: "Pro active — filters enabled",
      invalid: "Invalid license token",
    },
  },
  actions: {
    start: "Start",
    pause: "Pause",
    resume: "Resume",
    stop: "Stop",
    report: "Report issue",
    copySummary: "Copy summary",
    exportCsv: "Export CSV",
    viewTrash: "View trash",
  },
  notes: {
    navigateFirst: "Open {url} first.",
  },
  consent: {
    title: "Before you start",
    trashNote: "Photos move to Trash (recoverable for 60 days).",
    permanentNote: "\"Empty trash afterwards\" is PERMANENT — no recovery.",
    check: "I understand, and I am on the Google Photos view I intend to clean.",
    confirm: "Confirm & Start",
    cancel: "Cancel",
  },
  scope: {
    actingOn: "Action scope: {view}",
    library: "Library",
    albums: "Albums",
    album: "Album",
    search: "Search",
    trash: "Trash",
    photo: "Photo",
    memory: "Memory",
    share: "Shared",
    places: "Places",
    collections: "Collections",
    other: "This view ({path})",
  },
}

export default en
