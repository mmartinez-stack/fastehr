import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter, createContext, type Actor } from '@/server'

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
 * Placeholder actor resolution. The auth ticket replaces this with real session
 * verification; the shape it must return is already fixed by `Actor`.
 */
function resolveActor(_request: Request): Actor | null {
  return null
}

function handler(request: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: appRouter,
    createContext: () => createContext({ actor: resolveActor(request) }),
  })
}

export { handler as GET, handler as POST }
