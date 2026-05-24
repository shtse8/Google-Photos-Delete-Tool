import type { Translations } from '../types'

const fr: Translations = {
  header: {
    title: 'Suppression Photos',
    subtitle: 'Nettoyage Google Photos',
  },
  status: {
    ready: 'Prêt',
    selecting: 'Sélection des photos…',
    deleting: 'Suppression du lot…',
    scrolling: 'Chargement de plus de photos…',
    paused: 'En pause',
    done: 'Terminé',
    error: 'Erreur',
    idle: 'Inactif',
    navigatingTrash: 'Ouverture de la corbeille…',
    emptyingTrash: 'Vidage de la corbeille…',
  },
  stats: {
    deleted: 'Supprimées',
    rate: 'Par minute',
    elapsed: 'Écoulé',
    eta: 'Restant',
  },
  settings: {
    sectionLabel: 'Réglages',
    maxCount: {
      label: 'Photos max.',
      hint: 'Taille de lot et plafond',
    },
    dryRun: {
      label: 'Mode test',
      hint: 'Compter sans rien supprimer',
    },
    emptyTrash: {
      label: 'Vider la corbeille',
      hint: 'Supprimer définitivement après',
    },
    language: {
      label: 'Langue',
      trigger: 'Changer de langue',
    },
  },
  actions: {
    start: 'Démarrer',
    pause: 'Pause',
    resume: 'Reprendre',
    stop: 'Arrêter',
  },
  notes: {
    navigateFirst: 'Ouvrez d’abord photos.google.com.',
  },
}

export default fr
