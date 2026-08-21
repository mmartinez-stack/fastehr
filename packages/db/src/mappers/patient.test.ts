import { describe, expect, it } from 'vitest'
import { toPatient } from './patient.ts'

const row = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: new Date('1815-12-10T00:00:00.000Z'),
  email: null,
  phone: null,
  createdAt: new Date('2026-01-02T09:30:00.000Z'),
}

describe('toPatient', () => {
  it('maps a row to the contract shape', () => {
    expect(toPatient(row)).toEqual({
      id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1815-12-10',
      email: null,
      phone: null,
    })
  })

  it('passes stored contact details through', () => {
    const mapped = toPatient({ ...row, email: 'ada@example.com', phone: '9515550000' })

    expect(mapped.email).toBe('ada@example.com')
    expect(mapped.phone).toBe('9515550000')
  })

  it('drops columns the contract does not declare', () => {
    expect(toPatient(row)).not.toHaveProperty('createdAt')
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
