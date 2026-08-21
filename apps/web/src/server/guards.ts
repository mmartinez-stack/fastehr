import type { StaffRole } from '@fastehr/contracts'
import { actorFromHeaders } from './auth.ts'
import type { Actor } from './context.ts'

/**
 * The server-side entry-point guards. Deliberately the only chokepoint —
 * the later per-role visibility work grows from exactly here.
 *
 * Both guards read the session from request `Headers`, server-side, every
 * time. A role value sent by a client, or read from anything a client can
 * write, is never an input. Both fail **closed**: any failure to resolve a
 * session — absent, expired, malformed, or erroring — is a denial, never a
 * pass-through.
 */

export type GuardDenialCode = 'UNAUTHENTICATED' | 'PASSWORD_CHANGE_REQUIRED' | 'FORBIDDEN'

export class GuardDenied extends Error {
  constructor(readonly code: GuardDenialCode) {
    super(code)
    this.name = 'GuardDenied'
  }
}

/**
 * The session guard. Returns the actor or throws `GuardDenied` — never null.
 *
 * An account flagged `mustChangePassword` authenticates but is refused here,
 * so a temp credential cannot be used to work: the only door it opens is the
 * password-change flow, which opts in via `allowPendingPasswordChange`.
 */
export async function requireSession(
  headers: Headers,
  options?: { allowPendingPasswordChange?: boolean },
): Promise<Actor> {
  let actor: Actor | null
  try {
    actor = await actorFromHeaders(headers)
  } catch {
    // An erroring session lookup is indistinguishable from no session.
    actor = null
  }

  if (actor === null) throw new GuardDenied('UNAUTHENTICATED')

  if (actor.mustChangePassword === true && options?.allowPendingPasswordChange !== true) {
    throw new GuardDenied('PASSWORD_CHANGE_REQUIRED')
  }

  return actor
}

/**
 * The role guard. At least one role is required by the signature — there is
 * no way to call this that accidentally allows everyone.
 */
export async function requireRole(
  headers: Headers,
  ...roles: readonly [StaffRole, ...StaffRole[]]
): Promise<Actor> {
  const actor = await requireSession(headers)

  if (!roles.some((role) => actor.roles.includes(role))) {
    throw new GuardDenied('FORBIDDEN')
  }

  return actor
}
