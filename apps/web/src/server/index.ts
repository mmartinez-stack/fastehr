/**
 * The server layer's public surface.
 *
 * Everything outside `src/server/**` imports from here, never from a file
 * inside it — so the internal shape below can change without touching the route
 * handler, the client type surface, or a future RSC caller.
 *
 *   context.ts        Actor, Context, createContext — built by the host
 *   trpc.ts           the tRPC instance: transformer, error shape, primitives
 *   procedures.ts     public / protected procedure composition
 *   middleware/       auth, RBAC, PHI audit
 *   auth.ts           the Better Auth instance; session → Actor resolution
 *   guards.ts         requireSession / requireRole — fail-closed entry guards
 *   routers/          root.ts, plus one file per domain as they arrive
 *   audit-log.ts      the audit event and its sink
 */
export { appRouter } from './routers/root.ts'
export type { AppRouter } from './routers/root.ts'
export { createContext } from './context.ts'
export type { Actor, Context } from './context.ts'
export { adminProcedure, protectedProcedure, publicProcedure } from './procedures.ts'
export { getAuth, actorFromHeaders } from './auth.ts'
export { requireSession, requireRole, GuardDenied, type GuardDenialCode } from './guards.ts'
export { router } from './trpc.ts'
