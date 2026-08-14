import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import superjson from 'superjson'
import { describe, expect, it } from 'vitest'
import { createContext } from './context.ts'
import { publicProcedure } from './procedures.ts'
import { router } from './trpc.ts'

/**
 * Guards the transformer on the tRPC instance itself, over a real HTTP
 * round-trip through the fetch adapter — the same adapter the route handler
 * mounts.
 *
 * The router here is local to the test on purpose: the app router has no
 * procedure returning a `Date` yet, and the property under test belongs to the
 * `initTRPC` configuration, not to any particular procedure. Delete
 * `transformer: superjson` from trpc.ts and these fail.
 */
const probeRouter = router({
  appointment: publicProcedure.query(() => ({
    startsAt: new Date('2026-01-02T09:30:00.000Z'),
  })),
})

async function callOverHttp(): Promise<{ result: { data: unknown } }> {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request('http://test.invalid/api/trpc/appointment'),
    router: probeRouter,
    createContext: () => createContext({ actor: null }),
  })
  return response.json() as Promise<{ result: { data: unknown } }>
}

describe('wire transformer', () => {
  it('carries a Date across the wire as a Date', async () => {
    const body = await callOverHttp()
    const data = superjson.deserialize<{ startsAt: Date }>(
      body.result.data as Parameters<typeof superjson.deserialize>[0],
    )

    expect(data.startsAt).toBeInstanceOf(Date)
    expect(data.startsAt.toISOString()).toBe('2026-01-02T09:30:00.000Z')
  })

  it('is what restores the type — the raw payload is still a string', async () => {
    // The failure this documents: with no transformer the response body *is*
    // the plain object below, the client receives a string, and the inferred
    // type still claims `Date`. Nothing errors; the value is simply wrong.
    const body = (await callOverHttp()) as unknown as {
      result: { data: { json: { startsAt: unknown }; meta?: unknown } }
    }

    expect(typeof body.result.data.json.startsAt).toBe('string')
    expect(body.result.data.meta).toBeDefined()
  })
})
