import { db, type Db } from '@fastehr/db'

/**
 * Request-scoped context: who is asking, and what they can ask of.
 *
 * Kept apart from the tRPC instance because the host builds this — the route
 * handler today, an RSC caller or a worker tomorrow — while the instance is
 * internal machinery. The separation is also what keeps the import graph
 * acyclic once middlewares live in their own files: everything can depend on
 * the context type without depending on `t`.
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
   * types (ADR 3), so a procedure can only ask for contract-shaped
   * data — there is no `ctx.prisma` to reach past it with.
   */
  db: Db
}

/**
 * Request-scoped context factory. The caller — the route handler, or whatever
 * host mounts this router — is responsible for resolving the actor from its own
 * transport and passing it in.
 *
 * `db` defaults to the shared repositories and exists as a parameter for two
 * reasons. A test can pass fakes and exercise a procedure with no database, no
 * Prisma, and no environment — which is what makes the middleware chain and the
 * procedures above it cheap enough to test properly. And a caller that needs
 * several repositories inside one transaction can pass a transaction-scoped
 * `Db` built by `createDb`, rather than the router reaching for a client of its
 * own.
 */
export function createContext({
  actor,
  db: repositories = db,
}: {
  actor: Actor | null
  db?: Db
}): Context {
  return { actor, db: repositories }
}
