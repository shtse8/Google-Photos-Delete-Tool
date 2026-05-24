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
      label: 'Photos par lot',
      hint: 'Tranches successives jusqu’à la fin · 0 = illimité',
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
    navigateFirst: 'Ouvrez d’abord {url}.',
  },
}

export default fr
