/**
 * Google Photos Delete Tool — Userscript (Tampermonkey / Violentmonkey /
 * Greasemonkey). Thin mount: the shared control panel + in-page runner.
 * The metadata header is injected at build time by scripts/build.ts.
 */
import { PageRunner } from '../core/page-runner'
import { mountPanel } from '../ui/panel/panel'

const runner = new PageRunner()

// Consume a pending "empty trash" flag on /trash (set by a previous run
// that finished with "Empty trash afterwards" enabled).
void runner.maybeRunPendingEmptyTrash()

const host = document.body ?? document.documentElement
mountPanel(host, runner)
