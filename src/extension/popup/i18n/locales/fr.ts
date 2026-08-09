import type { Translations } from '../types'

const fr: Translations = {
  header: {
    title: "Suppression Photos",
    subtitle: "Nettoyage Google Photos",
  },
  status: {
    ready: "Prêt",
    selecting: "Sélection des photos…",
    deleting: "Suppression du lot…",
    scrolling: "Chargement de plus de photos…",
    paused: "En pause",
    done: "Terminé",
    error: "Erreur",
    idle: "Inactif",
    navigatingTrash: "Ouverture de la corbeille…",
    emptyingTrash: "Vidage de la corbeille…",
    consentRequired: "Consentement requis — confirmez d’abord l’avis de sécurité.",
  },
  stats: {
    sectionLabel: "Statistiques",
    deleted: "Supprimées",
    rate: "Par minute",
    elapsed: "Écoulé",
    eta: "Restant",
  },
  settings: {
    sectionLabel: "Réglages",
    maxCount: {
      label: "Photos par lot",
      hint: "Tranches successives jusqu’à la fin",
    },
    dryRun: {
      label: "Mode test",
      hint: "Compter sans rien supprimer",
    },
    emptyTrash: {
      label: "Vider la corbeille",
      hint: "Supprimer définitivement après",
    },
    language: {
      label: "Langue",
      trigger: "Changer de langue",
    },
    filter: {
      label: "Filtre",
      hint: "Pro : nettoyage limité par type",
      all: "Tous les éléments",
      screenshot: "Captures d’écran",
      video: "Vidéos",
      photo: "Photos",
      animation: "Animations",
      collage: "Collages",
    },
    license: {
      label: "Licence Pro",
      hint: "Vérifiée localement ; ne quitte jamais votre appareil",
      placeholder: "Collez le jeton de licence",
      activate: "Activer",
      active: "Pro actif — filtres activés",
      invalid: "Jeton de licence invalide",
    },
  },
  actions: {
    start: "Démarrer",
    pause: "Pause",
    resume: "Reprendre",
    stop: "Arrêter",
    report: "Signaler un problème",
    copySummary: "Copier le résumé",
    exportCsv: "Exporter CSV",
    viewTrash: "Voir la corbeille",
  },
  notes: {
    navigateFirst: "Ouvrez d’abord {url}.",
  },
  consent: {
    title: "Avant de commencer",
    trashNote: "Les photos vont dans la corbeille (récupérables 60 jours).",
    permanentNote: "« Vider la corbeille après » est DÉFINITIF — aucune récupération.",
    check: "Je comprends, et je suis sur la vue Google Photos que je souhaite nettoyer.",
    confirm: "Confirmer et démarrer",
    cancel: "Annuler",
  },
}

export default fr
