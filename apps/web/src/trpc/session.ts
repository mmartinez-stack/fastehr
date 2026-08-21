import 'server-only'

import { type Office } from '@fastehr/contracts'
import { headers } from 'next/headers'
import { actorFromHeaders } from '@/server'

/**
 * Session facts a Server Component may render from directly, without going
 * through a procedure.
 *
 * Only identity belongs here — who the user is and what they are scoped to.
 * Anything that reads a record goes through a procedure, so it passes auth,
 * RBAC, and the PHI audit (see ADR 9). An office list is neither PHI nor a
 * record; it is the shape of the navigation.
 */

/**
 * The clinic sites the current user may view.
 *
 * The anonymous every-site fallback the mockup carried is gone, as ADR 22
 * promised: the set comes from the actor, and an anonymous caller gets
 * nothing.
 */
export async function permittedOffices(): Promise<readonly Office[]> {
  const requestHeaders = await headers()
  const actor = await actorFromHeaders(requestHeaders)

  return actor?.offices ?? []
}
