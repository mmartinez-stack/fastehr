import 'server-only'

import { staffRoleSchema, type Office, type StaffRole } from '@fastehr/contracts'
import { headers } from 'next/headers'
import { actorFromHeaders } from '@/server'

/**
 * Session facts a Server Component may render from directly, without going
 * through a procedure.
 *
 * Only identity belongs here — who the user is and what they are scoped to.
 * Anything that reads a record goes through a procedure, so it passes auth,
 * RBAC, and the PHI audit (see ADR 9). An office list and a role are neither
 * PHI nor a record; they are the shape of the navigation.
 */

export interface SessionIdentity {
  /** The account's one role — what decides which sections and menus render. */
  role: StaffRole
  /** The clinic sites the user may view (ADR 22). */
  offices: readonly Office[]
  /** The medical-director flag (DIA-74): shows the review entry in the nav. */
  medicalDirector: boolean
}

/**
 * The current user's role and permitted sites, or `null` for an anonymous
 * request. The anonymous every-site fallback the mockup carried is gone, as
 * ADR 22 promised; the role likewise comes from the actor, never from a
 * client-side switch (ADR 28).
 */
export async function sessionIdentity(): Promise<SessionIdentity | null> {
  const requestHeaders = await headers()
  const actor = await actorFromHeaders(requestHeaders)
  if (actor === null) return null

  // Actors carry one role today; the first is the role. A value outside the
  // vocabulary would already have failed `actorFromHeaders`.
  const role = staffRoleSchema.safeParse(actor.roles[0])
  if (!role.success) return null

  return { role: role.data, offices: actor.offices, medicalDirector: actor.medicalDirector === true }
}
