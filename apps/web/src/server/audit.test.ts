import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appRouter } from './routers/root.ts'
import { createContext, type Actor } from './context.ts'
import type { AuditEvent } from './audit-log.ts'

/**
 * The middleware chain, exercised through `createCaller` — no HTTP, no
 * database, no session. This is the payoff for keeping the router a plain
 * function of its context (README, "The server layer"): the security behaviour
 * that most needs testing is also the cheapest thing in the repo to test.
 *
 * The sink is stdout today, so the spy reads it there. When the audit table
 * lands, this is the seam that moves.
 */
function callWith(actor: Actor | null) {
  return appRouter.createCaller(createContext({ actor })).patientDisplayName({
    firstName: 'Ada',
    lastName: 'Lovelace',
  })
}

const recorded: AuditEvent[] = []

function recordedEvents(): readonly AuditEvent[] {
  return recorded
}

beforeEach(() => {
  recorded.length = 0
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    // The sink writes one line of JSON per event; parsing it back here means
    // the test also asserts that what lands in the log is machine-readable.
    if (args[0] === '[phi-audit]') recorded.push(JSON.parse(String(args[1])) as AuditEvent)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PHI audit', () => {
  it('records an allowed access', async () => {
    await expect(callWith({ id: 'user-1', roles: ['clinician'] })).resolves.toBe('Lovelace, Ada')

    expect(recordedEvents()).toEqual([
      expect.objectContaining({
        actorId: 'user-1',
        path: 'patientDisplayName',
        type: 'query',
        outcome: 'allowed',
      }),
    ])
  })

  it('records an unauthenticated attempt as denied', async () => {
    // The regression: with the audit innermost, a rejected call never reached
    // it and the most security-relevant event in the system vanished.
    await expect(callWith(null)).rejects.toThrow('UNAUTHORIZED')

    expect(recordedEvents()).toEqual([
      expect.objectContaining({
        actorId: 'anonymous',
        path: 'patientDisplayName',
        outcome: 'denied',
        code: 'UNAUTHORIZED',
      }),
    ])
  })

  it('records an unauthorized attempt as denied, with the actor that made it', async () => {
    await expect(callWith({ id: 'user-2', roles: [] })).rejects.toThrow('FORBIDDEN')

    expect(recordedEvents()).toEqual([
      expect.objectContaining({
        actorId: 'user-2',
        outcome: 'denied',
        code: 'FORBIDDEN',
      }),
    ])
  })

  it('never records the procedure input', async () => {
    await callWith({ id: 'user-1', roles: ['clinician'] })
    await callWith(null).catch(() => {})

    const serialised = JSON.stringify(recordedEvents())
    expect(serialised).not.toContain('Ada')
    expect(serialised).not.toContain('Lovelace')
  })
})
