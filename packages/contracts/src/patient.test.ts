import { describe, expect, it } from 'vitest'
import { describeValidationFailure } from './errors.ts'
import {
  createPatientInput,
  interpretPatientSearch,
  patientClinicalInput,
  patientDemographicsInput,
  patientSchema,
  searchPatientsInput,
  sendPatientIntakeInput,
  suggestPatientsInput,
  updatePatientBillingInput,
  updatePatientClinicalInput,
  updatePatientDemographicsInput,
} from './patient.ts'

/**
 * These tests pin *issue codes*, not messages, because the codes are the wire
 * contract: `describeValidationFailure` strips everything else, and the client
 * copy table in the patient form keys on field + code. A code changing here
 * silently degrades a form message to its fallback — this file is where that
 * change becomes visible.
 */

// The full sectioned form, as a browser form would submit it.
const SUBMITTED = {
  firstName: '  Ada ',
  lastName: ' Lovelace ',
  gender: 'female',
  dateOfBirth: '1985-12-10',
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
  programType: '',
  heightFeet: '5',
  heightInchesPart: '4.5',
  medications: [
    { name: ' Metformin ', dose: '500 mg', frequency: 'twice daily' },
    // The blank line the form adds to type into — not a row.
    { name: '', dose: '', frequency: '' },
  ],
  pcpName: 'Dr. Jones',
  pcpAddress: '',
  pcpPhone: '951-555-0001',
  creditCardNumber: '4111 1111 1111 1111',
  creditCardExpMonth: '12',
  creditCardExpYear: '2030',
  creditCardZip: '90210',
}

