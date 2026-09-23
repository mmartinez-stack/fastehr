import { STAFF_SURFACES, roleHasAccess, type RoleSurface } from '@fastehr/contracts'
import { TRPCError } from '@trpc/server'
import { t } from '../trpc.ts'

/**
 * Authentication. Narrows `actor` to non-null for everything downstream.
 */
/**
 * A session under an admin-issued temporary password is real but not yet
 * the person's own: the page guards send it to /change-password, and the
 * procedures refuse it the same way (DIA-77), so a temporary credential
 * cannot read through `/api/trpc` what the screens would not show. The
 * change itself goes through Better Auth, never a procedure, so no
 * procedure needs an exception. The message is a code, not prose, for the
 * client to act on.
 */
function refusePendingPasswordChange(actor: { mustChangePassword?: boolean }): void {
  if (actor.mustChangePassword === true) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'PASSWORD_CHANGE_REQUIRED' })
  }
}

export const requireAuth = t.middleware(({ ctx, next }) => {
  if (ctx.actor === null) throw new TRPCError({ code: 'UNAUTHORIZED' })
  refusePendingPasswordChange(ctx.actor)
  return next({ ctx: { ...ctx, actor: ctx.actor } })
})

/**
 * Role check (RBAC), coarsest form: the actor carries at least one role that
 * reaches a staff surface. The per-surface checks below are the real matrix.
 * The `integration` role (ADR 36) holds none of the four, so every staff
 * chain refuses it here; its one page has its own chain.
 */
export const requireRole = t.middleware(({ ctx, next }) => {
  const actor = ctx.actor
  if (actor === null) throw new TRPCError({ code: 'UNAUTHORIZED' })
  refusePendingPasswordChange(actor)
  if (!STAFF_SURFACES.some((surface) => hasSurface(actor, surface))) throw new TRPCError({ code: 'FORBIDDEN' })
  return next()
})

/**
 * Whether an actor reaches a surface. The one matrix is `ROLE_ACCESS` in
 * `@fastehr/contracts` (ADR 31): this asks it, and so do the page guards and
 * the client's navigation, so no router or component compares role names.
 */
export function hasSurface(actor: { roles: readonly string[] }, surface: RoleSurface): boolean {
  return actor.roles.some((role) => roleHasAccess(role, surface))
}

/** The clerical half of the patient record (ADR 28): Patient Info, Billing, and creating a record. */
export function isClerical(actor: { roles: readonly string[] }): boolean {
  return hasSurface(actor, 'clerical')
}

/**
 * The authorization step of the chain, per surface. A refusal is FORBIDDEN,
 * and because the audit middleware sits outside this one, every refusal is
 * recorded (ADR 10).
 */
export function requireSurface(surface: RoleSurface) {
  return t.middleware(({ ctx, next }) => {
    if (ctx.actor === null) throw new TRPCError({ code: 'UNAUTHORIZED' })
    refusePendingPasswordChange(ctx.actor)
    if (!hasSurface(ctx.actor, surface)) throw new TRPCError({ code: 'FORBIDDEN' })
    return next({ ctx: { ...ctx, actor: ctx.actor } })
  })
}

/** Patient Info and Billing reads and writes, patient create, the intake queue: admin, front desk, medical director. */
export const requireClericalRole = requireSurface('clerical')

/** Staff accounts and the sampling run: admin and medical director. */
export const requireAdminRole = requireSurface('staff')

/** The note review queue and its sign-off (DIA-74, ADR 31): the medical director role alone. */
export const requireMedicalDirector = requireSurface('review')

/** The partner account's own integration page (ADR 36 as amended): the integration role alone. */
export const requireIntegration = requireSurface('integration')
