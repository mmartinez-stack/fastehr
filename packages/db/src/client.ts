import { PrismaPg } from '@prisma/adapter-pg'
import { requireDatabaseUrl } from './env.ts'
import { PrismaClient } from './generated/client/client.ts'

/**
 * Prisma client construction. **Internal to this package.**
 *
 * Nothing here is re-exported from `src/index.ts`, and the package's `exports`
 * map has a single entry (`.` → `./src/index.ts`), so no consumer can reach
 * this module or the generated client at all. That is what keeps ADR 3 true by
 * construction rather than by convention: persistence types cannot
 * cross the package boundary because there is no specifier that resolves to
 * them.
 *
 * Prisma 7 has no Rust query engine and no built-in connection management: a
 * driver adapter is mandatory, and it — not the schema — owns the connection
 * string. `datasource db` in schema.prisma therefore carries only `provider`.
 *
 * Construction is **lazy**, on first call rather than at import. Importing this
 * package must not require a database URL: `next build` and CI both import it
 * transitively through the tRPC route without ever running a query. See
 * ./env.ts for the trade that follows.
 */

/**
 * One client per process. `client` is the memo that guarantees it; the global
 * exists only so dev survives HMR, which would otherwise open a fresh
 * connection pool on every reload.
 */
let client: PrismaClient | undefined

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function getPrismaClient(): PrismaClient {
  if (client !== undefined) return client

  client =
    globalForPrisma.prisma ??
    new PrismaClient({ adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }) })

  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client

  return client
}

/** The client type, for repository factories inside this package only. */
export type { PrismaClient }
