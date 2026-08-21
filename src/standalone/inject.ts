/**
 * Google Photos Delete Tool — Standalone injection script.
 * Paste the built IIFE into DevTools console on photos.google.com.
 * Same shared panel + runner as the userscript (dev artifact).
 *
 * GPDT-ENTER: refuse to activate off photos.google.com.
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
