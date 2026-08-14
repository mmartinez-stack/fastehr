import { initTRPC, TRPCError } from '@trpc/server'
import { db, type Db } from '@fastehr/db'

/**
 * tRPC initialisation, context shape, and the middleware chain.
 *
 * Nothing in `src/server/**` may import from `next/*`. Request state reaches
 * this layer only as arguments to `createContext`, which the route handler
 * builds. That keeps the router a plain function of its context, so it can be
 * mounted in a standalone process later (an Electron main process, a worker)
 * without unpicking Next APIs. Enforced by `no-restricted-imports` in
 * `apps/web/eslint.config.mjs`.
 */

/** Placeholder actor. Real session shape arrives with the auth ticket. */
export interface Actor {
  id: string
  roles: readonly string[]
}

export interface Context {
  actor: Actor | null
  /**
   * Repositories, not a Prisma client. `@fastehr/db` exposes no persistence
   * types (README decision 3), so a procedure can only ask for contract-shaped
   * data — there is no `ctx.prisma` to reach past it with.
   */
  db: Db
}

/**
 * Request-scoped context factory. The caller — the route handler, or whatever
 * host mounts this router — is responsible for resolving the actor from its own
 * transport and passing it in.
 */
export function createContext({ actor }: { actor: Actor | null }): Context {
  return { actor, db }
}

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure

/**
 * 1/3 — Authentication. Narrows `actor` to non-null for everything downstream.
 * Placeholder: real session verification lands with the auth ticket.
 */
const requireAuth = t.middleware(({ ctx, next }) => {
  if (ctx.actor === null) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, actor: ctx.actor } })
})

/**
 * 2/3 — Role check (RBAC). Placeholder: currently asserts only that the actor
 * carries at least one role. Real permission matrix lands with the RBAC ticket.
 */
const requireRole = t.middleware(({ ctx, next }) => {
  if (ctx.actor === null) throw new TRPCError({ code: 'UNAUTHORIZED' })
  if (ctx.actor.roles.length === 0) throw new TRPCError({ code: 'FORBIDDEN' })
  return next()
})

/**
 * 3/3 — PHI access audit. Every procedure touching protected health information
 * must leave a durable trail. Placeholder: writes to stdout instead of the audit
 * table, which lands with the audit ticket.
 */
const auditPhiAccess = t.middleware(async ({ ctx, path, type, next }) => {
  const startedAt = Date.now()
  const result = await next()
  console.info('[phi-audit]', {
    actorId: ctx.actor?.id ?? 'anonymous',
    path,
    type,
    ok: result.ok,
    durationMs: Date.now() - startedAt,
  })
  return result
})

/**
 * Procedures that read or write PHI. The chain order is deliberate:
 * authenticate, then authorize, then audit — so the audit record is written
 * with a known actor and only for calls that passed authorization.
 */
export const protectedProcedure = t.procedure
  .use(requireAuth)
  .use(requireRole)
  .use(auditPhiAccess)
