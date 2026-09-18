import { describe, expect, it } from 'vitest'
import { INTAKE_CONSENT_VERSION, signatureMatchesName } from './intake-consent.ts'
import { acceptIntakeInput, intakeSubmissionSchema, submitIntakeInput } from './intake.ts'

/** The raw form a phone submits, plus the token from the link. */
const FORM = {
  token: 'x'.repeat(43),
  firstName: ' Ada ',
  lastName: 'Lovelace',
  gender: 'female',
  dateOfBirth: '1985-12-10',
  language: 'spanish',
  office: 'PennProgram',
  email: '',
  addressStreet: '10 Analytical Way',
  addressCity: 'Pasadena',
  addressState: 'ca',
  addressZip: '91101',
  phone: '(951) 555-0000',
  phoneFollowUpAllowed: true,
  preferredContactTime: 'morning',
  referralSource: '',
  referredByPatientId: '',
  programType: '',
  heightFeet: '5',
  heightInchesPart: '4',
  medications: [{ name: 'Metformin', dose: '', frequency: '' }],
  conditions: [
    { condition: 'diabetes', present: true, onset: '2019', treatedBy: '', medicated: false, medications: '' },
    { condition: 'thyroid', present: false, onset: '', treatedBy: '', medicated: false, medications: '' },
  ],
  pcpName: '',
  pcpAddress: '',
  pcpPhone: '',
  consentAcknowledged: true,
  consentVersion: INTAKE_CONSENT_VERSION,
  consentSignature: 'ada lovelace',
}

/** The stored submission is the form minus the token and the consent fields. */
function submissionOf(form: typeof FORM) {
  const {
    token: _token,
    consentAcknowledged: _acknowledged,
    consentVersion: _version,
    consentSignature: _signature,
    ...submission
  } = submitIntakeInput.parse(form)
  return submission
}

describe('submitIntakeInput', () => {
  it('normalizes the form the way the staff form is normalized, and keeps the token apart', () => {
    const { token, ...submission } = submitIntakeInput.parse(FORM)

    expect(token).toBe(FORM.token)
    expect(submission).toMatchObject({
      firstName: 'Ada',
      office: 'PennProgram',
      addressState: 'CA',
      phone: '9515550000',
      preferredContactTime: 'morning',
      heightInches: 64,
      medications: [{ name: 'Metformin' }],
      conditions: [{ condition: 'diabetes', onset: '2019', medicated: false }],
      consentSignature: 'ada lovelace',
    })
    expect(submission).not.toHaveProperty('heightFeet')
    expect(submission).not.toHaveProperty('creditCardNumber')
  })

  it('requires the office — it decides the queue', () => {
    expect(submitIntakeInput.safeParse({ ...FORM, office: '' }).success).toBe(false)
    expect(submitIntakeInput.safeParse({ ...FORM, office: 'Fresno' }).success).toBe(false)
  })

  it('requires a preferred contact time from the list', () => {
    expect(submitIntakeInput.safeParse({ ...FORM, preferredContactTime: '' }).success).toBe(false)
    expect(submitIntakeInput.safeParse({ ...FORM, preferredContactTime: 'night' }).success).toBe(false)
  })

  it('refuses a token that is too short to be one', () => {
    expect(submitIntakeInput.safeParse({ ...FORM, token: 'abc' }).success).toBe(false)
  })

  describe('the consent', () => {
    const codesFor = (form: unknown, field: string) => {
      const result = submitIntakeInput.safeParse(form)
      if (result.success) return []
      return result.error.issues.filter((issue) => issue.path.join('.') === field).map((issue) => issue.code)
    }

    it('must be acknowledged', () => {
      expect(codesFor({ ...FORM, consentAcknowledged: false }, 'consentAcknowledged')).toEqual(['invalid_value'])
    })

    it('must be signed against the current text, not an older one', () => {
      expect(codesFor({ ...FORM, consentVersion: 'telehealth-treatment-consent/0' }, 'consentVersion')).toEqual([
        'invalid_value',
      ])
    })

    it('must be signed with the person’s own name, as entered on the form', () => {
      expect(codesFor({ ...FORM, consentSignature: '' }, 'consentSignature')).toEqual(['too_small'])
      expect(codesFor({ ...FORM, consentSignature: 'A. Lovelace' }, 'consentSignature')).toEqual(['custom'])
      // Case, accents, and spacing are not part of a name.
      expect(submitIntakeInput.safeParse({ ...FORM, consentSignature: '  ADA   Lovelace ' }).success).toBe(true)
      expect(
        submitIntakeInput.safeParse({ ...FORM, firstName: 'José', lastName: 'López', consentSignature: 'jose lopez' })
          .success,
      ).toBe(true)
    })
  })
})

describe('signatureMatchesName', () => {
  it('folds case, accents, and whitespace on both sides', () => {
    expect(signatureMatchesName('josé  lópez', 'Jose', 'Lopez')).toBe(true)
    expect(signatureMatchesName('Jose Lopez Jr', 'Jose', 'Lopez')).toBe(false)
    expect(signatureMatchesName('', 'Jose', 'Lopez')).toBe(false)
  })
})

describe('intakeSubmissionSchema', () => {
  it('reads back exactly what the router stores from submitIntakeInput', () => {
    const submission = submissionOf(FORM)
    // Through JSON, as the column round-trips it: undefined fields vanish.
    const stored = JSON.parse(JSON.stringify(submission)) as unknown
    expect(intakeSubmissionSchema.parse(stored)).toEqual(submission)
  })

  it('rejects a blob missing what a patient create needs', () => {
    expect(intakeSubmissionSchema.safeParse({ firstName: 'Ada' }).success).toBe(false)
  })

  it('still reads a submission stored under an earlier cut of the form', () => {
    const submission = submissionOf(FORM)
    // With an allergy list: stripped. The history text stays (it is a field again).
    const withAllergies = { ...submission, allergies: [], historyOther: 'x' }
    expect(intakeSubmissionSchema.parse(withAllergies)).toEqual({ ...submission, historyOther: 'x' })
    // Without the checklist: every item "No".
    const { conditions: _conditions, ...withoutChecklist } = submission
    expect(intakeSubmissionSchema.parse(withoutChecklist)).toEqual({ ...submission, conditions: [] })
    // Before the contact-time question existed: no answer, not a failure.
    const { preferredContactTime: _time, ...withoutContactTime } = submission
    expect(intakeSubmissionSchema.parse(withoutContactTime)).toEqual(withoutContactTime)
  })
})

describe('acceptIntakeInput', () => {
  it('is the reviewed form plus the request id, in the patient-create shape', () => {
    const { token: _token, ...form } = FORM
    const parsed = acceptIntakeInput.parse({ ...form, id: '5d3f2a1c-7b8e-4f90-a1b2-c3d4e5f60718', office: '' })

    expect(parsed.id).toBe('5d3f2a1c-7b8e-4f90-a1b2-c3d4e5f60718')
    // On the staff side the office is optional again, as on the create form.
    expect(parsed.office).toBeUndefined()
    expect(parsed.heightInches).toBe(64)
    // The consent is the person's, recorded once: the reviewer does not re-sign it.
    expect(parsed).not.toHaveProperty('consentSignature')
    expect(parsed).not.toHaveProperty('preferredContactTime')
  })
})
