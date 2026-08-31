import { prismaAdapter } from 'better-auth/adapters/prisma'
import { getPrismaClient, type PrismaClient } from './client.ts'

/**
 * The Better Auth storage binding. **The only sanctioned second consumer of
 * the internal Prisma client.**
 *
 * Exported from src/index.ts as an opaque factory: the returned value carries
 * no Prisma types, so ADR 3 holds — a consumer still cannot name
 * `PrismaClient`, `Prisma.*`, or any generated model. ADR 3's guarantee was
 * never "no auth library may use Prisma"; it was that *persistence shapes
 * never reach domain code*, and that is untouched.
 *
 * The client is handed over as a `Proxy` that defers `getPrismaClient()` to
 * first property access, because the adapter only touches the client inside
 * its query operations (verified against the installed
 * `@better-auth/prisma-adapter@1.7.1` — every `db[model]` access sits inside
 * an operation body). That preserves the property `client.ts` protects:
 * `next build` and CI construct the auth instance without a `DATABASE_URL`,
 * and a missing URL still fails loudly at the first real query, naming
 * itself.
 */
export function createAuthAdapter(): ReturnType<typeof prismaAdapter> {
  const lazyClient = new Proxy({} as Record<PropertyKey, unknown>, {
    get(_target, property) {
      const client = getPrismaClient() as unknown as Record<PropertyKey, unknown>
      const value = client[property]
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value
    },
  }) as unknown as PrismaClient

  return prismaAdapter(lazyClient, { provider: 'postgresql' })
}
