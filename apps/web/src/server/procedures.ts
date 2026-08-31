import { officeScopedInput } from '@fastehr/contracts'
import { TRPCError } from '@trpc/server'
import { auditPhiAccess } from './middleware/audit.ts'
import { requireAdminRole, requireAuth, requireRole } from './middleware/auth.ts'
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

/**
 * Procedures reserved for administrators — currently the staff-account CRUD.
 * Composed on top of the protected chain, so audit → authenticate → authorize
 * still runs first and a refused probe still leaves its trace.
 */
export const adminProcedure = protectedProcedure.use(requireAdminRole)

/**
 * Procedures that read or write for a single clinic site.
 *
 * A clinic with several sites has an authorization boundary between them: a
 * front-desk user at Downtown has no business reading Eastside's queue. The
 * office therefore belongs to the **actor**, resolved from the session, and a
 * request that names one is checked against that set rather than believed.
 *
 * The hazard this closes is that `office` began life as a value the browser
 * picked — a React context in `office-provider.tsx`, defaulting to "Downtown"
 * and switchable from the nav. A procedure filtering by an office taken from
 * its input would be asking the client which records it is entitled to, and the
 * answer would arrive in a query string that anyone can edit. Nothing about the
 * resulting request looks wrong in a log.
 *
 * It lives here rather than under ./middleware because it composes `.input()`
 * with a check — a procedure, not a middleware. Putting it in a middleware
 * module that imported `protectedProcedure` created exactly the cycle ADR 9
 * describes, and failed at import with `Cannot read properties of undefined`.
 *
 * See ADR 22.
 */
export const officeScopedProcedure = protectedProcedure
  .input(officeScopedInput)
  .use(({ ctx, input, next }) => {
    if (!ctx.actor.offices.includes(input.office)) {
      // FORBIDDEN, not NOT_FOUND: the actor is known and the site exists — they
      // are simply not entitled to it. The audit middleware records this as a
      // denial, which is the trail that matters here.
      throw new TRPCError({ code: 'FORBIDDEN' })
    }
    return next()
  })
