import { describe, expect, it } from 'vitest'
import { toPatient, toPatientSummary, type PatientRecordRow } from './patient.ts'

const row: PatientRecordRow = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: new Date('1815-12-10T00:00:00.000Z'),
  gender: null,
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
  programType: null,
  heightInches: null,
  historyOther: null,
  pcpName: null,
  pcpAddress: null,
  pcpPhone: null,
  status: 'active',
  lastVisitAt: null,
  creditCardNumber: null,
  creditCardExpMonth: null,
  creditCardExpYear: null,
  creditCardZip: null,
  legacyId: null,
  createdAt: new Date('2026-01-02T09:30:00.000Z'),
  updatedAt: new Date('2026-01-02T09:30:00.000Z'),
  medications: [],
}

const EXPECTED = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1815-12-10',
  gender: null,
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
  programType: null,
  heightInches: null,
  medications: [],
  historyOther: null,
  pcpName: null,
  pcpAddress: null,
  pcpPhone: null,
  status: 'active',
  lastVisitAt: null,
  creditCardNumber: null,
  creditCardExpMonth: null,
  creditCardExpYear: null,
  creditCardZip: null,
}

describe('toPatient', () => {
  it('maps a row to the contract shape', () => {
    expect(toPatient(row)).toEqual(EXPECTED)
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

  it('maps the medication list in the order it arrives, without its bookkeeping', () => {
    const mapped = toPatient({
      ...row,
      medications: [
        { id: 'm2', patientId: row.id, name: 'Lisinopril', dose: '10 mg', frequency: 'daily', position: 1 },
        { id: 'm1', patientId: row.id, name: 'Metformin', dose: null, frequency: null, position: 0 },
      ],
    })

    // The repository orders by position; the mapper keeps what it is given.
    expect(mapped.medications).toEqual([
      { name: 'Lisinopril', dose: '10 mg', frequency: 'daily' },
      { name: 'Metformin', dose: null, frequency: null },
    ])
    expect(mapped.medications[0]).not.toHaveProperty('position')
    expect(mapped.medications[0]).not.toHaveProperty('patientId')
  })

  it('carries the legacy history text through, read-only', () => {
    expect(toPatient({ ...row, historyOther: 'HTN. Prior phentermine.' }).historyOther).toBe('HTN. Prior phentermine.')
  })

  it('carries the last visit as an ISO instant, not a calendar day', () => {
    // Unlike the date of birth, this is a timestamp: the roster compares it
    // against "a year ago", so the time of day and the zone travel with it.
    const seen = new Date('2025-08-14T22:30:00.000Z')
    expect(toPatient({ ...row, lastVisitAt: seen }).lastVisitAt).toBe('2025-08-14T22:30:00.000Z')
    expect(toPatient(row).lastVisitAt).toBeNull()
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

describe('toPatientSummary', () => {
  it('maps a bare row to the roster shape — identity, office, last visit, phone', () => {
    const { medications: _m, ...bare } = row
    expect(toPatientSummary({ ...bare, phone: '9515550000', office: 'Sylmar' })).toEqual({
      id: row.id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1815-12-10',
      office: 'Sylmar',
      lastVisitAt: null,
      phone: '9515550000',
    })
  })

  it('never carries the clinical or card columns', () => {
    const { medications: _m, ...bare } = row
    const summary = toPatientSummary({ ...bare, creditCardNumber: '4111111111111111', historyOther: 'x' })
    expect(summary).not.toHaveProperty('creditCardNumber')
    expect(summary).not.toHaveProperty('historyOther')
  })
})
