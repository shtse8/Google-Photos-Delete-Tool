import type { Translations } from '../types'

const zh: Translations = {
  header: {
    title: "相册清理",
    subtitle: "Google 相册批量删除",
  },
  status: {
    ready: "就绪",
    selecting: "正在选择照片…",
    deleting: "正在删除批次…",
    scrolling: "正在加载更多照片…",
    paused: "已暂停",
    done: "完成",
    error: "错误",
    idle: "空闲",
    navigatingTrash: "正在打开回收站…",
    emptyingTrash: "正在清空回收站…",
    consentRequired: "需要确认 — 请先确认安全提示。",
  },
  stats: {
    sectionLabel: "统计",
    deleted: "已删除",
    rate: "每分钟",
    elapsed: "已用",
    eta: "剩余",
  },
  settings: {
    sectionLabel: "设置",
    maxCount: {
      label: "每批照片数",
      hint: "循环直至清空相册",
    },
    dryRun: {
      label: "试运行",
      hint: "预览当前视图，不点击任何内容",
    },
    emptyTrash: {
      label: "清空回收站",
      hint: "完成后永久删除",
    },
    language: {
      label: "语言",
      trigger: "切换语言",
    },
    filter: {
      label: "筛选",
      hint: "Pro：按类型限制清理",
      all: "全部项目",
      screenshot: "截屏",
      video: "视频",
      photo: "照片",
      animation: "动画",
      collage: "拼贴",
    },
    license: {
      label: "Pro 许可证",
      hint: "本地验证，绝不离开设备",
      placeholder: "粘贴许可证令牌",
      activate: "激活",
      active: "Pro 已激活 — 筛选已启用",
      invalid: "许可证令牌无效",
    },
  },
  actions: {
    start: "开始",
    pause: "暂停",
    resume: "继续",
    stop: "停止",
    report: "报告问题",
    copySummary: "复制摘要",
    exportCsv: "导出 CSV",
    viewTrash: "查看回收站",
  },
  notes: {
    navigateFirst: "请先打开 {url}。",
  },
  consent: {
    title: "开始之前",
    trashNote: "照片将移入回收站（60 天内可恢复）。",
    permanentNote: "“之后清空回收站”将永久删除，无法恢复。",
    check: "我理解，并且我正位于要清理的 Google 相册视图。",
    confirm: "确认并开始",
    cancel: "取消",
  },
  scope: {
    actingOn: "操作范围：{view}",
    library: "图库",
    albums: "相册",
    album: "相册",
    search: "搜索",
    trash: "回收站",
    photo: "照片",
    memory: "回忆",
    share: "共享",
    places: "地点",
    collections: "合集",
    other: "当前视图（{path}）",
  },
}

export default zh
