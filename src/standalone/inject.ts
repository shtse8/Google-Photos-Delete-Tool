/**
 * Google Photos Delete Tool — Standalone injection script.
 * Paste the built IIFE into DevTools console on photos.google.com.
 * Same shared panel + runner as the userscript (dev artifact).
 */
import { PageRunner } from '../core/page-runner'
import { mountPanel } from '../ui/panel/panel'

const runner = new PageRunner()
void runner.maybeRunPendingEmptyTrash()
const host = document.body ?? document.documentElement
mountPanel(host, runner)
