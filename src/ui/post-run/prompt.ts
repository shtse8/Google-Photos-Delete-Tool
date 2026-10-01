/**
 * Renders the one-time post-run prompt (see core/post-run-prompt.ts) as a
 * small dismissable card. It never blocks the page and is only called after
 * a run has settled.
 */
import type { PostRunPrompt } from '../../core/post-run-prompt'

const ID = 'gpdt-post-run-prompt'

export function showPostRunPrompt(prompt: PostRunPrompt, container: HTMLElement = document.body): void {
  if (document.getElementById(ID)) return
  const what = prompt.kind === 'duplicates' ? 'duplicates' : 'photos'
  const box = document.createElement('div')
  box.id = ID
  box.setAttribute('role', 'status')
  box.style.cssText =
    'position:fixed;bottom:20px;left:20px;z-index:2147483645;max-width:320px;padding:14px 16px;' +
    'background:rgba(24,26,32,0.97);color:#e8e8e8;border-radius:14px;border:1px solid rgba(255,255,255,0.1);' +
    'box-shadow:0 8px 32px rgba(0,0,0,0.5);font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'

  const msg = document.createElement('p')
  msg.style.cssText = 'margin:0 0 10px'
  msg.textContent =
    `Done: ${prompt.count.toLocaleString()} ${what} moved to Trash. ` +
    'If this tool helped, a short review or sharing it helps others find it.'
  box.appendChild(msg)

  const status = document.createElement('div')
  status.style.cssText = 'font-size:11px;color:#8b8b95;margin-top:6px;min-height:14px'

  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'
  const btn = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.style.cssText =
      'cursor:pointer;border:none;border-radius:8px;font-size:12px;font-weight:600;padding:7px 10px;' +
      'background:rgba(255,255,255,0.1);color:#e8e8e8'
    b.addEventListener('click', onClick)
    return b
  }

  if (prompt.ratingUrl) {
    const url = prompt.ratingUrl
    row.appendChild(btn('Rate on Chrome Web Store', () => { window.open(url, '_blank', 'noopener') }))
  }
  row.appendChild(btn('Share', () => { void share(prompt, status) }))
  row.appendChild(btn('Dismiss', () => box.remove()))
  box.appendChild(row)
  box.appendChild(status)
  container.appendChild(box)
}

async function share(prompt: PostRunPrompt, status: HTMLElement): Promise<void> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text: prompt.shareText })
      return
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
  }
  try {
    await navigator.clipboard.writeText(prompt.shareText)
    status.textContent = 'Copied. Paste it anywhere to share.'
  } catch {
    status.textContent = 'Could not copy. Share this link: ' + prompt.shareUrl
  }
}
