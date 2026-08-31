import type { Office } from '@fastehr/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createContext, type Actor } from './context.ts'
import { officeScopedProcedure } from './procedures.ts'
import { router } from './trpc.ts'
import type { AuditEvent } from './audit-log.ts'

/**
 * A request naming an office it is not entitled to must be refused, and the
 * refusal must be on the record.
 *
 * The router is local to the test because no product procedure is
 * office-scoped yet — the property under test belongs to the procedure kind,
 * not to any one caller. It is written now so the first office-scoped query
 * inherits it rather than reinventing it.
 */
const probeRouter = router({
  queue: officeScopedProcedure.query(({ input }) => `queue for ${input.office}`),
})

function actor(offices: readonly Office[]): Actor {
  return { id: 'user-1', roles: ['front-desk'], offices }
}

function callFor(requested: Office, permitted: readonly Office[]) {
  return probeRouter.createCaller(createContext({ actor: actor(permitted) })).queue({
    office: requested,
  })
}

const recorded: AuditEvent[] = []

beforeEach(() => {
  recorded.length = 0
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    if (args[0] === '[phi-audit]') recorded.push(JSON.parse(String(args[1])) as AuditEvent)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('office scoping', () => {
  it('allows a site the actor holds', async () => {
    await expect(callFor('Sylmar', ['Sylmar', 'Montebello'])).resolves.toBe('queue for Sylmar')
  })

  it('refuses a site the actor does not hold', async () => {
    // The attack this closes is a query string edit, not a compromise: the
    // office used to be a React context the browser chose and defaulted to
    // "Sylmar". Asking for another site has to be refused by the server,
    // because the client is where the value came from.
    await expect(callFor('Montebello', ['Sylmar'])).rejects.toThrow('FORBIDDEN')
  })

  it('refuses an actor scoped to no site at all', async () => {
    await expect(callFor('Sylmar', [])).rejects.toThrow('FORBIDDEN')
  })

  it('records the refusal as a denial, with the actor that made it', async () => {
    await expect(callFor('Montebello', ['Sylmar'])).rejects.toThrow()

    expect(recorded).toEqual([
      expect.objectContaining({ actorId: 'user-1', outcome: 'denied', code: 'FORBIDDEN' }),
    ])
  })

  it('never records which site was asked for', async () => {
    // The audit event has no field for input, and a site name is a weak
    // identifier when paired with a timestamp and an actor.
    await expect(callFor('Montebello', ['Sylmar'])).rejects.toThrow()

    expect(JSON.stringify(recorded)).not.toContain('Montebello')
  })

  it('rejects an office outside the contract before authorization runs', async () => {
    const caller = probeRouter.createCaller(createContext({ actor: actor(['Sylmar']) }))

    // @ts-expect-error — the contract is an enum; this is the runtime guard.
    await expect(caller.queue({ office: 'Springfield' })).rejects.toThrow()
  })
})
