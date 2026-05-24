/**
 * Generates a fully self-contained HTML preview of the popup, so the
 * design can be inspected in any browser without loading the extension.
 *
 *   bun run scripts/preview.ts
 *
 * Output: dist/preview.html (light + dark side by side, ready to open).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

const root = resolve(import.meta.dir, '..')
const css = readFileSync(resolve(root, 'src/extension/popup/popup.css'), 'utf-8')

// Inline the same Tabler SVGs as src/extension/popup/icons.ts.
const STROKE = 'width="24" height="24" viewBox="0 0 24 24" stroke-width="1.75" ' +
  'stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"'
const FILL = 'width="24" height="24" viewBox="0 0 24 24" fill="currentColor"'

const ICONS = {
  trash: `<svg ${STROKE}>
    <path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/>
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/>
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg>`,
  play: `<svg ${FILL}><path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z"/></svg>`,
  pause: `<svg ${FILL}><path d="M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z"/><path d="M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z"/></svg>`,
  stop: `<svg ${FILL}><path d="M17 4h-10a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3 -3v-10a3 3 0 0 0 -3 -3z"/></svg>`,
  alert: `<svg ${STROKE}><path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z"/><path d="M12 16h.01"/></svg>`,
  language: `<svg ${STROKE}><path d="M4 5h7"/><path d="M9 3v2c0 4.418 -2.239 8 -5 8"/><path d="M5 9c0 2.144 2.952 3.908 6.7 4"/><path d="M12 20l4 -9l4 9"/><path d="M19.1 18h-6.2"/></svg>`,
  chevron: `<svg ${STROKE}><path d="M6 9l6 6l6 -6"/></svg>`,
  settings: `<svg ${STROKE}><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></svg>`,
  flask: `<svg ${STROKE}><path d="M9 3l6 0"/><path d="M10 9l4 0"/><path d="M10 3v6l-4 11a.7 .7 0 0 0 .5 1h11a.7 .7 0 0 0 .5 -1l-4 -11v-6"/></svg>`,
  hash: `<svg ${STROKE}><path d="M5 9l14 0"/><path d="M5 15l14 0"/><path d="M11 4l-4 16"/><path d="M17 4l-4 16"/></svg>`,
}

/** Build one popup card with a given locale dictionary and "running" state. */
function buildCard(opts: {
  langCode: string
  t: Record<string, string>
  state: 'idle' | 'running'
  showOpenMenu?: boolean
}): string {
  const { langCode, t, state, showOpenMenu } = opts
  const showStart  = state === 'idle'
  const showPause  = state === 'running'
  const showStop   = state === 'running'
  const dotClass   = state === 'running' ? 'running' : ''
  const statusText = state === 'running' ? t.statusSelecting : t.statusReady
  const fill       = state === 'running' ? '34%' : '0%'
  const pctLabel   = state === 'running' ? '34%' : '0%'
  const deleted    = state === 'running' ? '3 412' : '0'
  const rate       = state === 'running' ? '428'   : '—'
  const elapsed    = state === 'running' ? '7m 58s' : '0s'
  const eta        = state === 'running' ? '15m 26s' : '—'

  return `<main class="app">
  <header class="app-header">
    <div class="brand">
      <span class="brand-icon">${ICONS.trash}</span>
      <div class="brand-text">
        <h1 class="brand-title">${t.title}</h1>
        <p class="brand-subtitle">${t.subtitle}</p>
      </div>
    </div>
    <div class="lang-picker">
      <button class="lang-trigger" aria-expanded="${showOpenMenu ? 'true' : 'false'}">
        <span class="lang-icon">${ICONS.language}</span>
        <span class="lang-code">${langCode}</span>
        <span class="lang-chevron">${ICONS.chevron}</span>
      </button>
      ${showOpenMenu ? `<ul class="lang-menu" role="listbox">
        <li class="lang-option" aria-selected="${langCode === 'FR'}"><span>Français</span><span class="lang-option-code">FR</span></li>
        <li class="lang-option" aria-selected="${langCode === 'DE'}"><span>Deutsch</span><span class="lang-option-code">DE</span></li>
        <li class="lang-option" aria-selected="${langCode === 'EN'}"><span>English</span><span class="lang-option-code">EN</span></li>
        <li class="lang-option" aria-selected="${langCode === 'ES'}"><span>Español</span><span class="lang-option-code">ES</span></li>
        <li class="lang-option" aria-selected="${langCode === 'IT'}"><span>Italiano</span><span class="lang-option-code">IT</span></li>
        <li class="lang-option" aria-selected="${langCode === 'NL'}"><span>Nederlands</span><span class="lang-option-code">NL</span></li>
        <li class="lang-option" aria-selected="${langCode === 'PT'}"><span>Português</span><span class="lang-option-code">PT</span></li>
        <li class="lang-option" aria-selected="${langCode === 'ZH'}"><span>中文</span><span class="lang-option-code">ZH</span></li>
        <li class="lang-option" aria-selected="${langCode === 'JA'}"><span>日本語</span><span class="lang-option-code">JA</span></li>
      </ul>` : ''}
    </div>
  </header>

  <div class="status">
    <span class="status-dot ${dotClass}"></span>
    <span class="status-text">${statusText}</span>
  </div>

  <section class="stats" aria-label="Stats">
    <article class="stat"><div class="stat-value">${deleted}</div><div class="stat-label">${t.statDeleted}</div></article>
    <article class="stat"><div class="stat-value">${rate}</div><div class="stat-label">${t.statRate}</div></article>
    <article class="stat"><div class="stat-value">${elapsed}</div><div class="stat-label">${t.statElapsed}</div></article>
    <article class="stat"><div class="stat-value">${eta}</div><div class="stat-label">${t.statEta}</div></article>
  </section>

  <div class="progress">
    <div class="progress-track"><div class="progress-fill" style="width:${fill}"></div></div>
    <span class="progress-label">${pctLabel}</span>
  </div>

  <section class="settings ${state === 'running' ? 'disabled' : ''}">
    <header class="settings-header">
      <span class="settings-icon">${ICONS.settings}</span>
      <span class="settings-title">${t.settingsTitle}</span>
    </header>

    <div class="field">
      <label class="field-label">
        <span class="field-icon">${ICONS.hash}</span>
        <span class="field-text">
          <span class="field-name">${t.maxLabel}</span>
          <span class="field-hint">${t.maxHint}</span>
        </span>
      </label>
      <input type="number" class="field-input" value="10000">
    </div>

    <div class="field">
      <label class="field-label">
        <span class="field-icon">${ICONS.flask}</span>
        <span class="field-text">
          <span class="field-name">${t.dryLabel}</span>
          <span class="field-hint">${t.dryHint}</span>
        </span>
      </label>
      <label class="toggle">
        <input type="checkbox" ${state === 'running' ? 'disabled' : ''}>
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </label>
    </div>
  </section>

  <div class="controls">
    ${showStart  ? `<button class="btn btn-primary"><span class="btn-icon">${ICONS.play}</span><span class="btn-text">${t.actStart}</span></button>` : ''}
    ${showPause  ? `<button class="btn btn-warning"><span class="btn-icon">${ICONS.pause}</span><span class="btn-text">${t.actPause}</span></button>` : ''}
    ${showStop   ? `<button class="btn btn-danger"><span class="btn-icon">${ICONS.stop}</span><span class="btn-text">${t.actStop}</span></button>` : ''}
  </div>
</main>`
}

