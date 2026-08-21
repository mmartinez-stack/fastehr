import { TRPCError } from '@trpc/server'
import { t } from '../trpc.ts'

/**
 * Authentication. Narrows `actor` to non-null for everything downstream.
 * Placeholder: real session verification lands with the auth ticket.
 */
export const requireAuth = t.middleware(({ ctx, next }) => {
  if (ctx.actor === null) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, actor: ctx.actor } })
})

/**
 * Role check (RBAC). Placeholder: currently asserts only that the actor carries
 * at least one role. Real permission matrix lands with the RBAC ticket.
 */
export const requireRole = t.middleware(({ ctx, next }) => {
  if (ctx.actor === null) throw new TRPCError({ code: 'UNAUTHORIZED' })
  if (ctx.actor.roles.length === 0) throw new TRPCError({ code: 'FORBIDDEN' })
  return next()
})

/**
 * Admin gate for the account-administration procedures. The single-role
 * vocabulary from the auth foundation, applied inside the chain so the audit
 * middleware records every refusal (ADR 10). The full per-role visibility
 * matrix is the RBAC ticket; this exists now because user administration
 * cannot ship without it.
 */
export const requireAdminRole = t.middleware(({ ctx, next }) => {
  if (ctx.actor === null) throw new TRPCError({ code: 'UNAUTHORIZED' })
  if (!ctx.actor.roles.includes('admin')) throw new TRPCError({ code: 'FORBIDDEN' })
  return next({ ctx: { ...ctx, actor: ctx.actor } })
})
