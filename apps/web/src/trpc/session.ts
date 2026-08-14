import 'server-only'

import { officeSchema, type Office } from '@fastehr/contracts'
import { headers } from 'next/headers'
import { actorFromCookieHeader } from './actor.ts'

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
 * **The fallback is the auth ticket's job to delete.** With no session there is
 * no actor, and the mockup still has to render, so an anonymous caller
 * currently gets every site. That is deliberate and survivable only because
 * nothing is scoped by it yet: `officeScopedProcedure` re-checks every
 * office-scoped request against `ctx.actor.offices`, so a wide list here grants
 * no data. When sessions exist this becomes `actor.offices` outright, and an
 * anonymous caller gets nothing.
 */
export async function permittedOffices(): Promise<readonly Office[]> {
  const requestHeaders = await headers()
  const actor = actorFromCookieHeader(requestHeaders.get('cookie'))

  return actor?.offices ?? officeSchema.options
}
