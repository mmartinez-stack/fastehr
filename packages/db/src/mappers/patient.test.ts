import { describe, expect, it } from 'vitest'
import type { Patient as PatientRow } from '../generated/client/client.ts'
import { toPatient } from './patient.ts'

const row: PatientRow = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: new Date('1815-12-10T00:00:00.000Z'),
  gender: null,
  heightInches: null,
  healthyWeight: null,
  language: null,
  office: null,
  email: null,
  phone: null,
  phoneFollowUpAllowed: true,
  addressStreet: null,
  addressCity: null,
  addressState: null,
  addressZip: null,
  referralSource: null,
  referredByPatientId: null,
  historyNotes: null,
  programType: null,
  status: 'active',
  creditCardNumber: null,
  creditCardExpMonth: null,
  creditCardExpYear: null,
  creditCardZip: null,
  legacyId: null,
  createdAt: new Date('2026-01-02T09:30:00.000Z'),
  updatedAt: new Date('2026-01-02T09:30:00.000Z'),
}

describe('toPatient', () => {
  it('maps a row to the contract shape', () => {
    expect(toPatient(row)).toEqual({
      id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1815-12-10',
      gender: null,
      heightInches: null,
      healthyWeight: null,
      language: null,
      office: null,
      email: null,
      phone: null,
      phoneFollowUpAllowed: true,
      addressStreet: null,
      addressCity: null,
      addressState: null,
      addressZip: null,
      referralSource: null,
      referredByPatientId: null,
      historyNotes: null,
      programType: null,
      status: 'active',
      creditCardNumber: null,
      creditCardExpMonth: null,
      creditCardExpYear: null,
      creditCardZip: null,
    })
  })

  it('passes stored demographics through', () => {
    const mapped = toPatient({
      ...row,
      email: 'ada@example.com',
      phone: '9515550000',
      gender: 'female',
      heightInches: 64.5,
      language: 'english',
      office: 'Sylmar',
      status: 'inactive',
    })

    expect(mapped.email).toBe('ada@example.com')
    expect(mapped.phone).toBe('9515550000')
    expect(mapped.gender).toBe('female')
    expect(mapped.heightInches).toBe(64.5)
    expect(mapped.language).toBe('english')
    expect(mapped.office).toBe('Sylmar')
    expect(mapped.status).toBe('inactive')
  })

  it('keeps an imported vocabulary value the pick-lists no longer offer', () => {
    // Entity-side `office` is a plain string on purpose — a historical office
    // must read back rather than fail the parse (see contracts/patient.ts).
    expect(toPatient({ ...row, office: 'Van Nuys (closed)' }).office).toBe('Van Nuys (closed)')
  })

  it('drops bookkeeping columns the contract does not declare', () => {
    expect(toPatient(row)).not.toHaveProperty('createdAt')
    expect(toPatient(row)).not.toHaveProperty('updatedAt')
    expect(toPatient(row)).not.toHaveProperty('legacyId')
  })

  it('reads the date of birth in UTC, not local time', () => {
    // The regression this guards: a local-time conversion shifts the calendar
    // day for anyone west of UTC, turning a date of birth into the day before.
    // Asserting through a fixed western offset rather than the runner's own
    // timezone keeps the test meaningful wherever it runs.
    const shifted = new Date('1815-12-10T00:00:00.000Z')
    expect(shifted.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })).toBe(
      '1815-12-09',
    )
    expect(toPatient(row).dateOfBirth).toBe('1815-12-10')
  })

  it('rejects a row that violates the contract instead of passing it through', () => {
    expect(() => toPatient({ ...row, id: 'not-a-uuid' })).toThrow()
    expect(() => toPatient({ ...row, firstName: '' })).toThrow()
  })
})
