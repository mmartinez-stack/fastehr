import { auditPhiAccess } from './middleware/audit.ts'
import { requireAuth, requireRole } from './middleware/auth.ts'
import { publicProcedure } from './trpc.ts'

/**
 * The procedure kinds a router builds on. Composition only — the middlewares
 * themselves live under ./middleware, and the tRPC instance in ./trpc.ts.
 */

export { publicProcedure }

/**
 * Procedures that read or write PHI. The chain order is deliberate: audit
 * outermost, then authenticate, then authorize.
 *
 * An earlier version ran the audit innermost, on the reasoning that a record
 * should only be written for calls that passed authorization. That is the right
 * instinct for an *access* log and the wrong one for a *security* log: it meant
 * an actor probing records they had no right to left no trace at all, while
 * every legitimate read was faithfully recorded. Refused attempts are the
 * events an investigation actually goes looking for.
 */
export const protectedProcedure = publicProcedure
  .use(auditPhiAccess)
  .use(requireAuth)
  .use(requireRole)
