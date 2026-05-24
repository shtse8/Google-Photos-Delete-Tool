import type { Translations } from '../types'

const pt: Translations = {
  header: {
    title: 'Limpar Photos',
    subtitle: 'Exclusão em massa do Google Photos',
  },
  status: {
    ready: 'Pronto',
    selecting: 'Selecionando fotos…',
    deleting: 'Excluindo lote…',
    scrolling: 'Carregando mais fotos…',
    paused: 'Pausado',
    done: 'Concluído',
    error: 'Erro',
    idle: 'Inativo',
  },
  stats: {
    deleted: 'Excluídas',
    rate: 'Por minuto',
    elapsed: 'Decorrido',
    eta: 'Restante',
  },
  settings: {
    sectionLabel: 'Ajustes',
    maxCount: {
      label: 'Fotos máx.',
      hint: 'Tamanho do lote e teto',
    },
    dryRun: {
      label: 'Simulação',
      hint: 'Apenas contar, sem excluir',
    },
    language: {
      label: 'Idioma',
      trigger: 'Mudar idioma',
    },
  },
  actions: {
    start: 'Iniciar',
    pause: 'Pausar',
    resume: 'Retomar',
    stop: 'Parar',
  },
  notes: {
    navigateFirst: 'Abra photos.google.com primeiro.',
  },
}

export default pt
