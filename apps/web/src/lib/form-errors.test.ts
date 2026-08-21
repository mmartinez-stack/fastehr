import { describe, expect, it } from 'vitest'
import {
  FALLBACK_FIELD_MESSAGE,
  FALLBACK_FORM_MESSAGE,
  toFormErrors,
  validationFrom,
} from './form-errors.ts'

const COPY = {
  firstName: { too_small: 'Enter the first name.' },
}

describe('toFormErrors', () => {
  it('resolves field copy by path and code', () => {
    const errors = toFormErrors(
      { fieldErrors: { firstName: ['too_small'] }, formErrors: [] },
      COPY,
    )

    expect(errors).toEqual({ fields: { firstName: { message: 'Enter the first name.' } } })
  })

  it('falls back for a code the table does not cover, without echoing anything', () => {
    const errors = toFormErrors(
      { fieldErrors: { firstName: ['invalid_type'] }, formErrors: [] },
      COPY,
    )

    expect(errors.fields.firstName).toEqual({ message: FALLBACK_FIELD_MESSAGE })
  })

  it('surfaces form-level issues as a form message', () => {
    const errors = toFormErrors({ fieldErrors: {}, formErrors: ['unrecognized_keys'] }, COPY)

    expect(errors.form).toBe(FALLBACK_FORM_MESSAGE)
  })
})

describe('validationFrom', () => {
  it('extracts the failure a formatted tRPC error carries', () => {
    const failure = { fieldErrors: { firstName: ['too_small'] }, formErrors: [] }

    expect(validationFrom({ data: { validation: failure } })).toEqual(failure)
  })

  it('returns null for anything else', () => {
    expect(validationFrom(new Error('boom'))).toBeNull()
    expect(validationFrom({ data: { code: 'CONFLICT' } })).toBeNull()
    expect(validationFrom(undefined)).toBeNull()
  })
})
