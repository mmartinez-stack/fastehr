import type { LocationFilter, LocationSlug } from '@fastehr/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createContext, type Actor } from './context.ts'
import { locationFilteredProcedure } from './procedures.ts'
import { router } from './trpc.ts'
import type { AuditEvent } from './audit-log.ts'

/**
 * A request naming a clinic the actor does not hold must be refused, and the
 * refusal must be on the record; "all" is every clinic the actor holds.
 *
 * Every real actor holds every clinic today (ADR 32), so the refusal is a
 * property of the procedure kind rather than of any caller — pinned here so
 * it survives the day an actor is scoped narrower again.
 */
const probeRouter = router({
  queue: locationFilteredProcedure.query(({ input }) => `queue for ${input.location}`),
})

function actor(locations: readonly LocationSlug[]): Actor {
  return { id: 'user-1', roles: ['front-desk'], locations }
}

function callFor(requested: LocationFilter, permitted: readonly LocationSlug[]) {
  return probeRouter.createCaller(createContext({ actor: actor(permitted) })).queue({
    location: requested,
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

describe('location filtering', () => {
  it('allows a clinic the actor holds, and the unified view', async () => {
    await expect(callFor('sylmar', ['sylmar', 'kanoga'])).resolves.toBe('queue for sylmar')
    await expect(callFor('all', ['sylmar'])).resolves.toBe('queue for all')
  })

  it('refuses a clinic the actor does not hold', async () => {
    // The value arrives from a nav selector the browser controls; asking for
    // another clinic has to be refused by the server, not by the selector.
    await expect(callFor('kanoga', ['sylmar'])).rejects.toThrow('FORBIDDEN')
  })

  it('records the refusal as a denial, with the actor that made it', async () => {
    await expect(callFor('kanoga', ['sylmar'])).rejects.toThrow()

    expect(recorded).toEqual([
      expect.objectContaining({ actorId: 'user-1', outcome: 'denied', code: 'FORBIDDEN' }),
    ])
  })

  it('never records which clinic was asked for', async () => {
    await expect(callFor('kanoga', ['sylmar'])).rejects.toThrow()

    expect(JSON.stringify(recorded)).not.toContain('kanoga')
  })

  it('rejects a location outside the contract before authorization runs', async () => {
    const caller = probeRouter.createCaller(createContext({ actor: actor(['sylmar']) }))

    // @ts-expect-error — the contract is a union of slugs; this is the runtime guard.
    await expect(caller.queue({ location: 'springfield' })).rejects.toThrow()
  })
})
