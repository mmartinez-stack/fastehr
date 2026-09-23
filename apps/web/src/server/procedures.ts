import { locationFilteredInput } from '@fastehr/contracts'
import { TRPCError } from '@trpc/server'
import { auditPhiAccess } from './middleware/audit.ts'
import {
  requireAdminRole,
  requireAuth,
  requireClericalRole,
  requireIntegration,
  requireMedicalDirector,
  requireRole,
} from './middleware/auth.ts'
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
  .meta({ access: 'session' })
  .use(auditPhiAccess)
  .use(requireAuth)
  .use(requireRole)

/**
 * Procedures reserved for administrators — currently the staff-account CRUD.
 * Composed on top of the protected chain, so audit → authenticate → authorize
 * still runs first and a refused probe still leaves its trace.
 */
export const adminProcedure = protectedProcedure.meta({ access: 'staff' }).use(requireAdminRole)

/**
 * Procedures for the clerical half of a patient record — demographics,
 * billing, and creating a record (ADR 28). Admins and the front desk. A
 * provider gets FORBIDDEN, and the audit trail shows the probe.
 */
export const clericalProcedure = protectedProcedure.meta({ access: 'clerical' }).use(requireClericalRole)

/** The note review queue and its sign-off (DIA-74, ADR 31): the medical director role. */
export const medicalDirectorProcedure = protectedProcedure.meta({ access: 'review' }).use(requireMedicalDirector)

/**
 * The partner account's own page (ADR 36 as amended). Not composed on the
 * protected chain, whose `requireRole` refuses the integration role by
 * design; the chain is the same shape (audit, authenticate, authorize) with
 * the one surface that role holds.
 */
export const integrationProcedure = publicProcedure
  .meta({ access: 'integration' })
  .use(auditPhiAccess)
  .use(requireAuth)
  .use(requireIntegration)

/**
 * Procedures that list for one clinic, or for all of them (`'all'`).
 *
 * The location named in the input is checked against the **actor's** set,
 * resolved from the session, rather than believed (ADR 22). Since the Aug 21
 * sync a location is a filter, not a boundary, and every actor holds every
 * clinic (ADR 32) — so today the check refuses only a slug the contract does
 * not know. The shape is kept because the hazard it closed has not changed:
 * the value still arrives from a nav selector the browser controls, and a
 * procedure must never take from its input which records the caller may see.
 *
 * It lives here rather than under ./middleware because it composes `.input()`
 * with a check — a procedure, not a middleware. Putting it in a middleware
 * module that imported `protectedProcedure` created exactly the cycle ADR 9
 * describes, and failed at import with `Cannot read properties of undefined`.
 */
export const locationFilteredProcedure = protectedProcedure
  .meta({ access: 'session', locationScoped: true })
  .input(locationFilteredInput)
  .use(({ ctx, input, next }) => {
    if (input.location !== 'all' && !ctx.actor.locations.includes(input.location)) {
      // FORBIDDEN, not NOT_FOUND: the actor is known and the clinic exists —
      // they are simply not entitled to it. The audit middleware records this
      // as a denial, which is the trail that matters here.
      throw new TRPCError({ code: 'FORBIDDEN' })
    }
    return next()
  })

/** A clinic's clerical queue (the pending intakes): location-filtered *and* clerical. */
export const clericalLocationProcedure = locationFilteredProcedure
  .meta({ access: 'clerical' })
  .use(requireClericalRole)
