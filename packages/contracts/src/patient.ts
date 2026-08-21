import { z } from 'zod'

/**
 * Patient — the entity and its first write input.
 *
 * `createPatientInput` is deliberately not `patientSchema.omit(…)`: an input
 * schema normalizes (trims names, lowercases email, strips phone formatting)
 * where the entity schema only describes what a stored record looks like.
 * Deriving one from the other couples the two jobs and the normalization is
 * the part that matters — it runs identically in the browser form and in the
 * tRPC mutation, because both import this object (docs/forms.md).
 */
export const patientSchema = z.object({
  id: z.uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.iso.date(),
  email: z.email().nullable(),
  /** Ten digits, no formatting — presentation belongs to the client. */
  phone: z.string().regex(/^\d{10}$/).nullable(),
})

export type Patient = z.infer<typeof patientSchema>

/**
 * A blank string means the user left the field empty, and an empty optional
 * field is *absent*, not invalid. Without this, clearing the email field and
 * submitting would fail `z.email()` on `''` — an error for a field the user
 * never filled in.
 */
function blankAsAbsent<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  )
}

/** Trimmed and lowercased before validation — same normalization as staff emails. */
const normalizedEmail = z.string().trim().toLowerCase().pipe(z.email())

/**
 * Anything a person types — "(951) 555-0000", "951.555.0000" — reduced to
 * digits, then required to be exactly ten of them. The regex (issue code
 * `invalid_format`) rather than a refinement, so the failure keeps a specific
 * code for the client copy table.
 */
const normalizedPhone = z
  .string()
  .transform((value) => value.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{10}$/))

/**
 * A date of birth is a past calendar date. The comparison is lexicographic,
 * which is exact for `YYYY-MM-DD`, and "today" is UTC's today — at a day
 * boundary that errs lenient (accepts a date the server's clock has not
 * reached locally) rather than rejecting a birth date that is true where the
 * user is standing. Refinements carry issue code `custom`; the client copy
 * table keys on the field, so one message covers the whole plausibility check.
 */
const dateOfBirth = z.iso.date().pipe(
  // Piped rather than chained so the plausibility check only ever sees a
  // well-formed date — chained, a malformed string reaches the refinement and
  // the field reports two codes for one mistake.
  z.string().refine((value) => {
    const today = new Date().toISOString().slice(0, 10)
    return value <= today && value >= '1900-01-01'
  }),
)

export const createPatientInput = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  dateOfBirth,
  email: blankAsAbsent(normalizedEmail),
  phone: blankAsAbsent(normalizedPhone),
})

export type CreatePatientInput = z.infer<typeof createPatientInput>
