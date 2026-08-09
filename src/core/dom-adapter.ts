/**
 * DOM adapter contract for the DeleteEngine.
 *
 * The engine is pure TypeScript: every DOM interaction goes through
 * this interface, so the full run loop (select → cap-flush → scroll →
 * end-of-list → flush-last → stop/pause/error) is unit-testable with a
 * scripted fake. The browser implementation lives in `browser-dom.ts`.
 */

export interface ClickTarget {
  click(): void
}

export interface ScrollTarget {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  scrollBy(opts: { top: number; left: number; behavior: 'auto' }): void
  scrollTo(opts: { top: number; left: number; behavior: 'auto' }): void
}

/**
 * A photo tile checkbox. `label()` returns the aria-label of the
 * labelled ancestor (e.g. "Screenshot - 10 mars 2012, 10:19:24"), or
 * null when no labelled ancestor exists. Used for dry-run counting,
 * type filtering, and diagnostics.
 */
export interface PhotoTile extends ClickTarget {
  label(): string | null
}

export interface EngineDom {
  /** Current page path (e.g. "/", "/trash"). */
  readonly pathname: string
  /** Raw text of the selected-count toolbar element, or null when absent. */
  counterText(): string | null
  /** Currently unchecked, clickable photo tiles. */
  uncheckedTiles(): readonly PhotoTile[]
  /** Currently checked photo tiles (rendered ones). */
  checkedTiles(): readonly PhotoTile[]
  /** Toolbar "move to trash" button, when photos are selected. */
  findDeleteToolbarButton(): ClickTarget | null
  /** Currently-open confirmation dialog. */
  findConfirmDialog(): ClickTarget | null
  /** Destructive-action button inside `dialog`. */
  findConfirmButton(dialog: ClickTarget): ClickTarget | null
  /** Element that actually scrolls the gallery, or null. */
  findScrollTarget(): ScrollTarget | null
  /** Click a target. */
  click(target: ClickTarget): void
  /** Sleep for `ms` milliseconds. */
  sleep(ms: number): Promise<void>
}
