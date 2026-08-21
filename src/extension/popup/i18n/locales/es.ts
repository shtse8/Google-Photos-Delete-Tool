import type { Translations } from '../types'

const es: Translations = {
  header: {
    title: "Limpiar Photos",
    subtitle: "Borrado masivo de Google Photos",
  },
  status: {
    ready: "Listo",
    selecting: "Seleccionando fotos…",
    deleting: "Eliminando lote…",
    scrolling: "Cargando más fotos…",
    paused: "En pausa",
    done: "Terminado",
    error: "Error",
    idle: "Inactivo",
    navigatingTrash: "Abriendo papelera…",
    emptyingTrash: "Vaciando papelera…",
    consentRequired: "Se requiere consentimiento — confirme primero el aviso de seguridad.",
  },
  stats: {
    sectionLabel: "Estadísticas",
    deleted: "Eliminadas",
    rate: "Por minuto",
    elapsed: "Transcurrido",
    eta: "Restante",
  },
  settings: {
    sectionLabel: "Ajustes",
    maxCount: {
      label: "Fotos por lote",
      hint: "En bucle hasta vaciar la galería",
    },
    dryRun: {
      label: "Modo prueba",
      hint: "Previsualiza esta vista sin hacer clic",
    },
    emptyTrash: {
      label: "Vaciar papelera",
      hint: "Eliminar definitivamente después",
    },
    language: {
      label: "Idioma",
      trigger: "Cambiar idioma",
    },
    filter: {
      label: "Filtro",
      hint: "Pro: limpieza limitada por tipo",
      all: "Todos los elementos",
      screenshot: "Capturas de pantalla",
      video: "Vídeos",
      photo: "Fotos",
      animation: "Animaciones",
      collage: "Collages",
    },
    license: {
      label: "Licencia Pro",
      hint: "Verificada localmente; nunca sale del dispositivo",
      placeholder: "Pegue el token de licencia",
      activate: "Activar",
      active: "Pro activo — filtros activados",
      invalid: "Token de licencia no válido",
    },
  },
  actions: {
    start: "Iniciar",
    pause: "Pausar",
    resume: "Reanudar",
    stop: "Detener",
    report: "Informar de un problema",
    copySummary: "Copiar resumen",
    exportCsv: "Exportar CSV",
    viewTrash: "Ver papelera",
  },
  notes: {
    navigateFirst: "Abre {url} primero.",
  },
  consent: {
    title: "Antes de empezar",
    trashNote: "Las fotos van a la papelera (recuperables 60 días).",
    permanentNote: "«Vaciar papelera después» es DEFINITIVO — sin recuperación.",
    check: "Entiendo y estoy en la vista de Google Photos que quiero limpiar.",
    confirm: "Confirmar e iniciar",
    cancel: "Cancelar",
  },
  scope: {
    actingOn: "Ámbito de acción: {view}",
    library: "Biblioteca",
    albums: "Álbumes",
    album: "Álbum",
    search: "Búsqueda",
    trash: "Papelera",
    photo: "Foto",
    memory: "Recuerdo",
    share: "Compartido",
    places: "Lugares",
    collections: "Colecciones",
    other: "Esta vista ({path})",
  },
}

export default es
