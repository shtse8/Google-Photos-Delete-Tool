/**
 * One run slot per supported surface (GPDT-CONTROL).
 *
 * A second start is refused while an engine, its settling tail, a start
 * handshake, or an empty-trash flow occupies the slot. StopRequested is
 * the shared abort signal so a user stop during an action wait resolves
 * to idle rather than error.
 */
import { sleep } from './utils'

/** Thrown internally when the user requests a stop mid-wait. */
export class StopRequested extends Error {
  constructor() {
    super('stop requested')
    this.name = 'StopRequested'
  }
}

export const RUN_IN_PROGRESS_MESSAGE =
  'A run is already in progress — stop it first.'

export class RunInProgressError extends Error {
  constructor() {
    super(RUN_IN_PROGRESS_MESSAGE)
    this.name = 'RunInProgressError'
  }
}

export function isRunOccupied(flags: {
  engine?: unknown
  runPromise?: unknown
  starting?: boolean
  emptying?: boolean
  running?: boolean
}): boolean {
  return Boolean(
    flags.engine ||
      flags.runPromise ||
      flags.starting ||
      flags.emptying ||
      flags.running,
  )
}

/**
 * Poll `condition` until truthy. Throws {@link StopRequested} as soon as
 * `isStopped` is true, and throws a timeout error if `timeout` elapses
 * without a stop. Pause/hold is the caller's job: do not call this while
 * the user has asked the engine to pause — empty-trash has no pause.
 */
export async function waitUntilAbortable<T>(
  condition: () => T | Promise<T>,
  timeout: number,
  pollDelay: number,
  isStopped: () => boolean,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<NonNullable<T>> {
  let remaining = timeout
  while (true) {
    if (isStopped()) throw new StopRequested()
    const result = await condition()
    if (result) return result as NonNullable<T>
    if (remaining <= 0) {
      throw new Error(`Timed out after ${timeout}ms`)
    }
    await sleepFn(pollDelay)
    remaining -= pollDelay
  }
}
