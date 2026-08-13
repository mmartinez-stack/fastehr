import type { Patient, PatientId } from '@fastehr/contracts'
import type { PatientRepository } from '@fastehr/core'

/**
 * Placeholder implementation of the `core` port. Replaced by the generated ORM
 * client in the persistence ticket; useful as a test double either way.
 */
export function createInMemoryPatientRepository(seed: readonly Patient[] = []): PatientRepository {
  const byId = new Map<PatientId, Patient>(seed.map((patient) => [patient.id, patient]))

  return {
    async findById(id: PatientId): Promise<Patient | null> {
      return byId.get(id) ?? null
    },
  }
}
