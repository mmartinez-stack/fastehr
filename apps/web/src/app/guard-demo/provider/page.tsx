import { guardPage } from '@/lib/guard-page'

/**
 * Guard demonstration only — proves `requireSurface('clinical')` end to end.
 * Not a real screen; the visibility work replaces these.
 */
export const dynamic = 'force-dynamic'

export default async function ProviderGuardDemoPage() {
  const gate = await guardPage('clinical')

  if (gate.status === 'forbidden') {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">403: forbidden</h1>
        <p className="text-sm text-muted-foreground">This route requires the provider role.</p>
      </main>
    )
  }

  return (
    <main className="p-8">
      <h1 className="text-lg font-semibold">provider route</h1>
      <p className="text-sm text-muted-foreground">Signed in as actor {gate.actor.id}.</p>
    </main>
  )
}
