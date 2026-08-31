import { describe, expect, it } from 'vitest'
import { describeValidationFailure } from './errors.ts'
import {
  createPatientInput,
  interpretPatientSearch,
  searchPatientsInput,
  sendPatientIntakeInput,
  updatePatientInput,
} from './patient.ts'

/**
 * These tests pin *issue codes*, not messages, because the codes are the wire
 * contract: `describeValidationFailure` strips everything else, and the client
 * copy table in the patient form keys on field + code. A code changing here
 * silently degrades a form message to its fallback — this file is where that
 * change becomes visible.
 */

// The full legacy-form field set, as a browser form would submit it.
const SUBMITTED = {
  firstName: '  Ada ',
  lastName: ' Lovelace ',
  gender: 'female',
  heightInches: '64.5',
  dateOfBirth: '1985-12-10',
  healthyWeight: '135',
  language: 'english',
  office: 'Sylmar',
  email: ' Ada@Example.COM ',
  addressStreet: ' 10 Analytical Way ',
  addressCity: 'Pasadena',
  addressState: 'ca',
  addressZip: '91101',
  phone: '(951) 555-0000',
  phoneFollowUpAllowed: true,
  referralSource: 'word of mouth',
  referredByPatientId: '',
  historyNotes: ' None pertinent. ',
  programType: '',
  creditCardNumber: '4111 1111 1111 1111',
  creditCardExpMonth: '12',
  creditCardExpYear: '2030',
  creditCardZip: '90210',
}

const VALID = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female',
  heightInches: 64.5,
  dateOfBirth: '1985-12-10',
  healthyWeight: 135,
  language: 'english',
  office: 'Sylmar',
  email: 'ada@example.com',
  addressStreet: '10 Analytical Way',
  addressCity: 'Pasadena',
  addressState: 'CA',
  addressZip: '91101',
  phone: '9515550000',
  phoneFollowUpAllowed: true,
  referralSource: 'word of mouth',
  referredByPatientId: undefined,
  historyNotes: 'None pertinent.',
  programType: undefined,
  creditCardNumber: '4111111111111111',
  creditCardExpMonth: '12',
  creditCardExpYear: '2030',
  creditCardZip: '90210',
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
    expect(createPatientInput.parse(SUBMITTED)).toEqual(VALID)
  })

  it('treats blank optional fields as absent, not invalid', () => {
    const parsed = createPatientInput.parse({
      ...SUBMITTED,
      email: '',
      healthyWeight: '  ',
      language: '',
      office: '',
      referralSource: '',
      historyNotes: '',
    })

    expect(parsed.email).toBeUndefined()
    expect(parsed.healthyWeight).toBeUndefined()
    expect(parsed.language).toBeUndefined()
    expect(parsed.office).toBeUndefined()
    expect(parsed.referralSource).toBeUndefined()
    expect(parsed.historyNotes).toBeUndefined()
  })

  it('rejects empty names as too_small', () => {
    expect(codesFor({ ...SUBMITTED, firstName: '   ', lastName: '' })).toEqual({
      firstName: ['too_small'],
      lastName: ['too_small'],
    })
  })

  it('requires the legacy-required fields: gender, height, address, phone', () => {
    expect(
      codesFor({
        ...SUBMITTED,
        gender: '',
        heightInches: '',
        addressStreet: '',
        addressCity: '',
        addressState: '',
        addressZip: '',
        phone: '',
      }),
    ).toEqual({
      gender: ['invalid_value'],
      heightInches: ['invalid_format'],
      addressStreet: ['too_small'],
      addressCity: ['too_small'],
      addressState: ['invalid_format'],
      addressZip: ['invalid_format'],
      phone: ['invalid_format'],
    })
  })

  it('applies the legacy measurement patterns to height and weight', () => {
    // Height is two integer digits (inches); weight two or three.
    expect(codesFor({ ...SUBMITTED, heightInches: '5' })).toEqual({ heightInches: ['invalid_format'] })
    expect(codesFor({ ...SUBMITTED, heightInches: '164' })).toEqual({ heightInches: ['invalid_format'] })
    expect(codesFor({ ...SUBMITTED, healthyWeight: '1350' })).toEqual({ healthyWeight: ['invalid_format'] })
    expect(createPatientInput.parse({ ...SUBMITTED, heightInches: '72', healthyWeight: '99.25' })).toMatchObject({
      heightInches: 72,
      healthyWeight: 99.25,
    })
  })

  it('uppercases the state code and applies the legacy zip pattern', () => {
    expect(createPatientInput.parse({ ...SUBMITTED, addressState: ' tx ' }).addressState).toBe('TX')
    expect(codesFor({ ...SUBMITTED, addressState: 'Texas' })).toEqual({ addressState: ['invalid_format'] })
    expect(codesFor({ ...SUBMITTED, addressZip: '12' })).toEqual({ addressZip: ['invalid_format'] })
    expect(createPatientInput.parse({ ...SUBMITTED, addressZip: '910' }).addressZip).toBe('910')
  })

  it('rejects an option outside the legacy pick-lists as invalid_value', () => {
    expect(codesFor({ ...SUBMITTED, office: 'Fresno' })).toEqual({ office: ['invalid_value'] })
    expect(codesFor({ ...SUBMITTED, referralSource: 'billboard' })).toEqual({ referralSource: ['invalid_value'] })
    expect(codesFor({ ...SUBMITTED, programType: 'Deluxe Program' })).toEqual({ programType: ['invalid_value'] })
    expect(codesFor({ ...SUBMITTED, language: 'french' })).toEqual({ language: ['invalid_value'] })
  })

  it('rejects a malformed date as invalid_format', () => {
    expect(codesFor({ ...SUBMITTED, dateOfBirth: '12/10/1985' })).toEqual({
      dateOfBirth: ['invalid_format'],
    })
  })

  it('rejects a future or implausible date of birth as custom', () => {
    expect(codesFor({ ...SUBMITTED, dateOfBirth: '2999-01-01' })).toEqual({
      dateOfBirth: ['custom'],
    })
    expect(codesFor({ ...SUBMITTED, dateOfBirth: '1899-12-31' })).toEqual({
      dateOfBirth: ['custom'],
    })
  })

  it('rejects a malformed email as invalid_format', () => {
    expect(codesFor({ ...SUBMITTED, email: 'not-an-email' })).toEqual({
      email: ['invalid_format'],
    })
  })

  it('rejects a phone that does not reduce to ten digits as invalid_format', () => {
    expect(codesFor({ ...SUBMITTED, phone: '555-0000' })).toEqual({
      phone: ['invalid_format'],
    })
  })
})

