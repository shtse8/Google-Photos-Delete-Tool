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
    navigatingTrash: 'Abrindo lixeira…',
    emptyingTrash: 'Esvaziando lixeira…',
  },
  stats: {
    sectionLabel: 'Estatísticas',
    deleted: 'Excluídas',
    rate: 'Por minuto',
    elapsed: 'Decorrido',
    eta: 'Restante',
  },
  settings: {
    sectionLabel: 'Ajustes',
    maxCount: {
      label: 'Fotos por lote',
      hint: 'Em laço até a galeria esvaziar',
    },
    dryRun: {
      label: 'Simulação',
      hint: 'Apenas contar, sem excluir',
    },
    emptyTrash: {
      label: 'Esvaziar lixeira',
      hint: 'Excluir permanentemente depois',
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
    navigateFirst: 'Abra {url} primeiro.',
  },
}

export default pt
