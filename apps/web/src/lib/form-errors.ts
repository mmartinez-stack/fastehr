import type { ValidationFailure } from '@fastehr/contracts'

/**
 * Turning a `ValidationFailure` into form errors — the client half of the
 * validation seam (docs/forms.md).
 *
 * Failures arrive as field paths and issue codes, never messages (ADR 12), so
 * every message a user reads is written here, on the client, in a copy table
 * the form owns. The same table serves both directions: a submit the browser
 * rejects locally and one the server rejects produce identical errors, because
 * both are reduced to a `ValidationFailure` first.
 */

/** Field path → issue code → message. `describeValidationFailure` emits the codes. */
export type FormCopy = Record<string, Record<string, string>>

/** What a form shows when no table entry covers the code. Says nothing about the value. */
export const FALLBACK_FIELD_MESSAGE = 'This value is not valid.'
export const FALLBACK_FORM_MESSAGE = 'Something in this form is not valid. Check the fields and try again.'

/**
 * The shape TanStack Form's submit validators return: a form-level message and
 * per-field errors. Field errors are `{ message }` objects because that is
 * what the shadcn `FieldError` component renders.
 */
export interface FormErrors {
  form?: string
  fields: Record<string, { message: string }>
}

export function toFormErrors(failure: ValidationFailure, copy: FormCopy): FormErrors {
  const fields: Record<string, { message: string }> = {}

  for (const [path, codes] of Object.entries(failure.fieldErrors)) {
    const code = codes[0]
    if (code === undefined) continue
    fields[path] = { message: copy[path]?.[code] ?? FALLBACK_FIELD_MESSAGE }
  }

  return failure.formErrors.length > 0 ? { form: FALLBACK_FORM_MESSAGE, fields } : { fields }
}

/**
 * The `ValidationFailure` a tRPC mutation error carries, or `null` when the
 * error is anything else — a conflict, a network failure, a crash. Callers
 * branch on that null: a validation failure maps onto fields, everything else
 * gets form-level or toast copy of its own.
 *
 * Duck-typed rather than imported from the tRPC client so it accepts the
 * `unknown` an error boundary or catch block actually has.
 */
export function validationFrom(error: unknown): ValidationFailure | null {
  if (typeof error !== 'object' || error === null) return null
  const data = (error as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const validation = (data as { validation?: unknown }).validation
  if (typeof validation !== 'object' || validation === null) return null
  if (!('fieldErrors' in validation) || !('formErrors' in validation)) return null
  return validation as ValidationFailure
}
