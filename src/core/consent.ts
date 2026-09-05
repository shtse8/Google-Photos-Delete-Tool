/**
 * Sole writer for destructive-run admission, empty-trash chain
 * admission, and single-run occupancy.
 *
 * Identities: GPDT-CONSENT, GPDT-TRASH-HANDOFF (chain predicate),
 * GPDT-CONTROL (no second engine while the first is settling).
 *
 * Surfaces read their own storage backends and pass interpreted
 * acknowledgements here. This module does not know chrome.storage vs
 * localStorage; it only admits or refuses.
 */
import type { RunStatus } from './status'

export const CONSENT_KEY = 'gpdt_consent_v3'
export const EMPTY_TRASH_ACK_KEY = 'gpdt_emptyTrashAck_v3'

/** Userscript / panel localStorage acknowledgement token. */
export const LOCAL_ACK_VALUE = '1'

export type Acknowledgement = {
  readable: boolean
  acknowledged: boolean
}

export type DestructiveRefuseReason =
  | 'consent-missing'
  | 'consent-unreadable'
  | 'empty-trash-ack-missing'
  | 'empty-trash-ack-unreadable'

export type DestructiveAdmission =
  | { ok: true }
  | { ok: false; reason: DestructiveRefuseReason }

export type OccupancyAdmission =
  | { ok: true }
  | { ok: false; reason: 'run-in-progress' }

export class ConsentRequiredError extends Error {
  constructor() {
    super('consent required before a destructive run')
    this.name = 'ConsentRequiredError'
  }
}

export class PermanentActionRequiredError extends Error {
  constructor() {
    super('permanent empty-trash acknowledgement required before an empty-trash run')
    this.name = 'PermanentActionRequiredError'
  }
}

/** Public extension IPC error tokens for a refused destructive start. */
export const EXTENSION_ADMISSION_ERROR: Record<DestructiveRefuseReason, string> = {
  'consent-missing':
    'Consent required — confirm the safety notice in the popup first.',
  'consent-unreadable': 'Could not read consent state.',
  'empty-trash-ack-missing':
    'Permanent empty-trash consent required — confirm the permanent-action warning in the popup first.',
  'empty-trash-ack-unreadable':
    'Could not read permanent empty-trash consent state.',
}

export const RUN_IN_PROGRESS_ERROR = 'A run is already in progress — stop it first.'

export function admitDestructiveRun(input: {
  dryRun: boolean
  emptyTrashAfter: boolean
  consent: Acknowledgement
  emptyTrashAck: Acknowledgement
}): DestructiveAdmission {
  if (input.dryRun) return { ok: true }

  if (!input.consent.readable) {
    return { ok: false, reason: 'consent-unreadable' }
  }
  if (!input.consent.acknowledged) {
    return { ok: false, reason: 'consent-missing' }
  }

  if (input.emptyTrashAfter) {
    if (!input.emptyTrashAck.readable) {
      return { ok: false, reason: 'empty-trash-ack-unreadable' }
    }
    if (!input.emptyTrashAck.acknowledged) {
      return { ok: false, reason: 'empty-trash-ack-missing' }
    }
  }

  return { ok: true }
}

/**
 * Empty-trash navigation is admitted only after a clean real run that
 * deleted at least one item. A dry-run, a stop, a zero-delete finish,
 * or a non-done status must not chain.
 */
export function shouldNavigateToEmptyTrash(input: {
  dryRun: boolean
  emptyTrashAfter: boolean
  stopped: boolean
  status: RunStatus
  deleted: number
}): boolean {
  return (
    !input.dryRun &&
    input.emptyTrashAfter &&
    !input.stopped &&
    input.status === 'done' &&
    input.deleted > 0
  )
}

export function admitConcurrentStart(occupied: boolean): OccupancyAdmission {
  return occupied ? { ok: false, reason: 'run-in-progress' } : { ok: true }
}

export function readLocalAcknowledgement(key: string): Acknowledgement {
  try {
    return {
      readable: true,
      acknowledged: window.localStorage.getItem(key) === LOCAL_ACK_VALUE,
    }
  } catch {
    return { readable: false, acknowledged: false }
  }
}

export function writeLocalAcknowledgement(key: string): void {
  try {
    window.localStorage.setItem(key, LOCAL_ACK_VALUE)
  } catch {
    /* storage unavailable — acknowledgement re-asked next start */
  }
}

export function throwForDestructiveRefusal(reason: DestructiveRefuseReason): never {
  switch (reason) {
    case 'consent-missing':
    case 'consent-unreadable':
      throw new ConsentRequiredError()
    case 'empty-trash-ack-missing':
    case 'empty-trash-ack-unreadable':
      throw new PermanentActionRequiredError()
  }
}
