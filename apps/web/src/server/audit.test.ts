import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appRouter } from './routers/root.ts'
import { createContext, type Actor } from './context.ts'
import { createAuditSink } from './audit-log.ts'
import { fakeDb, recordingAuditRepository } from './test-support/fake-db.ts'

/**
 * The middleware chain, exercised through `createCaller` — no HTTP, no
 * database, no session. This is the payoff for keeping the router a plain
 * function of its context (ADR 9): the security behaviour
 * that most needs testing is also the cheapest thing in the repo to test.
 *
 * Two sinks (ADR 35): the stdout line, read back through a spy, and the
 * audit repository, faked here. Both must carry the same event.
 */
const repository = recordingAuditRepository()
const sink = createAuditSink(repository)

function callWith(actor: Actor | null) {
  return appRouter
    .createCaller(createContext({ actor, db: fakeDb({ audit: repository }), audit: sink }))
    .patientDisplayName({ firstName: 'Ada', lastName: 'Lovelace' })
}

const lines: unknown[] = []

beforeEach(() => {
  lines.length = 0
  repository.events.length = 0
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    // The sink writes one line of JSON per event; parsing it back here means
    // the test also asserts that what lands in the log is machine-readable.
    if (args[0] === '[phi-audit]') lines.push(JSON.parse(String(args[1])))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PHI audit', () => {
  it('records an allowed access, in the log and in the table', async () => {
    await expect(callWith({ id: 'user-1', roles: ['clinician'], locations: ['sylmar'] })).resolves.toBe('Lovelace, Ada')
    await sink.flush()

    const expected = expect.objectContaining({
      transport: 'trpc',
      actorKind: 'staff',
      actorId: 'user-1',
      action: 'patientDisplayName',
      method: 'query',
      outcome: 'allowed',
    })
    expect(lines).toEqual([expected])
    expect(repository.events).toEqual([expected])
  })

  it('records an unauthenticated attempt as denied', async () => {
    // The regression: with the audit innermost, a rejected call never reached
    // it and the most security-relevant event in the system vanished.
    await expect(callWith(null)).rejects.toThrow('UNAUTHORIZED')
    await sink.flush()

    expect(repository.events).toEqual([
      expect.objectContaining({
        actorKind: 'anonymous',
        actorId: null,
        action: 'patientDisplayName',
        outcome: 'denied',
        code: 'UNAUTHORIZED',
      }),
    ])
  })

  it('records an unauthorized attempt as denied, with the actor that made it', async () => {
    await expect(callWith({ id: 'user-2', roles: [], locations: ['sylmar'] })).rejects.toThrow('FORBIDDEN')
    await sink.flush()

    expect(repository.events).toEqual([
      expect.objectContaining({
        actorKind: 'staff',
        actorId: 'user-2',
        outcome: 'denied',
        code: 'FORBIDDEN',
      }),
    ])
  })

  it('never records the procedure input, in either sink', async () => {
    await callWith({ id: 'user-1', roles: ['clinician'], locations: ['sylmar'] })
    await callWith(null).catch(() => {})
    await sink.flush()

    for (const serialised of [JSON.stringify(lines), JSON.stringify(repository.events)]) {
      expect(serialised).not.toContain('Ada')
      expect(serialised).not.toContain('Lovelace')
    }
  })

  it('a failed table write does not fail the call', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = createAuditSink({
      record: async () => {
        throw new Error('database unreachable')
      },
    })
    const caller = appRouter.createCaller(
      createContext({ actor: { id: 'user-1', roles: ['clinician'], locations: ['sylmar'] }, db: fakeDb(), audit: failing }),
    )

    await expect(caller.patientDisplayName({ firstName: 'Ada', lastName: 'Lovelace' })).resolves.toBe('Lovelace, Ada')
    await failing.flush()

    // The stdout line is still the evidence, and the failure is its own line.
    expect(lines).toHaveLength(1)
    expect(console.error).toHaveBeenCalledWith('[phi-audit] write failed', '-', expect.any(Error))
  })
})
