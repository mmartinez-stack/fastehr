import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/client/client.ts'

export { PrismaClient }
export type * from './generated/client/client.ts'

/**
 * Prisma 7 has no Rust query engine and no built-in connection management: a
 * driver adapter is mandatory, and it — not the schema — owns the connection
 * string. `datasource db` in schema.prisma therefore carries only `provider`,
 * and DATABASE_URL is read here.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

/**
 * Single Prisma instance. In dev, Next's module reloading would otherwise open
 * a new connection pool on every HMR pass.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
