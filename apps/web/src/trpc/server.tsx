import 'server-only'

import { createHydrationHelpers } from '@trpc/react-query/rsc'
import { headers } from 'next/headers'
import { cache } from 'react'
import { appRouter, createContext, type AppRouter } from '@/server'
import { actorFromCookieHeader } from './actor.ts'
import { makeQueryClient } from './query-client.ts'

/**
 * The server half of the seam: call procedures from Server Components, and hand
 * what they returned to the browser without fetching it twice.
 *
 * `api` is the router called **in-process** — no HTTP, no serialisation, no
 * network hop — while still passing through the whole middleware chain, so a
 * Server Component reading PHI is authenticated, authorised, and audited
 * exactly like a request from the browser. That is the property the import
 * fence in eslint.config.mjs exists to protect, and this file is what makes
 * obeying it possible.
 *
 * **This is the only module that resolves an actor for RSC.** `createContext`
 * is exported from `@/server` and a component could call it with an actor of
 * its own invention; lint cannot tell that apart from this file, which needs
 * the identical import. Keeping actor resolution in one place is the
 * convention that closes it — and the reason it is worth noticing here rather
 * than discovering later.
 *
 * `server-only` makes importing this from a Client Component a build error.
 */

/**
 * One QueryClient per request. `cache()` keys it to the React request scope, so
 * every Server Component in a single render prefetches into the same store and
 * `HydrateClient` ships one payload — while two concurrent requests never share
 * a cache. A module-level client would leak one user's data into another's
 * render.
 */
export const getQueryClient = cache(makeQueryClient)

const caller = appRouter.createCaller(async () => {
  const requestHeaders = await headers()
  return createContext({ actor: actorFromCookieHeader(requestHeaders.get('cookie')) })
})

/**
 * `api` — call or prefetch from a Server Component.
 * `HydrateClient` — wrap the subtree that consumes the prefetched data.
 *
 * ```tsx
 * void api.health.prefetch()
 * return <HydrateClient><ClientThing /></HydrateClient>
 * ```
 *
 * `void` rather than `await` starts the query and lets the shell stream; the
 * pending query is dehydrated (see query-client.ts) so the browser picks it up
 * instead of starting again.
 */
export const { trpc: api, HydrateClient } = createHydrationHelpers<AppRouter>(caller, getQueryClient)
