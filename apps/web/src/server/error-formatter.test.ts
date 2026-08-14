import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { describe, expect, it } from 'vitest'
import { createContext, type Actor } from './context.ts'
import { appRouter } from './routers/root.ts'

/**
 * What a rejected input looks like on the wire.
 *
 * The failure being guarded is a disclosure, not a crash. tRPC's default
 * message for a Zod parse failure is the serialised issue array, which carries
 * whatever text the schema author wrote — and an error payload comes to rest in
 * browser consoles, proxy logs, and error trackers. Zod's own defaults do not
 * quote the offending value; a hand-written refinement message can, and this is
 * what makes that harmless.
 */
const CLINICIAN: Actor = { id: 'user-1', roles: ['clinician'] }

async function callWithInput(input: unknown, actor: Actor | null = CLINICIAN) {
  // A query, so: GET with the input in the query string, superjson-enveloped.
  // See README, "The wire format is superjson".
  const encoded = encodeURIComponent(JSON.stringify({ json: input }))
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request(`http://test.invalid/api/trpc/patientDisplayName?input=${encoded}`),
    router: appRouter,
    createContext: () => createContext({ actor }),
  })
  return { status: response.status, body: await response.text() }
}

describe('error formatter', () => {
  it('reports which field failed, and how, by issue code', async () => {
    const { body } = await callWithInput({ firstName: '', lastName: 'Lovelace' })
    const parsed = JSON.parse(body) as {
      error: { json: { message: string; data: { validation: { fieldErrors: Record<string, string[]> } } } }
    }

    expect(parsed.error.json.message).toBe('Invalid input')
    expect(parsed.error.json.data.validation.fieldErrors).toEqual({ firstName: ['too_small'] })
  })

  it('strips Zod message text from the payload entirely', async () => {
    // Not "does the value leak" — Zod 4's defaults do not quote it. The
    // property that matters is that *no* schema-authored text reaches the wire,
    // which is what makes a future `.refine(…, `bad MRN: ${value}`)` harmless.
    // Without the errorFormatter the body carries this text verbatim.
    const { body } = await callWithInput({ firstName: '', lastName: 42 })

    expect(body).not.toContain('Too small')
    expect(body).not.toContain('expected string')
    expect(body).not.toContain('minimum')
  })

  it('never returns a stack, which would carry that text back in', async () => {
    // How the above was first got wrong: the message was replaced correctly,
    // and the whole serialised ZodError came back through `data.stack` — which
    // tRPC includes outside production — together with absolute server paths.
    const { body } = await callWithInput({ firstName: '', lastName: 42 })

    expect(body).not.toContain('stack')
    expect(body).not.toContain('/apps/web/src/server')
    expect(body).not.toContain('node_modules')
  })

  it('leaves non-validation errors untouched', async () => {
    const { body } = await callWithInput({ firstName: 'Ada', lastName: 'Lovelace' }, null)
    const parsed = JSON.parse(body) as {
      error: { json: { message: string; data: { validation?: unknown } } }
    }

    expect(parsed.error.json.message).toBe('UNAUTHORIZED')
    expect(parsed.error.json.data.validation).toBeUndefined()
  })
})
