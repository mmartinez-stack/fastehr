import type { Patient, PatientId } from '@fastehr/contracts'

/**
 * Port. `core` declares the persistence it needs; `packages/db` supplies an
 * implementation. Nothing in `core` may import the ORM directly — see
 * `@fastehr/config/eslint/core-boundaries`.
 */
export interface PatientRepository {
  findById(id: PatientId): Promise<Patient | null>
}
