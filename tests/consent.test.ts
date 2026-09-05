import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CONSENT_KEY,
  EMPTY_TRASH_ACK_KEY,
  EXTENSION_ADMISSION_ERROR,
  LOCAL_ACK_VALUE,
  RUN_IN_PROGRESS_ERROR,
  admitConcurrentStart,
  admitDestructiveRun,
  readLocalAcknowledgement,
  shouldNavigateToEmptyTrash,
  throwForDestructiveRefusal,
  writeLocalAcknowledgement,
  ConsentRequiredError,
  PermanentActionRequiredError,
} from '../src/core/consent'
import type { RunStatus } from '../src/core/status'

const ack = (acknowledged: boolean, readable = true) => ({ readable, acknowledged })

describe('storage key contract', () => {
  it('publishes the v3 acknowledgement key names', () => {
    expect(CONSENT_KEY).toBe('gpdt_consent_v3')
    expect(EMPTY_TRASH_ACK_KEY).toBe('gpdt_emptyTrashAck_v3')
    expect(LOCAL_ACK_VALUE).toBe('1')
  })
})

describe('admitDestructiveRun', () => {
  it('admits a dry-run with no consent and no empty-trash acknowledgement', () => {
    expect(admitDestructiveRun({
      dryRun: true,
      emptyTrashAfter: false,
      consent: ack(false),
      emptyTrashAck: ack(false),
    })).toEqual({ ok: true })
  })

  it('admits a dry-run even when empty-trash is selected and storage is unreadable', () => {
    expect(admitDestructiveRun({
      dryRun: true,
      emptyTrashAfter: true,
      consent: ack(false, false),
      emptyTrashAck: ack(false, false),
    })).toEqual({ ok: true })
  })

  it('refuses a real run when consent is missing', () => {
    expect(admitDestructiveRun({
      dryRun: false,
      emptyTrashAfter: false,
      consent: ack(false),
      emptyTrashAck: ack(false),
    })).toEqual({ ok: false, reason: 'consent-missing' })
  })

  it('refuses a real run when consent is unreadable', () => {
    expect(admitDestructiveRun({
      dryRun: false,
      emptyTrashAfter: false,
      consent: ack(true, false),
      emptyTrashAck: ack(true),
    })).toEqual({ ok: false, reason: 'consent-unreadable' })
  })

  it('refuses a real empty-trash run when the permanent acknowledgement is missing', () => {
    expect(admitDestructiveRun({
      dryRun: false,
      emptyTrashAfter: true,
      consent: ack(true),
      emptyTrashAck: ack(false),
    })).toEqual({ ok: false, reason: 'empty-trash-ack-missing' })
  })

  it('refuses a real empty-trash run when the permanent acknowledgement is unreadable', () => {
    expect(admitDestructiveRun({
      dryRun: false,
      emptyTrashAfter: true,
      consent: ack(true),
      emptyTrashAck: ack(true, false),
    })).toEqual({ ok: false, reason: 'empty-trash-ack-unreadable' })
  })

  it('checks consent before the empty-trash acknowledgement', () => {
    expect(admitDestructiveRun({
      dryRun: false,
      emptyTrashAfter: true,
      consent: ack(false),
      emptyTrashAck: ack(false),
    })).toEqual({ ok: false, reason: 'consent-missing' })
  })

  it('admits a real run when consent is present and empty-trash is not selected', () => {
    expect(admitDestructiveRun({
      dryRun: false,
      emptyTrashAfter: false,
      consent: ack(true),
      emptyTrashAck: ack(false),
    })).toEqual({ ok: true })
  })

  it('admits a real empty-trash run when both acknowledgements are present', () => {
    expect(admitDestructiveRun({
      dryRun: false,
      emptyTrashAfter: true,
      consent: ack(true),
      emptyTrashAck: ack(true),
    })).toEqual({ ok: true })
  })
})

