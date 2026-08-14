import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/client/client.ts'

/**
 * Prisma client construction. **Internal to this package.**
 *
 * Nothing here is re-exported from `src/index.ts`, and the package's `exports`
 * map has a single entry (`.` → `./src/index.ts`), so no consumer can reach
 * this module or the generated client at all. That is what keeps decision 3
 * true by construction rather than by convention: persistence types cannot
 * cross the package boundary because there is no specifier that resolves to
 * them.
 *
 * Prisma 7 has no Rust query engine and no built-in connection management: a
 * driver adapter is mandatory, and it — not the schema — owns the connection
 * string. `datasource db` in schema.prisma therefore carries only `provider`.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

/**
 * Single Prisma instance. In dev, Next's module reloading would otherwise open
 * a new connection pool on every HMR pass.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/** The client type, for repository factories inside this package only. */
export type { PrismaClient }
