/**
 * Google Photos Delete Tool — Userscript (Tampermonkey / Violentmonkey /
 * Greasemonkey). Thin mount: the shared control panel + in-page runner.
 * The metadata header is injected at build time by scripts/build.ts.
 *
 * GPDT-ENTER: refuse to activate off photos.google.com even if the
 * manager's @match is bypassed.
 */
import { PageRunner } from '../core/page-runner'
import { mountPanel } from '../ui/panel/panel'
import { activateLocalSurface } from '../core/surface'

activateLocalSurface(window.location.href, () => {
  const runner = new PageRunner()
  void runner.maybeRunPendingEmptyTrash()
  const host = document.body ?? document.documentElement
  mountPanel(host, runner)
})
