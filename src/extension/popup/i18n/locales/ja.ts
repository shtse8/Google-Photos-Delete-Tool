import type { Translations } from '../types'

const ja: Translations = {
  header: {
    title: '写真を整理',
    subtitle: 'Google フォト 一括削除',
  },
  status: {
    ready: '準備完了',
    selecting: '写真を選択中…',
    deleting: 'バッチを削除中…',
    scrolling: '写真を読み込み中…',
    paused: '一時停止',
    done: '完了',
    error: 'エラー',
    idle: '待機中',
    navigatingTrash: 'ゴミ箱を開いています…',
    emptyingTrash: 'ゴミ箱を空にしています…',
  },
  stats: {
    deleted: '削除済み',
    rate: '毎分',
    elapsed: '経過',
    eta: '残り',
  },
  settings: {
    sectionLabel: '設定',
    maxCount: {
      label: '1回あたりの枚数',
      hint: 'ギャラリーが空になるまで繰り返し · 0 = 無制限',
    },
    dryRun: {
      label: 'テスト実行',
      hint: '数えるだけで削除しない',
    },
    emptyTrash: {
      label: 'ゴミ箱を空にする',
      hint: '完了後に完全削除',
    },
    language: {
      label: '言語',
      trigger: '言語を変更',
    },
  },
  actions: {
    start: '開始',
    pause: '一時停止',
    resume: '再開',
    stop: '停止',
  },
  notes: {
    navigateFirst: '先に {url} を開いてください。',
  },
}

export default ja
