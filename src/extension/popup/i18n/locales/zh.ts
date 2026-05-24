import type { Translations } from '../types'

const zh: Translations = {
  header: {
    title: '相册清理',
    subtitle: 'Google 相册批量删除',
  },
  status: {
    ready: '就绪',
    selecting: '正在选择照片…',
    deleting: '正在删除批次…',
    scrolling: '正在加载更多照片…',
    paused: '已暂停',
    done: '完成',
    error: '错误',
    idle: '空闲',
    navigatingTrash: '正在打开回收站…',
    emptyingTrash: '正在清空回收站…',
  },
  stats: {
    deleted: '已删除',
    rate: '每分钟',
    elapsed: '已用',
    eta: '剩余',
  },
  settings: {
    sectionLabel: '设置',
    maxCount: {
      label: '每批照片数',
      hint: '循环直至清空相册 · 0 = 无限制',
    },
    dryRun: {
      label: '试运行',
      hint: '仅计数,不删除',
    },
    emptyTrash: {
      label: '清空回收站',
      hint: '完成后永久删除',
    },
    language: {
      label: '语言',
      trigger: '切换语言',
    },
  },
  actions: {
    start: '开始',
    pause: '暂停',
    resume: '继续',
    stop: '停止',
  },
  notes: {
    navigateFirst: '请先打开 {url}。',
  },
}

export default zh
