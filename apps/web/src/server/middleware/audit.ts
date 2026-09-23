import type { PhiAuditEvent } from '@fastehr/contracts'
import type { TRPCError } from '@trpc/server'
import { t } from '../trpc.ts'

/**
 * PHI access audit. Every procedure touching protected health information must
 * leave a trail, and — this is the part that is easy to get wrong — so must
 * every procedure that *refuses* to.
 *
 * Mounted outermost (see ../procedures.ts) so it observes the outcome of the
 * checks beneath it. `next()` resolves rather than throws when something
 * downstream fails, so a rejected call still produces a record, with `ctx.actor`
 * as whatever the request actually presented — `anonymous` for an
 * unauthenticated attempt.
 *
 * The event carries the procedure path and never its input (ADR 10); the
 * sink on the context (ADR 37) writes it to stdout and to the audit table.
 */
export const auditPhiAccess = t.middleware(async ({ ctx, path, type, next }) => {
  const startedAt = Date.now()
  const result = await next()

  ctx.audit.record({
    transport: 'trpc',
    actorKind: ctx.actor === null ? 'anonymous' : ctx.actor.roles.includes('integration') ? 'integration' : 'staff',
    actorId: ctx.actor?.id ?? null,
    action: path,
    method: type,
    ...describeOutcome(result),
    durationMs: Date.now() - startedAt,
  })

  return result
})

/** Access refused by the chain, as opposed to a procedure that failed. */
const DENIAL_CODES = new Set<string>(['UNAUTHORIZED', 'FORBIDDEN'])

function describeOutcome(result: {
  ok: boolean
  error?: TRPCError
}): Pick<PhiAuditEvent, 'outcome' | 'code'> {
  if (result.ok) return { outcome: 'allowed' }
  const code = result.error?.code
  if (code === undefined) return { outcome: 'error' }
  return { outcome: DENIAL_CODES.has(code) ? 'denied' : 'error', code }
}
