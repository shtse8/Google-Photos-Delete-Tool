import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const readWorkflow = (name: string): string => readFileSync(
  fileURLToPath(new URL(`../.github/workflows/${name}`, import.meta.url)), 'utf8',
)

// Execute only the recording tail, with an inert shell function replacing git.
// No checkout, network, store CLI, credentials, or real commit/push is involved.
const tails = ['store-publish.yml', 'bootstrap-amo.yml'].flatMap(name =>
  [...readWorkflow(name).matchAll(/          git add state\.json\n([\s\S]*?          echo "::notice::[^\n]+)\n/g)]
    .map((match, index) => ({ name: `${name} recording ${index + 1}`, script: match[1].replace(/\$\{\{[^}]+\}\}/g, 'v-test') })),
)

function runRecording(script: string, diff: number, commit: number, push = 0) {
  return spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', `
set -euo pipefail
TAG=v-test
git() {
  case "$1" in
    diff) echo DIFF; return ${diff} ;;
    -c) echo COMMIT; return ${commit} ;;
    push) echo PUSH; return ${push} ;;
    *) echo "Unexpected mocked command" >&2; return 99 ;;
  esac
}
${script}
`], { encoding: 'utf8' })
}

describe('store-state recording failures', () => {
  it('covers all three stores and AMO bootstrap', () => {
    expect(tails).toHaveLength(4)
  })

  for (const tail of tails) {
    describe(tail.name, () => {
      it('propagates commit failure before push or recorded notice', () => {
        const result = runRecording(tail.script, 1, 42)
        expect(result.status).toBe(42)
        expect(result.stdout).toContain('COMMIT')
        expect(result.stdout).not.toContain('PUSH')
        expect(result.stdout).not.toContain('::notice::')
      })

      it('skips commit only for a clean staged diff', () => {
        const result = runRecording(tail.script, 0, 42)
        expect(result.status).toBe(0)
        expect(result.stdout).not.toContain('COMMIT')
        expect(result.stdout).toContain('PUSH')
        expect(result.stdout).toContain('state recorded')
      })

      it('commits changes before push and recorded notice', () => {
        const result = runRecording(tail.script, 1, 0)
        expect(result.status).toBe(0)
        expect(result.stdout).toMatch(/DIFF\nCOMMIT\nPUSH\n::notice::/)
      })

      it('does not mistake a diff error for changes or no changes', () => {
        const result = runRecording(tail.script, 2, 0)
        expect(result.status).toBe(2)
        expect(result.stdout).not.toContain('COMMIT')
        expect(result.stdout).not.toContain('PUSH')
        expect(result.stdout).not.toContain('::notice::')
      })

      it('does not announce recording after push failure', () => {
        const result = runRecording(tail.script, 1, 0, 43)
        expect(result.status).toBe(43)
        expect(result.stdout).not.toContain('::notice::')
      })
    })
  }
})

describe('legacy CWS entrypoint', () => {
  it('delegates the optional tag and CWS credentials to the sole publisher', () => {
    const caller = readWorkflow('publish-cws.yml')
    expect(caller).toContain('uses: ./.github/workflows/store-publish.yml')
    expect(caller).toContain('stores: cws')
    expect(caller).toContain('tag: ${{ inputs.tag }}')
    expect(caller).toContain('secrets: inherit')
    expect(caller).toContain('contents: write')
    expect(caller).toContain('group: store-publish')
    expect(caller).toContain('cancel-in-progress: false')
    expect(caller).not.toContain('runs-on:')
    expect(caller).not.toContain('github.sha')
    expect(caller).not.toContain('chrome-webstore-upload-cli')
  })

  it('keeps latest-release resolution, tag checkout and version verification in the shared engine', () => {
    const engine = readWorkflow('store-publish.yml')
    expect(engine).toContain('if [ -z "$TAG" ]; then\n            TAG="$(gh release view --json tagName -q .tagName)"')
    expect(engine).toContain('ref: ${{ needs.resolve.outputs.tag }}')
    expect(engine).toContain('test "${TAG#v}" = "$PKG"')
  })
})
