'use client'

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { httpBatchStreamLink } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import { useState, type ReactNode } from 'react'
import superjson from 'superjson'
import type { AppRouter } from '@/lib/api-types'
import { makeQueryClient } from './query-client.ts'

/**
 * The browser half of the seam.
 *
 * `AppRouter` is imported as a type through `@/lib/api-types`, so the router,
 * the tRPC runtime, and everything they reach — Prisma included — are erased at
 * compile time and never enter the client bundle. Inference survives; the code
 * does not.
 */
export const trpc = createTRPCReact<AppRouter>()

/**
 * One client per browser tab, a fresh one per server render.
 *
 * On the server every request must get its own, or two users' caches merge. In
 * the browser the opposite is required: re-creating it on a re-render would
 * throw away the hydrated cache, so it is memoised at module scope — but
 * deliberately *not* at module scope on the server, which is the asymmetry this
 * function exists to express.
 */
let browserQueryClient: QueryClient | undefined

function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') return makeQueryClient()
  return (browserQueryClient ??= makeQueryClient())
}

function getBaseUrl(): string {
  // Relative in the browser. During SSR of a client component there is no
  // origin to be relative to, so a base is required; it is only reached by a
  // query that was not prefetched, which is the case worth making obvious
  // rather than silently failing.
  if (typeof window !== 'undefined') return ''
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchStreamLink({
          url: `${getBaseUrl()}/api/trpc`,
          // In tRPC v11 the transformer lives on the link, not the client root.
          // It must match the server's (src/server/trpc.ts).
          transformer: superjson,
        }),
      ],
    }),
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
