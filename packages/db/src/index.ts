import { getPrismaClient, type PrismaClient } from './client.ts'
import { createPatientRepository, type PatientRepository } from './repositories/patient.ts'

/**
 * The public surface of `@fastehr/db`.
 *
 * It is deliberately small: a `Db` of repositories, and the factory that builds
 * one. No `PrismaClient`, no generated model types, no `Prisma` namespace —
 * ADR 3 says persistence shapes never cross into domain code, and this file is
 * where that stops being a claim. Everything above this package
 * speaks `@fastehr/contracts`.
 *
 * The enforcement is structural, not editorial. `package.json#exports` has one
 * entry pointing here, so `@fastehr/db/src/client.ts` does not resolve for any
 * consumer — the same shape of guarantee as ADR 2's manifest omission, and
 * for the same reason: a rule that can be worked around eventually is.
 */
export interface Db {
  patients: PatientRepository
}

/**
 * Builds a `Db`, defaulting to this package's lazily-constructed client.
 *
 * The parameter is a *getter*, which keeps `createDb()` free of I/O and of any
 * configuration requirement — important because `db` below is constructed at
 * import, in a build that has no DATABASE_URL. It also lets a caller supply a
 * transaction-scoped client: a test wrapping each case in a rolled-back
 * transaction, or a future procedure needing several repositories inside one
 * `$transaction`. It is typed as the internal client on purpose: a consumer
 * outside this package cannot name that type, so in practice the argument is
 * only reachable from inside `db` itself.
 */
export function createDb(getClient: () => PrismaClient = getPrismaClient): Db {
  return {
    patients: createPatientRepository(getClient),
  }
}

/** Default `Db`. Constructing it opens no connection and reads no config. */
export const db: Db = createDb()

export { createAuthAdapter } from './auth-adapter.ts'
export type { PatientRepository }
