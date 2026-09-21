import { describe, expect, it } from 'vitest'
import { describeValidationFailure } from '../errors.ts'
import {
  partnerPatientCandidateSchema,
  partnerPatientLookupInput,
  partnerPatientLookupOutput,
  partnerVerifyPatientInput,
} from './patients.ts'

function failure(schema: { safeParse: (value: unknown) => { success: boolean; error?: unknown } }, value: unknown) {
  const result = schema.safeParse(value)
  expect(result.success).toBe(false)
  return describeValidationFailure(result.error)
}

describe('partner patient lookup input', () => {
  it('accepts the patient id alone', () => {
    const parsed = partnerPatientLookupInput.parse({ patientId: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81' })
    expect(parsed).toEqual({ patientId: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81' })
  })

  it('accepts date of birth with a phone, normalising the phone', () => {
    expect(partnerPatientLookupInput.parse({ dateOfBirth: '1985-12-10', phone: '+1 (951) 555-0000' })).toEqual({
      dateOfBirth: '1985-12-10',
      phone: '9515550000',
    })
  })

  it('accepts date of birth with a last name, trimmed, and an optional first name', () => {
    expect(partnerPatientLookupInput.parse({ dateOfBirth: '1985-12-10', lastName: ' Lovelace ', firstName: '' })).toEqual({
      dateOfBirth: '1985-12-10',
      lastName: 'Lovelace',
    })
  })

  it('refuses a name-only or phone-only lookup: the date of birth is required', () => {
    expect(failure(partnerPatientLookupInput, { lastName: 'Lovelace' })).toEqual({
      fieldErrors: { dateOfBirth: ['custom'] },
      formErrors: [],
    })
    expect(failure(partnerPatientLookupInput, { phone: '9515550000' })).toEqual({
      fieldErrors: { dateOfBirth: ['custom'] },
      formErrors: [],
    })
  })

  it('refuses a date of birth alone', () => {
    expect(failure(partnerPatientLookupInput, { dateOfBirth: '1985-12-10' })).toEqual({
      fieldErrors: { phone: ['custom'] },
      formErrors: [],
    })
  })

  it('refuses a first name without a last name', () => {
    expect(failure(partnerPatientLookupInput, { dateOfBirth: '1985-12-10', phone: '9515550000', firstName: 'Ada' })).toEqual({
      fieldErrors: { lastName: ['custom'] },
      formErrors: [],
    })
  })

  it('refuses other identifiers alongside the patient id', () => {
    expect(
      failure(partnerPatientLookupInput, { patientId: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81', phone: '9515550000' }),
    ).toEqual({ fieldErrors: { phone: ['custom'] }, formErrors: [] })
  })

  it('refuses fields the contract does not describe', () => {
    expect(failure(partnerPatientLookupInput, { dateOfBirth: '1985-12-10', phone: '9515550000', email: 'a@b.c' })).toEqual({
      fieldErrors: {},
      formErrors: ['unrecognized_keys'],
    })
  })

  it('never puts a value in the failure', () => {
    const result = partnerPatientLookupInput.safeParse({ dateOfBirth: '1985-12-10', phone: '12' })
    expect(result.success).toBe(false)
    expect(JSON.stringify(describeValidationFailure(result.error))).not.toContain('1985')
  })
})

describe('partner patient lookup output', () => {
  it('carries no date of birth and strips anything extra', () => {
    expect(Object.keys(partnerPatientCandidateSchema.shape)).toEqual([
      'patientId',
      'firstName',
      'lastName',
      'phoneLast4',
      'locationId',
    ])
    expect(
      partnerPatientLookupOutput.safeParse({
        candidates: [
          {
            patientId: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
            firstName: 'Ada',
            lastName: 'Lovelace',
            phoneLast4: '0000',
            locationId: 'sylmar',
            dateOfBirth: '1985-12-10',
          },
        ],
        truncated: false,
      }).success,
    ).toBe(false)
  })
})

describe('partner verify input', () => {
  it('requires both factors', () => {
    expect(failure(partnerVerifyPatientInput, { dateOfBirth: '1985-12-10' })).toEqual({
      fieldErrors: { phone: ['invalid_type'] },
      formErrors: [],
    })
  })
})
