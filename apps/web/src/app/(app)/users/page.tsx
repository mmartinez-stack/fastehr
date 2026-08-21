import { guardPage } from '@/lib/guard-page'
import { api, HydrateClient } from '@/trpc/server'
import { UsersView } from './users-view.tsx'

/**
 * Staff administration — admin only. The guard runs server-side before
 * anything renders or prefetches; the procedures behind the view re-check on
 * every call, so the page gate is presentation, not the security boundary.
 */
export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const gate = await guardPage('admin')

  if (gate.status === 'forbidden') {
    return (
      <div className="py-16 text-center">
        <h1 className="text-lg font-semibold">403 — forbidden</h1>
        <p className="text-sm text-muted-foreground">User administration requires the admin role.</p>
      </div>
    )
  }

  void api.staffUsers.list.prefetch()

  return (
    <HydrateClient>
      <UsersView currentUserId={gate.actor.id} />
    </HydrateClient>
  )
}
