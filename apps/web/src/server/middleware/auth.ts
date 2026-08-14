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
