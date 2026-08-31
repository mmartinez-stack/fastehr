import { patientSchema } from '@fastehr/contracts'
import { Badge } from '@/components/ui/badge'
import { api, HydrateClient } from '@/trpc/server'
import { HealthStatus } from './health-status.tsx'

/**
 * Workspace wiring smoke test.
 *
 * Deliberately NOT `/health`: a liveness probe has to be answerable by a load
 * balancer without rendering UI or running schema validation. `/health` stays
 * free for that; this route exercises the wiring instead, so a broken
 * `transpilePackages` entry or a bad path alias fails the build rather than
 * surfacing at runtime.
 *
 * It now also covers the client seam end to end: a procedure called in-process
 * from this Server Component, prefetched into a request-scoped QueryClient,
 * dehydrated through superjson, and read from the hydrated cache by a Client
 * Component — the whole path a real page will use, exercised by a route that
 * owns no product behaviour.
 */
export default async function SmokePage() {
  // Called directly: no HTTP, but through the same middleware chain.
  const health = await api.health()

  // Prefetched for the browser. `void`, not `await` — the shell streams while
  // the query resolves, and a pending query still dehydrates.
  void api.health.prefetch()

  const parsed = patientSchema.safeParse({
    id: '3f1c9a52-5d1e-4a3b-9c7f-2e8b6d0a1f44',
    firstName: 'Ada',
    lastName: 'Lovelace',
    dateOfBirth: '1815-12-10',
    gender: null,
    heightInches: null,
    healthyWeight: null,
    language: null,
    office: null,
    email: null,
    phone: null,
    phoneFollowUpAllowed: true,
    addressStreet: null,
    addressCity: null,
    addressState: null,
    addressZip: null,
    referralSource: null,
    referredByPatientId: null,
    historyNotes: null,
    programType: null,
    status: 'active',
  })

  return (
    <HydrateClient>
      <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace smoke test</h1>
        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex items-center justify-between">
            <span>@/components/ui (shadcn)</span>
            <Badge variant="secondary">component imported</Badge>
          </li>
          <li className="flex items-center justify-between">
            <span>@fastehr/contracts</span>
            <Badge variant={parsed.success ? 'default' : 'destructive'}>
              {parsed.success ? 'schema valid' : 'schema failed'}
            </Badge>
          </li>
          <li className="flex items-center justify-between">
            <span>tRPC — server caller</span>
            <Badge>{`in-process: ${health.status}`}</Badge>
          </li>
          <li className="flex items-center justify-between">
            <span>tRPC — client, from prefetch</span>
            <HealthStatus />
          </li>
        </ul>
      </main>
    </HydrateClient>
  )
}
