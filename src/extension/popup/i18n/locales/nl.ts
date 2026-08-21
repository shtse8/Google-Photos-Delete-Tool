import type { Translations } from '../types'

const nl: Translations = {
  header: {
    title: "Photos opruimen",
    subtitle: "Google Photos bulkverwijdering",
  },
  status: {
    ready: "Klaar",
    selecting: "Foto’s selecteren…",
    deleting: "Batch verwijderen…",
    scrolling: "Meer foto’s laden…",
    paused: "Gepauzeerd",
    done: "Klaar",
    error: "Fout",
    idle: "Inactief",
    navigatingTrash: "Prullenbak openen…",
    emptyingTrash: "Prullenbak legen…",
    consentRequired: "Toestemming vereist — bevestig eerst de veiligheidsmelding.",
  },
  stats: {
    sectionLabel: "Statistieken",
    deleted: "Verwijderd",
    rate: "Per minuut",
    elapsed: "Verstreken",
    eta: "Resterend",
  },
  settings: {
    sectionLabel: "Instellingen",
    maxCount: {
      label: "Foto’s per batch",
      hint: "In lussen tot de galerij leeg is",
    },
    dryRun: {
      label: "Proefrit",
      hint: "Bekijk deze weergave zonder te klikken",
    },
    emptyTrash: {
      label: "Prullenbak legen",
      hint: "Daarna definitief verwijderen",
    },
    language: {
      label: "Taal",
      trigger: "Taal wijzigen",
    },
    filter: {
      label: "Filter",
      hint: "Pro: opschonen beperken op type",
      all: "Alle items",
      screenshot: "Schermafbeeldingen",
      video: "Video’s",
      photo: "Foto’s",
      animation: "Animaties",
      collage: "Collages",
    },
    license: {
      label: "Pro-licentie",
      hint: "Lokaal geverifieerd; verlaat nooit je apparaat",
      placeholder: "Licentietoken plakken",
      activate: "Activeren",
      active: "Pro actief — filters ingeschakeld",
      invalid: "Ongeldige licentietoken",
    },
  },
  actions: {
    start: "Starten",
    pause: "Pauzeren",
    resume: "Hervatten",
    stop: "Stoppen",
    report: "Probleem melden",
    copySummary: "Samenvatting kopiëren",
    exportCsv: "CSV exporteren",
    viewTrash: "Prullenbak bekijken",
  },
  notes: {
    navigateFirst: "Open eerst {url}.",
  },
  consent: {
    title: "Voordat je begint",
    trashNote: "Foto’s gaan naar de prullenbak (60 dagen herstelbaar).",
    permanentNote: "«Daarna prullenbak legen» is DEFINITIEF — geen herstel.",
    check: "Ik begrijp het en bevind me in de Google Photos-weergave die ik wil opschonen.",
    confirm: "Bevestigen en starten",
    cancel: "Annuleren",
  },
  scope: {
    actingOn: "Actiebereik: {view}",
    library: "Bibliotheek",
    albums: "Albums",
    album: "Album",
    search: "Zoeken",
    trash: "Prullenbak",
    photo: "Foto",
    memory: "Herinnering",
    share: "Gedeeld",
    places: "Plaatsen",
    collections: "Collecties",
    other: "Deze weergave ({path})",
  },
}

export default nl