describe('shouldNavigateToEmptyTrash', () => {
  const clean = {
    dryRun: false,
    emptyTrashAfter: true,
    stopped: false,
    status: 'done' as RunStatus,
    deleted: 1,
  }

  it('admits navigation only after a clean real run that deleted at least one item', () => {
    expect(shouldNavigateToEmptyTrash(clean)).toBe(true)
  })

  it('refuses a dry-run', () => {
    expect(shouldNavigateToEmptyTrash({ ...clean, dryRun: true })).toBe(false)
  })

  it('refuses when the empty-trash option was not selected', () => {
    expect(shouldNavigateToEmptyTrash({ ...clean, emptyTrashAfter: false })).toBe(false)
  })

  it('refuses a stopped run even if items were deleted', () => {
    expect(shouldNavigateToEmptyTrash({ ...clean, stopped: true, deleted: 4 })).toBe(false)
  })

  it('refuses non-done statuses', () => {
    for (const status of ['idle', 'error', 'paused', 'navigatingTrash', 'emptyingTrash'] as RunStatus[]) {
      expect(shouldNavigateToEmptyTrash({ ...clean, status })).toBe(false)
    }
  })

  it('refuses a clean finish that deleted nothing', () => {
    expect(shouldNavigateToEmptyTrash({ ...clean, deleted: 0 })).toBe(false)
  })

  it('refuses non-positive deleted counts, including NaN', () => {
    expect(shouldNavigateToEmptyTrash({ ...clean, deleted: -1 })).toBe(false)
    expect(shouldNavigateToEmptyTrash({ ...clean, deleted: Number.NaN })).toBe(false)
  })
})

describe('admitConcurrentStart', () => {
  it('admits the first start and refuses a second while occupied', () => {
    expect(admitConcurrentStart(false)).toEqual({ ok: true })
    expect(admitConcurrentStart(true)).toEqual({ ok: false, reason: 'run-in-progress' })
  })
})

describe('public extension refusal tokens', () => {
  it('keeps the IPC error strings stable', () => {
    expect(EXTENSION_ADMISSION_ERROR['consent-missing']).toBe(
      'Consent required — confirm the safety notice in the popup first.',
    )
    expect(EXTENSION_ADMISSION_ERROR['consent-unreadable']).toBe('Could not read consent state.')
    expect(EXTENSION_ADMISSION_ERROR['empty-trash-ack-missing']).toBe(
      'Permanent empty-trash consent required — confirm the permanent-action warning in the popup first.',
    )
    expect(EXTENSION_ADMISSION_ERROR['empty-trash-ack-unreadable']).toBe(
      'Could not read permanent empty-trash consent state.',
    )
    expect(RUN_IN_PROGRESS_ERROR).toBe('A run is already in progress — stop it first.')
  })
})

describe('throwForDestructiveRefusal', () => {
  it('maps consent refusals to ConsentRequiredError', () => {
    expect(() => throwForDestructiveRefusal('consent-missing')).toThrow(ConsentRequiredError)
    expect(() => throwForDestructiveRefusal('consent-unreadable')).toThrow(ConsentRequiredError)
  })

  it('maps empty-trash refusals to PermanentActionRequiredError', () => {
    expect(() => throwForDestructiveRefusal('empty-trash-ack-missing')).toThrow(PermanentActionRequiredError)
    expect(() => throwForDestructiveRefusal('empty-trash-ack-unreadable')).toThrow(PermanentActionRequiredError)
  })
})

describe('localStorage acknowledgement helpers', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips the local acknowledgement token', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
      },
    } as unknown as Window & typeof globalThis)
    expect(readLocalAcknowledgement(CONSENT_KEY)).toEqual({ readable: true, acknowledged: false })
    writeLocalAcknowledgement(CONSENT_KEY)
    expect(store.get(CONSENT_KEY)).toBe('1')
    expect(readLocalAcknowledgement(CONSENT_KEY)).toEqual({ readable: true, acknowledged: true })
  })

  it('fail-closes when localStorage throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('denied') },
        setItem: () => { throw new Error('denied') },
      },
    } as unknown as Window & typeof globalThis)
    expect(readLocalAcknowledgement(CONSENT_KEY)).toEqual({ readable: false, acknowledged: false })
    expect(() => writeLocalAcknowledgement(CONSENT_KEY)).not.toThrow()
  })
})
