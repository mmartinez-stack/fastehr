import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter, createContext } from '@/server'
import { actorFromCookieHeader } from '@/trpc/actor'

/**
 * The tRPC mount point, and the only file permitted to bridge Next.js into the
 * server layer. Everything under `src/server/**` is barred from importing
 * `next/*` (see eslint.config.mjs) so the router stays mountable in a
 * standalone process; request state crosses that line here, as plain arguments
 * to `createContext`.
 */

// A tRPC endpoint is per-request by definition — never prerender it.
export const dynamic = 'force-dynamic'

/**
 * Actor resolution is shared with the RSC caller (`@/trpc/server`) rather than
 * written twice — the two hosts differ only in where the cookie header comes
 * from, and two implementations of "who is this" is one more than a system
 * should have.
 */
function handler(request: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: () =>
      createContext({ actor: actorFromCookieHeader(request.headers.get('cookie')) }),
  })
}

export { handler as GET, handler as POST }
