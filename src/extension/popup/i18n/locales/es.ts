import type { Translations } from '../types'

const es: Translations = {
  header: {
    title: 'Limpiar Photos',
    subtitle: 'Borrado masivo de Google Photos',
  },
  status: {
    ready: 'Listo',
    selecting: 'Seleccionando fotos…',
    deleting: 'Eliminando lote…',
    scrolling: 'Cargando más fotos…',
    paused: 'En pausa',
    done: 'Terminado',
    error: 'Error',
    idle: 'Inactivo',
    navigatingTrash: 'Abriendo papelera…',
    emptyingTrash: 'Vaciando papelera…',
  },
  stats: {
    sectionLabel: 'Estadísticas',
    deleted: 'Eliminadas',
    rate: 'Por minuto',
    elapsed: 'Transcurrido',
    eta: 'Restante',
  },
  settings: {
    sectionLabel: 'Ajustes',
    maxCount: {
      label: 'Fotos por lote',
      hint: 'En bucle hasta vaciar la galería',
    },
    dryRun: {
      label: 'Modo prueba',
      hint: 'Solo contar, sin eliminar',
    },
    emptyTrash: {
      label: 'Vaciar papelera',
      hint: 'Eliminar definitivamente después',
    },
    language: {
      label: 'Idioma',
      trigger: 'Cambiar idioma',
    },
  },
  actions: {
    start: 'Iniciar',
    pause: 'Pausar',
    resume: 'Reanudar',
    stop: 'Detener',
  },
  notes: {
    navigateFirst: 'Abre {url} primero.',
  },
}

export default es
