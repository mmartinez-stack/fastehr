import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { describeValidationFailure, type ValidationFailure } from './errors.ts'

const MEMBER_ID = 'MRN-88213-SENSITIVE'

function failureFor(schema: z.ZodType, input: unknown): ValidationFailure {
  const result = schema.safeParse(input)
  if (result.success) throw new Error('expected the schema to reject this input')

  const failure = describeValidationFailure(result.error)
  if (failure === null) throw new Error('expected a Zod error to be described')
  return failure
}

describe('describeValidationFailure', () => {
  it('reports field paths and issue codes', () => {
    const schema = z.object({ firstName: z.string().min(1), dateOfBirth: z.iso.date() })

    expect(failureFor(schema, { firstName: '', dateOfBirth: 'not-a-date' })).toEqual({
      fieldErrors: { firstName: ['too_small'], dateOfBirth: ['invalid_format'] },
      formErrors: [],
    })
  })

  it('joins nested paths', () => {
    const schema = z.object({ patient: z.object({ id: z.uuid() }) })

    expect(failureFor(schema, { patient: { id: 'nope' } }).fieldErrors).toEqual({
      'patient.id': ['invalid_format'],
    })
  })

  it('drops an author-written message that quotes the offending value', () => {
    // The live hazard. Zod's own default messages do not include the input —
    // verified across too_small, invalid_type, invalid_format, invalid_value
    // and unrecognized_keys — but a refinement written like this does, and it
    // reads as helpful while putting a patient identifier into an error payload
    // bound for browser consoles, proxy logs, and error trackers.
    const schema = z.object({
      memberId: z.string().refine((value) => value.startsWith('X'), {
        error: (issue) => `invalid member id: ${String(issue.input)}`,
      }),
    })

    const failure = failureFor(schema, { memberId: MEMBER_ID })

    expect(failure).toEqual({ fieldErrors: { memberId: ['custom'] }, formErrors: [] })
    expect(JSON.stringify(failure)).not.toContain(MEMBER_ID)
    expect(JSON.stringify(failure)).not.toContain('88213')
  })

  it('separates issues with no field from field issues', () => {
    const schema = z.strictObject({ firstName: z.string() })

    expect(failureFor(schema, { firstName: 'Ada', ssn: '000-00-0000' })).toEqual({
      fieldErrors: {},
      formErrors: ['unrecognized_keys'],
    })
  })

  it('returns null for anything that is not a Zod error', () => {
    expect(describeValidationFailure(new Error('boom'))).toBeNull()
    expect(describeValidationFailure(undefined)).toBeNull()
  })
})