describe('updatePatientInput', () => {
  it('is the create input plus the record identity', () => {
    const parsed = updatePatientInput.parse({
      ...SUBMITTED,
      id: '3e1e0a92-06b6-4b1e-9f3a-6d4c05f9a111',
    })
    expect(parsed).toEqual({ ...VALID, id: '3e1e0a92-06b6-4b1e-9f3a-6d4c05f9a111' })
  })
})

describe('interpretPatientSearch', () => {
  it('reads digits with phone punctuation as a phone number', () => {
    expect(interpretPatientSearch('(951) 555-0000')).toEqual({
      ok: true,
      value: { kind: 'phone', phone: '9515550000' },
    })
    expect(interpretPatientSearch('+1 951.555.0000')).toEqual({
      ok: true,
      value: { kind: 'phone', phone: '9515550000' },
    })
  })

  it('rejects a partial phone number rather than guessing', () => {
    expect(interpretPatientSearch('951555')).toEqual({ ok: false, problem: 'phone_incomplete' })
  })

  it('refuses date-shaped input — dates belong to the separate field', () => {
    expect(interpretPatientSearch('1985-12-10')).toEqual({ ok: false, problem: 'date_in_search' })
    expect(interpretPatientSearch('12/10/1985')).toEqual({ ok: false, problem: 'date_in_search' })
  })

  it('reads one word as a name for either field', () => {
    expect(interpretPatientSearch(' Lovelace ')).toEqual({
      ok: true,
      value: { kind: 'name', name: 'Lovelace' },
    })
  })

  it('reads "First Last" and "Last, First" as a full name', () => {
    expect(interpretPatientSearch('Ada Lovelace')).toEqual({
      ok: true,
      value: { kind: 'fullName', firstName: 'Ada', lastName: 'Lovelace' },
    })
    expect(interpretPatientSearch('Lovelace, Ada')).toEqual({
      ok: true,
      value: { kind: 'fullName', firstName: 'Ada', lastName: 'Lovelace' },
    })
  })

  it('applies the legacy two-character minimum to every name part', () => {
    expect(interpretPatientSearch('L')).toEqual({ ok: false, problem: 'name_too_short' })
    expect(interpretPatientSearch('Lovelace, A')).toEqual({ ok: false, problem: 'name_too_short' })
  })
})

describe('sendPatientIntakeInput', () => {
  it('normalizes the phone and treats a blank language as absent', () => {
    expect(
      sendPatientIntakeInput.parse({
        firstName: ' Ada ',
        lastName: 'Lovelace',
        phone: '(951) 555-0000',
        language: '',
      }),
    ).toEqual({ firstName: 'Ada', lastName: 'Lovelace', phone: '9515550000', language: undefined })
  })

  it('requires names and a complete phone number', () => {
    expect(
      sendPatientIntakeInput.safeParse({ firstName: '', lastName: 'L', phone: '951555' }).success,
    ).toBe(false)
  })
})

describe('searchPatientsInput', () => {
  it('parses the query into its interpretation', () => {
    expect(searchPatientsInput.parse({ query: '(951) 555-0000', dateOfBirth: '' })).toEqual({
      query: { kind: 'phone', phone: '9515550000' },
      dateOfBirth: undefined,
    })
  })

  it('accepts a date-of-birth filter alone, or combined with a query', () => {
    expect(searchPatientsInput.parse({ query: '', dateOfBirth: '1985-12-10' })).toEqual({
      query: undefined,
      dateOfBirth: '1985-12-10',
    })
    expect(searchPatientsInput.parse({ query: 'Lovelace', dateOfBirth: '1985-12-10' })).toEqual({
      query: { kind: 'name', name: 'Lovelace' },
      dateOfBirth: '1985-12-10',
    })
  })

  it('accepts the status filter alone, and combined with a query', () => {
    expect(searchPatientsInput.parse({ query: '', dateOfBirth: '', status: 'inactive' })).toEqual({
      query: undefined,
      dateOfBirth: undefined,
      status: 'inactive',
    })
    expect(searchPatientsInput.parse({ query: 'Lovelace', status: 'active' })).toEqual({
      query: { kind: 'name', name: 'Lovelace' },
      dateOfBirth: undefined,
      status: 'active',
    })
  })

  it('refuses an entirely empty search', () => {
    expect(searchPatientsInput.safeParse({ query: '', dateOfBirth: '', status: '' }).success).toBe(false)
  })

  it('fails an uninterpretable query with issue code custom, no message of ours', () => {
    const result = searchPatientsInput.safeParse({ query: '951555' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe('custom')
    }
  })
})
