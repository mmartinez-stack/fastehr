import type { TRPCError } from '@trpc/server'
import { recordAuditEvent, type AuditEvent } from '../audit-log.ts'
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
 */
export const auditPhiAccess = t.middleware(async ({ ctx, path, type, next }) => {
  const startedAt = Date.now()
  const result = await next()

  recordAuditEvent({
    actorId: ctx.actor?.id ?? 'anonymous',
    path,
    type,
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
}): Pick<AuditEvent, 'outcome' | 'code'> {
  if (result.ok) return { outcome: 'allowed' }
  const code = result.error?.code
  if (code === undefined) return { outcome: 'error' }
  return { outcome: DENIAL_CODES.has(code) ? 'denied' : 'error', code }
}
