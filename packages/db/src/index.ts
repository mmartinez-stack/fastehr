import { PrismaClient } from './generated/client/index.js'

export { PrismaClient }
export type * from './generated/client/index.js'

/**
 * Single Prisma instance. In dev, Next's module reloading would otherwise open
 * a new connection pool on every HMR pass.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
