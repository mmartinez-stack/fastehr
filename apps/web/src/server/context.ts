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
