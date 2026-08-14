import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query'
import superjson from 'superjson'

/**
 * The React Query configuration, shared by both sides of the seam — the server
 * builds a client to prefetch into, the browser builds one to hydrate from, and
 * they must agree.
 *
 * `serializeData` / `deserializeData` are superjson because the wire format is
 * (README, "The wire format is superjson"). React Query dehydration is a
 * *second* serialisation boundary, separate from the tRPC link: data prefetched
 * on the server is embedded into the HTML payload and revived in the browser
 * without passing through a tRPC link at all. Configure one and not the other
 * and `Date`s survive the fetch path while arriving as strings on the
 * prefetched path — the same value, two shapes, depending on which route it
 * took.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Long enough that a client component mounting immediately after
        // hydration does not refetch what the server just sent.
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        // Ship queries that are still in flight, so a prefetch that has not
        // resolved by the time the shell flushes still streams to the client
        // rather than restarting there.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  })
}
