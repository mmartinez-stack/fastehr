import type { Patient, PatientId } from '@fastehr/contracts'
import type { PatientRepository } from '../ports/patient-repository.js'

export class PatientNotFoundError extends Error {
  constructor(readonly patientId: PatientId) {
    super(`Patient ${patientId} not found`)
    this.name = 'PatientNotFoundError'
  }
}

export interface GetPatientDeps {
  patients: PatientRepository
}

/**
 * Seed use case. Shows the shape every later use case follows: dependencies in
 * via ports, no framework or driver imports.
 */
export function getPatient({ patients }: GetPatientDeps) {
  return async function run(id: PatientId): Promise<Patient> {
    const patient = await patients.findById(id)
    if (patient === null) throw new PatientNotFoundError(id)
    return patient
  }
}
