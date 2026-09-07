import { describe, expect, it } from 'vitest'
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
      heightInches: 64,
      medications: [{ name: 'Metformin' }],
      conditions: [{ condition: 'diabetes', onset: '2019', medicated: false }],
    })
    expect(submission).not.toHaveProperty('heightFeet')
    expect(submission).not.toHaveProperty('creditCardNumber')
  })

  it('requires the office — it decides the queue', () => {
    expect(submitIntakeInput.safeParse({ ...FORM, office: '' }).success).toBe(false)
    expect(submitIntakeInput.safeParse({ ...FORM, office: 'Fresno' }).success).toBe(false)
  })

  it('refuses a token that is too short to be one', () => {
    expect(submitIntakeInput.safeParse({ ...FORM, token: 'abc' }).success).toBe(false)
  })
})

describe('intakeSubmissionSchema', () => {
  it('reads back exactly what submitIntakeInput stored', () => {
    const { token: _token, ...submission } = submitIntakeInput.parse(FORM)
    // Through JSON, as the column round-trips it: undefined fields vanish.
    const stored = JSON.parse(JSON.stringify(submission)) as unknown
    expect(intakeSubmissionSchema.parse(stored)).toEqual(submission)
  })

  it('rejects a blob missing what a patient create needs', () => {
    expect(intakeSubmissionSchema.safeParse({ firstName: 'Ada' }).success).toBe(false)
  })

  it('still reads a submission stored under an earlier cut of the form', () => {
    const { token: _token, ...submission } = submitIntakeInput.parse(FORM)
    // With an allergy list and history text: stripped.
    const withAllergies = { ...submission, allergies: [], historyOther: 'x' }
    expect(intakeSubmissionSchema.parse(withAllergies)).toEqual(submission)
    // Without the checklist: every item "No".
    const { conditions: _conditions, ...withoutChecklist } = submission
    expect(intakeSubmissionSchema.parse(withoutChecklist)).toEqual({ ...submission, conditions: [] })
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
  })
})
