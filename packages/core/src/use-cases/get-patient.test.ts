import { describe, expect, it } from 'vitest'
import type { Patient, PatientId } from '@fastehr/contracts'
import type { PatientRepository } from '../ports/patient-repository.js'
import { getPatient, PatientNotFoundError } from './get-patient.js'

const id = '3f1c9a52-5d1e-4a3b-9c7f-2e8b6d0a1f44' as PatientId

const patient: Patient = {
  id,
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1815-12-10',
}

function repo(result: Patient | null): PatientRepository {
  return { findById: async () => result }
}

describe('getPatient', () => {
  it('returns the patient the repository resolves', async () => {
    await expect(getPatient({ patients: repo(patient) })(id)).resolves.toEqual(patient)
  })

  it('throws PatientNotFoundError when the repository has no match', async () => {
    await expect(getPatient({ patients: repo(null) })(id)).rejects.toThrow(PatientNotFoundError)
  })
})
