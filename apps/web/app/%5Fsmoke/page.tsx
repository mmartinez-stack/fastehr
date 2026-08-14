import { Badge } from '@ui'
import { patientSchema } from '@fastehr/contracts'

/**
 * Workspace wiring smoke test.
 *
 * Deliberately NOT `/health`: a liveness probe has to be answerable by a load
 * balancer without rendering UI or running schema validation. `/health` stays
 * free for that; this route exercises the wiring instead, so a broken
 * `transpilePackages` entry or a bad path alias fails the build rather than
 * surfacing at runtime.
 */
export default function SmokePage() {
  const parsed = patientSchema.safeParse({
    id: '3f1c9a52-5d1e-4a3b-9c7f-2e8b6d0a1f44',
    firstName: 'Ada',
    lastName: 'Lovelace',
    dateOfBirth: '1815-12-10',
  })

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Workspace smoke test</h1>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-center justify-between">
          <span>app-local components</span>
          <Badge data-testid="smoke-components">component imported</Badge>
        </li>
        <li className="flex items-center justify-between">
          <span>@fastehr/contracts</span>
          <Badge data-testid="smoke-contracts">
            {parsed.success ? 'schema valid' : 'schema failed'}
          </Badge>
        </li>
      </ul>
    </main>
  )
}
