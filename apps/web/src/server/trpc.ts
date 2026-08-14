import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { db, type Db } from '@fastehr/db'
import { recordAuditEvent, type AuditEvent } from './audit.ts'

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

/**
 * `transformer` is not optional here, and the reason is the same one behind
 * decision 3.
 *
 * Plain JSON has no `Date`. Without a transformer a procedure typed as
 * returning one hands the client a string while the inferred type still says
 * `Date` — the value type-checks perfectly at every call site and is wrong at
 * runtime. That is precisely the `Decimal` hazard decision 3 describes, moved
 * from the ORM boundary to the transport boundary, and in this domain it lands
 * on dates of birth, appointment times, and dose timestamps.
 *
 * Contracts currently keep dates as ISO strings (`z.iso.date()`), so nothing
 * relies on this today — it is the guarantee that the first `z.date()` or bare
 * `new Date()` in a procedure result behaves the way its type promises, rather
 * than becoming a bug that only shows up as an invalid-date render.
 *
 * **Any client must configure the same transformer**, and in tRPC v11 it goes
 * on the link (`httpBatchLink` / `httpBatchStreamLink`), not the client root.
 * A caller built with `createCaller` — an Electron main process, a test —
 * never serialises at all and is unaffected.
 */
const t = initTRPC.context<Context>().create({ transformer: superjson })

export const router = t.router
export const publicProcedure = t.procedure

/**
 * 1/3 — PHI access audit. Every procedure touching protected health information
 * must leave a trail, and — this is the part that is easy to get wrong — so
 * must every procedure that *refuses* to.
 *
 * It sits outermost so it observes the outcome of the two middlewares below it.
 * `next()` resolves rather than throws when something downstream fails, so a
 * rejected call still produces a record, with `ctx.actor` as whatever the
 * request actually presented — `anonymous` for an unauthenticated attempt.
 *
 * Placeholder only in its sink: see ./audit.ts.
 */
const auditPhiAccess = t.middleware(async ({ ctx, path, type, next }) => {
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

/**
 * 2/3 — Authentication. Narrows `actor` to non-null for everything downstream.
 * Placeholder: real session verification lands with the auth ticket.
 */
const requireAuth = t.middleware(({ ctx, next }) => {
  if (ctx.actor === null) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, actor: ctx.actor } })
})

/**
 * 3/3 — Role check (RBAC). Placeholder: currently asserts only that the actor
 * carries at least one role. Real permission matrix lands with the RBAC ticket.
 */
const requireRole = t.middleware(({ ctx, next }) => {
  if (ctx.actor === null) throw new TRPCError({ code: 'UNAUTHORIZED' })
  if (ctx.actor.roles.length === 0) throw new TRPCError({ code: 'FORBIDDEN' })
  return next()
})

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
export const protectedProcedure = t.procedure
  .use(auditPhiAccess)
  .use(requireAuth)
  .use(requireRole)
