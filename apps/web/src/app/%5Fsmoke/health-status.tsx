'use client'

import { Badge } from '@/components/ui/badge'
import { trpc } from '@/trpc/client'

/**
 * The browser end of the smoke test.
 *
 * This asks for data the server already prefetched, so on first paint it must
 * render from the hydrated cache with no network request. If the seam is
 * misconfigured at any point — provider missing, transformer mismatched between
 * link and server, dehydrate/hydrate serialisers disagreeing — this renders its
 * loading state and then fetches, which is visible in the page and in the
 * network panel rather than silently slower.
 */
export function HealthStatus() {
  const health = trpc.health.useQuery()

  if (health.error !== null) {
    return <Badge variant="destructive">rpc failed</Badge>
  }

  return (
    <Badge variant={health.data === undefined ? 'secondary' : 'default'}>
      {health.data === undefined ? 'not hydrated' : `hydrated: ${health.data.status}`}
    </Badge>
  )
}
