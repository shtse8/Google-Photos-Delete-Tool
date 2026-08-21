import type { Translations } from '../types'

const pt: Translations = {
  header: {
    title: "Limpar Photos",
    subtitle: "Exclusão em massa do Google Photos",
  },
  status: {
    ready: "Pronto",
    selecting: "Selecionando fotos…",
    deleting: "Excluindo lote…",
    scrolling: "Carregando mais fotos…",
    paused: "Pausado",
    done: "Concluído",
    error: "Erro",
    idle: "Inativo",
    navigatingTrash: "Abrindo lixeira…",
    emptyingTrash: "Esvaziando lixeira…",
    consentRequired: "Consentimento necessário — confirme primeiro o aviso de segurança.",
  },
  stats: {
    sectionLabel: "Estatísticas",
    deleted: "Excluídas",
    rate: "Por minuto",
    elapsed: "Decorrido",
    eta: "Restante",
  },
  settings: {
    sectionLabel: "Ajustes",
    maxCount: {
      label: "Fotos por lote",
      hint: "Em laço até a galeria esvaziar",
    },
    dryRun: {
      label: "Simulação",
      hint: "Pré-visualiza esta vista sem clicar",
    },
    emptyTrash: {
      label: "Esvaziar lixeira",
      hint: "Excluir permanentemente depois",
    },
    language: {
      label: "Idioma",
      trigger: "Mudar idioma",
    },
    filter: {
      label: "Filtro",
      hint: "Pro: limpeza limitada por tipo",
      all: "Todos os itens",
      screenshot: "Capturas de tela",
      video: "Vídeos",
      photo: "Fotos",
      animation: "Animações",
      collage: "Colagens",
    },
    license: {
      label: "Licença Pro",
      hint: "Verificada localmente; nunca sai do dispositivo",
      placeholder: "Cole o token de licença",
      activate: "Ativar",
      active: "Pro ativo — filtros ativados",
      invalid: "Token de licença inválido",
    },
  },
  actions: {
    start: "Iniciar",
    pause: "Pausar",
    resume: "Retomar",
    stop: "Parar",
    report: "Relatar problema",
    copySummary: "Copiar resumo",
    exportCsv: "Exportar CSV",
    viewTrash: "Ver lixeira",
  },
  notes: {
    navigateFirst: "Abra {url} primeiro.",
  },
  consent: {
    title: "Antes de começar",
    trashNote: "As fotos vão para a lixeira (recuperáveis por 60 dias).",
    permanentNote: "«Esvaziar lixeira depois» é DEFINITIVO — sem recuperação.",
    check: "Entendo e estou na visualização do Google Photos que pretendo limpar.",
    confirm: "Confirmar e iniciar",
    cancel: "Cancelar",
  },
  scope: {
    actingOn: "Âmbito da ação: {view}",
    library: "Biblioteca",
    albums: "Álbuns",
    album: "Álbum",
    search: "Pesquisa",
    trash: "Lixeira",
    photo: "Foto",
    memory: "Memória",
    share: "Partilhado",
    places: "Locais",
    collections: "Coleções",
    other: "Esta vista ({path})",
  },
}

export default pt
