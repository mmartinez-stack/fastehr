import 'server-only'

import { staffRoleSchema, type StaffRole } from '@fastehr/contracts'
import { headers } from 'next/headers'
import { actorFromHeaders } from '@/server'

/**
 * Session facts a Server Component may render from directly, without going
 * through a procedure.
 *
 * Only identity belongs here — who the user is and what they are scoped to.
 * Anything that reads a record goes through a procedure, so it passes auth,
 * RBAC, and the PHI audit (see ADR 9). A role is neither PHI nor a record;
 * it is the shape of the navigation. The clinics a user may filter by are
 * rows (ADR 32), so the layout reads them through `location.listActive`.
 */

export interface SessionIdentity {
  /** The account's one role — what decides which sections and menus render. */
  role: StaffRole
}

/**
 * The current user's role, or `null` for an anonymous request. The role
 * comes from the actor, never from a client-side switch (ADR 28).
 */
export async function sessionIdentity(): Promise<SessionIdentity | null> {
  const requestHeaders = await headers()
  const actor = await actorFromHeaders(requestHeaders)
  if (actor === null) return null

  // Actors carry one role today; the first is the role. A value outside the
  // vocabulary would already have failed `actorFromHeaders`.
  const role = staffRoleSchema.safeParse(actor.roles[0])
  if (!role.success) return null

  return { role: role.data }
}
