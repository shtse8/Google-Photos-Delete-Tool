import type { Translations } from '../types'

const ja: Translations = {
  header: {
    title: "写真を整理",
    subtitle: "Google フォトの一括削除",
  },
  status: {
    ready: "準備完了",
    selecting: "写真を選択中…",
    deleting: "バッチを削除中…",
    scrolling: "写真を読み込み中…",
    paused: "一時停止",
    done: "完了",
    error: "エラー",
    idle: "待機中",
    navigatingTrash: "ゴミ箱を開いています…",
    emptyingTrash: "ゴミ箱を空にしています…",
    consentRequired: "同意が必要です — 最初に安全に関する注意事項を確認してください。",
  },
  stats: {
    sectionLabel: "統計",
    deleted: "削除済み",
    rate: "毎分",
    elapsed: "経過",
    eta: "残り",
  },
  settings: {
    sectionLabel: "設定",
    maxCount: {
      label: "1回あたりの枚数",
      hint: "ギャラリーが空になるまで繰り返し",
    },
    dryRun: {
      label: "テスト実行",
      hint: "数えるだけで削除しない",
    },
    emptyTrash: {
      label: "ゴミ箱を空にする",
      hint: "完了後に完全削除",
    },
    language: {
      label: "言語",
      trigger: "言語を変更",
    },
    filter: {
      label: "フィルター",
      hint: "Pro: 種類で削除を制限",
      all: "すべての項目",
      screenshot: "スクリーンショット",
      video: "動画",
      photo: "写真",
      animation: "アニメーション",
      collage: "コラージュ",
    },
    license: {
      label: "Pro ライセンス",
      hint: "端末内で検証。外部に送信されません",
      placeholder: "ライセンストークンを貼り付け",
      activate: "有効化",
      active: "Pro 有効 — フィルター利用可",
      invalid: "無効なライセンストークン",
    },
  },
  actions: {
    start: "開始",
    pause: "一時停止",
    resume: "再開",
    stop: "停止",
    report: "問題を報告",
    copySummary: "要約をコピー",
    exportCsv: "CSV をエクスポート",
    viewTrash: "ゴミ箱を表示",
  },
  notes: {
    navigateFirst: "先に {url} を開いてください。",
  },
  consent: {
    title: "開始する前に",
    trashNote: "写真はゴミ箱に移動します（60日間復元可能）。",
    permanentNote: "「後でゴミ箱を空にする」は完全削除で、復元できません。",
    check: "理解しました。削除対象の Google フォトの画面を表示しています。",
    confirm: "確認して開始",
    cancel: "キャンセル",
  },
}

export default ja