const FR = {
  title: 'Suppression Photos', subtitle: 'Nettoyage Google Photos',
  statusReady: 'Prêt', statusSelecting: 'Sélection des photos…',
  statDeleted: 'Supprimées', statRate: 'Par minute',
  statElapsed: 'Écoulé', statEta: 'Restant',
  settingsTitle: 'Réglages',
  maxLabel: 'Photos max.', maxHint: 'Taille de lot et plafond',
  dryLabel: 'Mode test',   dryHint: 'Compter sans rien supprimer',
  actStart: 'Démarrer', actPause: 'Pause', actStop: 'Arrêter',
}

const EN = {
  title: 'Photos Cleanup', subtitle: 'Google Photos bulk delete',
  statusReady: 'Ready', statusSelecting: 'Selecting photos…',
  statDeleted: 'Deleted', statRate: 'Per minute',
  statElapsed: 'Elapsed', statEta: 'ETA',
  settingsTitle: 'Settings',
  maxLabel: 'Max photos', maxHint: 'Batch size and run cap',
  dryLabel: 'Dry run',    dryHint: 'Count only, no deletion',
  actStart: 'Start', actPause: 'Pause', actStop: 'Stop',
}

const previewHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Popup Preview — Google Photos Delete Tool</title>
  <style>
    body {
      margin: 0;
      padding: 32px 16px;
      background: linear-gradient(135deg, #ecebff 0%, #ffe5f0 100%);
      font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
    }
    .preview-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 28px;
      justify-content: center;
      align-items: flex-start;
    }
    .preview-cell {
      width: 320px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .preview-label {
      font-size: 11px;
      letter-spacing: 0.12em;
      color: rgba(15, 23, 42, 0.55);
      text-transform: uppercase;
      font-weight: 700;
    }
    .preview-cell.dark .popup-wrapper {
      background: #0b0d17;
      border-radius: 24px;
      padding: 4px;
    }
    .preview-cell.dark { color-scheme: dark; }

${css}
  </style>
</head>
<body>
  <div class="preview-grid">

    <div class="preview-cell">
      <div class="preview-label">FR · idle · light</div>
      <div class="popup-wrapper">${buildCard({ langCode: 'FR', t: FR, state: 'idle' })}</div>
    </div>

    <div class="preview-cell">
      <div class="preview-label">FR · running · light</div>
      <div class="popup-wrapper">${buildCard({ langCode: 'FR', t: FR, state: 'running' })}</div>
    </div>

    <div class="preview-cell">
      <div class="preview-label">FR · lang menu open</div>
      <div class="popup-wrapper">${buildCard({ langCode: 'FR', t: FR, state: 'idle', showOpenMenu: true })}</div>
    </div>

    <div class="preview-cell dark" style="color-scheme: dark;">
      <div class="preview-label" style="color: rgba(255,255,255,0.6)">EN · running · dark</div>
      <div class="popup-wrapper" style="filter: none;">
        <style>
          .preview-cell.dark main.app {
            --bg-app: #0b0d17;
            --bg-surface: rgba(22, 26, 44, 0.92);
            --bg-stat: rgba(255, 255, 255, 0.05);
            --bg-stat-hover: rgba(255, 255, 255, 0.08);
            --bg-input: rgba(255, 255, 255, 0.06);
            --bg-track: rgba(255, 255, 255, 0.08);
            --text-strong: #f8fafc;
            --text: #e2e8f0;
            --text-muted: #94a3b8;
            --text-faint: #64748b;
            --border: rgba(255, 255, 255, 0.08);
            --border-strong: rgba(255, 255, 255, 0.15);
            --shadow-card: 0 18px 60px -16px rgba(0, 0, 0, 0.55),
                            0 2px 8px -2px rgba(0, 0, 0, 0.3);
          }
        </style>
        ${buildCard({ langCode: 'EN', t: EN, state: 'running' })}
      </div>
    </div>

  </div>

  <p style="text-align:center;margin-top:32px;font-size:12px;color:rgba(15,23,42,0.45)">
    Static preview · no JS interactivity · install the real extension for live behavior.
  </p>
</body>
</html>`

mkdirSync(resolve(root, 'dist'), { recursive: true })
const out = resolve(root, 'dist/preview.html')
writeFileSync(out, previewHtml)
console.log(`[preview] wrote ${out}`)
