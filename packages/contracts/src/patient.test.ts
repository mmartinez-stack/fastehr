import { describe, expect, it } from 'vitest'
import { describeValidationFailure } from './errors.ts'
import { createPatientInput } from './patient.ts'

/**
 * These tests pin *issue codes*, not messages, because the codes are the wire
 * contract: `describeValidationFailure` strips everything else, and the client
 * copy table in `patients/new` keys on field + code. A code changing here
 * silently degrades a form message to its fallback — this file is where that
 * change becomes visible.
 */

const VALID = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1985-12-10',
  email: 'ada@example.com',
  phone: '9515550000',
}

function codesFor(input: unknown): Record<string, string[]> {
  const result = createPatientInput.safeParse(input)
  if (result.success) throw new Error('expected the input to be rejected')
  const failure = describeValidationFailure(result.error)
  if (failure === null) throw new Error('expected a Zod error to be described')
  return failure.fieldErrors
}

describe('createPatientInput', () => {
  it('normalizes what a person actually types', () => {
    const parsed = createPatientInput.parse({
      firstName: '  Ada ',
      lastName: ' Lovelace ',
      dateOfBirth: '1985-12-10',
      email: ' Ada@Example.COM ',
      phone: '(951) 555-0000',
    })

    expect(parsed).toEqual(VALID)
  })

  it('treats blank optional fields as absent, not invalid', () => {
    const parsed = createPatientInput.parse({ ...VALID, email: '', phone: '  ' })

    expect(parsed.email).toBeUndefined()
    expect(parsed.phone).toBeUndefined()
  })

  it('rejects empty names as too_small', () => {
    expect(codesFor({ ...VALID, firstName: '   ', lastName: '' })).toEqual({
      firstName: ['too_small'],
      lastName: ['too_small'],
    })
  })

  it('rejects a malformed date as invalid_format', () => {
    expect(codesFor({ ...VALID, dateOfBirth: '12/10/1985' })).toEqual({
      dateOfBirth: ['invalid_format'],
    })
  })

  it('rejects a future or implausible date of birth as custom', () => {
    expect(codesFor({ ...VALID, dateOfBirth: '2999-01-01' })).toEqual({
      dateOfBirth: ['custom'],
    })
    expect(codesFor({ ...VALID, dateOfBirth: '1899-12-31' })).toEqual({
      dateOfBirth: ['custom'],
    })
  })

  it('rejects a malformed email as invalid_format', () => {
    expect(codesFor({ ...VALID, email: 'not-an-email' })).toEqual({
      email: ['invalid_format'],
    })
  })

  it('rejects a phone that does not reduce to ten digits as invalid_format', () => {
    expect(codesFor({ ...VALID, phone: '555-0000' })).toEqual({
      phone: ['invalid_format'],
    })
  })
})
