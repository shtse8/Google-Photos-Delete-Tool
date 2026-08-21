import type { Translations } from '../types'

const it: Translations = {
  header: {
    title: "Pulizia Photos",
    subtitle: "Eliminazione in massa di Google Photos",
  },
  status: {
    ready: "Pronto",
    selecting: "Selezione foto…",
    deleting: "Eliminazione lotto…",
    scrolling: "Caricamento altre foto…",
    paused: "In pausa",
    done: "Completato",
    error: "Errore",
    idle: "Inattivo",
    navigatingTrash: "Apertura del cestino…",
    emptyingTrash: "Svuotamento del cestino…",
    consentRequired: "Consenso richiesto — conferma prima l’avviso di sicurezza.",
  },
  stats: {
    sectionLabel: "Statistiche",
    deleted: "Eliminate",
    rate: "Al minuto",
    elapsed: "Trascorso",
    eta: "Rimanente",
  },
  settings: {
    sectionLabel: "Impostazioni",
    maxCount: {
      label: "Foto per lotto",
      hint: "Ciclo fino a galleria vuota",
    },
    dryRun: {
      label: "Prova a vuoto",
      hint: "Anteprima di questa vista, senza clic",
    },
    emptyTrash: {
      label: "Svuota cestino",
      hint: "Elimina definitivamente dopo",
    },
    language: {
      label: "Lingua",
      trigger: "Cambia lingua",
    },
    filter: {
      label: "Filtro",
      hint: "Pro: pulizia limitata per tipo",
      all: "Tutti gli elementi",
      screenshot: "Screenshot",
      video: "Video",
      photo: "Foto",
      animation: "Animazioni",
      collage: "Collage",
    },
    license: {
      label: "Licenza Pro",
      hint: "Verificata localmente; non lascia mai il dispositivo",
      placeholder: "Incolla il token di licenza",
      activate: "Attiva",
      active: "Pro attivo — filtri abilitati",
      invalid: "Token di licenza non valido",
    },
  },
  actions: {
    start: "Avvia",
    pause: "Pausa",
    resume: "Riprendi",
    stop: "Arresta",
    report: "Segnala un problema",
    copySummary: "Copia riepilogo",
    exportCsv: "Esporta CSV",
    viewTrash: "Vedi cestino",
  },
  notes: {
    navigateFirst: "Apri prima {url}.",
  },
  consent: {
    title: "Prima di iniziare",
    trashNote: "Le foto vanno nel cestino (recuperabili per 60 giorni).",
    permanentNote: "«Svuota cestino dopo» è DEFINITIVO — nessun recupero.",
    check: "Ho capito e sono nella vista Google Photos che intendo pulire.",
    confirm: "Conferma e avvia",
    cancel: "Annulla",
  },
  scope: {
    actingOn: "Ambito di azione: {view}",
    library: "Libreria",
    albums: "Album",
    album: "Album",
    search: "Ricerca",
    trash: "Cestino",
    photo: "Foto",
    memory: "Ricordo",
    share: "Condiviso",
    places: "Luoghi",
    collections: "Raccolte",
    other: "Questa vista ({path})",
  },
}

export default it