const VALID = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female',
  dateOfBirth: '1985-12-10',
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
  programType: undefined,
  heightInches: 64.5,
  medications: [{ name: 'Metformin', dose: '500 mg', frequency: 'twice daily' }],
  pcpName: 'Dr. Jones',
  pcpAddress: undefined,
  pcpPhone: '9515550001',
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
      language: '',
      office: '',
      referralSource: '',
      pcpPhone: '',
    })

    expect(parsed.email).toBeUndefined()
    expect(parsed.language).toBeUndefined()
    expect(parsed.office).toBeUndefined()
    expect(parsed.referralSource).toBeUndefined()
    expect(parsed.pcpPhone).toBeUndefined()
  })

  it('round-trips a height typed as feet and inches through the stored total', () => {
    // 5' 4" is 64 inches — the number patients confuse with 5' 4" when asked
    // for a total, which is why the form never asks for one.
    expect(createPatientInput.parse({ ...SUBMITTED, heightFeet: '5', heightInchesPart: '4' }).heightInches).toBe(64)
  })

  it('composes feet and inches into the stored total, rounded to hundredths', () => {
    expect(createPatientInput.parse({ ...SUBMITTED, heightFeet: '6', heightInchesPart: '0' }).heightInches).toBe(72)
    expect(createPatientInput.parse({ ...SUBMITTED, heightFeet: '5', heightInchesPart: '4.1' }).heightInches).toBe(64.1)
    // Feet 0 is allowed so a migrated sub-foot typo can be opened and fixed.
    expect(createPatientInput.parse({ ...SUBMITTED, heightFeet: '0', heightInchesPart: '11' }).heightInches).toBe(11)
  })

  it('rejects height parts outside their ranges as invalid_format', () => {
    expect(codesFor({ ...SUBMITTED, heightFeet: '9' })).toEqual({ heightFeet: ['invalid_format'] })
    expect(codesFor({ ...SUBMITTED, heightInchesPart: '12' })).toEqual({ heightInchesPart: ['invalid_format'] })
    expect(codesFor({ ...SUBMITTED, heightFeet: '', heightInchesPart: '' })).toEqual({
      heightFeet: ['invalid_format'],
      heightInchesPart: ['invalid_format'],
    })
  })

  it('drops blank list rows but validates a half-filled one', () => {
    const parsed = createPatientInput.parse({
      ...SUBMITTED,
      medications: [{ name: '', dose: '', frequency: '' }],
    })
    expect(parsed.medications).toEqual([])

    // A dose without a medication name is a mistake, not a blank line.
    expect(codesFor({ ...SUBMITTED, medications: [{ name: '', dose: '10 mg', frequency: '' }] })).toEqual({
      'medications.0.name': ['too_small'],
    })
  })

  it('never writes the history text, and has no healthy weight', () => {
    // Medical history is out of scope: the legacy text stays on the entity,
    // read-only, and an input carrying it is stripped rather than stored.
    const parsed = createPatientInput.parse({ ...SUBMITTED, historyOther: 'typed anyway', healthyWeight: 150 })
    expect(parsed).not.toHaveProperty('historyOther')
    expect(parsed).not.toHaveProperty('healthyWeight')
    expect(patientClinicalInput.parse({ ...SUBMITTED, historyOther: 'typed anyway' })).not.toHaveProperty('historyOther')
    expect(Object.keys(patientSchema.shape)).not.toContain('healthyWeight')
  })

  it('rejects empty names as too_small', () => {
    expect(codesFor({ ...SUBMITTED, firstName: '   ', lastName: '' })).toEqual({
      firstName: ['too_small'],
      lastName: ['too_small'],
    })
  })

  it('requires the legacy-required fields: gender, address, phone', () => {
    expect(
      codesFor({
        ...SUBMITTED,
        gender: '',
        addressStreet: '',
        addressCity: '',
        addressState: '',
        addressZip: '',
        phone: '',
      }),
    ).toEqual({
      gender: ['invalid_value'],
      addressStreet: ['too_small'],
      addressCity: ['too_small'],
      addressState: ['invalid_format'],
      addressZip: ['invalid_format'],
      phone: ['invalid_format'],
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

describe('the section inputs', () => {
  const id = '3e1e0a92-06b6-4b1e-9f3a-6d4c05f9a111'

  it('each takes its own slice of the form and ignores the rest', () => {
    // A Zod object strips the keys it does not declare, which is what lets
    // one form value feed three section schemas.
    const demographics = updatePatientDemographicsInput.parse({ ...SUBMITTED, id })
    expect(demographics).not.toHaveProperty('heightInches')
    expect(demographics).not.toHaveProperty('creditCardNumber')
    expect(demographics).toMatchObject({ id, firstName: 'Ada', phone: '9515550000' })

    const clinical = updatePatientClinicalInput.parse({ ...SUBMITTED, id })
    expect(clinical).not.toHaveProperty('phone')
    expect(clinical).not.toHaveProperty('creditCardNumber')
    expect(clinical).toMatchObject({ id, heightInches: 64.5, medications: VALID.medications })

    const billing = updatePatientBillingInput.parse({ ...SUBMITTED, id })
    expect(billing).toEqual({ id, creditCardNumber: '4111111111111111', creditCardExpMonth: '12', creditCardExpYear: '2030', creditCardZip: '90210' })
  })

  it('validate without an id for a client checking only the tabs it renders', () => {
    expect(patientDemographicsInput.safeParse({ ...SUBMITTED, phone: '' }).success).toBe(false)
    expect(patientClinicalInput.safeParse({ ...SUBMITTED, phone: '' }).success).toBe(true)
  })

  it('together they cover exactly what create takes', () => {
    const created = createPatientInput.parse(SUBMITTED)
    const union = {
      ...updatePatientDemographicsInput.parse({ ...SUBMITTED, id }),
      ...updatePatientClinicalInput.parse({ ...SUBMITTED, id }),
      ...updatePatientBillingInput.parse({ ...SUBMITTED, id }),
    }
    const { id: _id, ...withoutId } = union
    expect(withoutId).toEqual(created)
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

describe('suggestPatientsInput', () => {
  it('interprets the query exactly as a search does', () => {
    expect(suggestPatientsInput.parse({ query: ' Pe ' })).toEqual({
      query: { kind: 'name', name: 'Pe' },
    })
    expect(suggestPatientsInput.parse({ query: 'Penn, Jo' })).toEqual({
      query: { kind: 'fullName', firstName: 'Jo', lastName: 'Penn' },
    })
  })

  it('refuses what a search refuses: one letter, a partial phone, a date', () => {
    expect(suggestPatientsInput.safeParse({ query: 'P' }).success).toBe(false)
    expect(suggestPatientsInput.safeParse({ query: '951555' }).success).toBe(false)
    expect(suggestPatientsInput.safeParse({ query: '1985-12-10' }).success).toBe(false)
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
      serviceDate: undefined,
    })
  })

  it('accepts a date-of-birth filter alone, or combined with a query', () => {
    expect(searchPatientsInput.parse({ query: '', dateOfBirth: '1985-12-10' })).toEqual({
      query: undefined,
      dateOfBirth: '1985-12-10',
      serviceDate: undefined,
    })
    expect(searchPatientsInput.parse({ query: 'Lovelace', dateOfBirth: '1985-12-10' })).toEqual({
      query: { kind: 'name', name: 'Lovelace' },
      dateOfBirth: '1985-12-10',
      serviceDate: undefined,
    })
  })

  it('accepts a service date alone, or combined with the others', () => {
    expect(searchPatientsInput.parse({ serviceDate: '2026-09-01' })).toEqual({
      query: undefined,
      dateOfBirth: undefined,
      serviceDate: '2026-09-01',
    })
    expect(
      searchPatientsInput.parse({ query: 'pe', dateOfBirth: '1985-12-10', serviceDate: '2026-09-01' }),
    ).toEqual({
      query: { kind: 'name', name: 'pe' },
      dateOfBirth: '1985-12-10',
      serviceDate: '2026-09-01',
    })
    expect(searchPatientsInput.safeParse({ serviceDate: '9/1/2026' }).success).toBe(false)
  })

  it('has no status filter — status left the roster with DIA-50', () => {
    // A stray status key is dropped, not honoured: the wire cannot ask for it.
    expect(searchPatientsInput.parse({ query: 'Lovelace', status: 'inactive' })).toEqual({
      query: { kind: 'name', name: 'Lovelace' },
      dateOfBirth: undefined,
      serviceDate: undefined,
    })
    expect(searchPatientsInput.safeParse({ query: '', dateOfBirth: '', status: 'inactive' }).success).toBe(
      false,
    )
  })

  it('refuses an entirely empty search — the roster never lists everyone', () => {
    expect(searchPatientsInput.safeParse({ query: '', dateOfBirth: '', serviceDate: '' }).success).toBe(
      false,
    )
    expect(searchPatientsInput.safeParse({}).success).toBe(false)
  })

  it('fails an uninterpretable query with issue code custom, no message of ours', () => {
    const result = searchPatientsInput.safeParse({ query: '951555' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe('custom')
    }
  })
})
