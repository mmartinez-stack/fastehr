import { prisma, type PrismaClient } from './client.ts'
import { createPatientRepository, type PatientRepository } from './repositories/patient.ts'

/**
 * The public surface of `@fastehr/db`.
 *
 * It is deliberately small: a `Db` of repositories, and the factory that builds
 * one. No `PrismaClient`, no generated model types, no `Prisma` namespace —
 * README decision 3 says persistence shapes never cross into domain code, and
 * this file is where that stops being a claim. Everything above this package
 * speaks `@fastehr/contracts`.
 *
 * The enforcement is structural, not editorial. `package.json#exports` has one
 * entry pointing here, so `@fastehr/db/src/client.ts` does not resolve for any
 * consumer — the same shape of guarantee as decision 2's manifest omission, and
 * for the same reason: a rule that can be worked around eventually is.
 */
export interface Db {
  patients: PatientRepository
}

/**
 * Builds a `Db` over a Prisma client, defaulting to the package singleton.
 *
 * The parameter exists so a caller can supply a transaction-scoped client — a
 * test wrapping each case in a rolled-back transaction, or a future procedure
 * that needs several repositories inside one `$transaction`. It is typed as the
 * internal client on purpose: a consumer outside this package cannot name that
 * type, so in practice the argument is only reachable from inside `db` itself.
 */
export function createDb(client: PrismaClient = prisma): Db {
  return {
    patients: createPatientRepository(client),
  }
}

/** Default `Db`, over the shared connection pool. */
export const db: Db = createDb()

export type { PatientRepository }
