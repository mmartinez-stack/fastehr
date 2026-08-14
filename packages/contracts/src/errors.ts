import { z } from 'zod'

/**
 * Validation failures, reduced to something safe to send over a network.
 *
 * This lives in `contracts` for the same reason the env schemas do: decision 5
 * makes it the only package with a direct Zod dependency, so `apps/web` cannot
 * inspect a `ZodError` itself. It gets this instead.
 */

/** Which fields failed, and how — by issue code, never by value. */
export interface ValidationFailure {
  /** Dotted field path → Zod issue codes, e.g. `{ 'patient.id': ['invalid_format'] }`. */
  fieldErrors: Record<string, string[]>
  /** Issue codes not attributable to a single field. */
  formErrors: string[]
}

/**
 * Describes a validation failure by **path and issue code only**.
 *
 * Deliberately not `z.flattenError`, which returns human-readable messages.
 * Zod 4's own default messages are safe — checked, across `too_small`,
 * `invalid_type`, `invalid_format`, `invalid_value` and `unrecognized_keys`,
 * none quotes the value that failed. The risk is the messages *we* will write:
 * a `.refine(…, \`invalid MRN: ${value}\`)` reads as helpful and puts a patient
 * identifier into an error payload, which comes to rest in browser consoles,
 * proxy access logs, and whatever error tracker is watching. This function is
 * the reason that mistake cannot reach any of them, and it holds without every
 * future refinement author having to remember the rule.
 *
 * Codes are stable and enumerable, so the client owns the copy. If a form ever
 * needs richer text, the safe direction is a code→message table on the client,
 * not messages travelling from here.
 *
 * Returns `null` for anything that is not a Zod error, which is the signal to
 * leave the error shape untouched.
 */
export function describeValidationFailure(cause: unknown): ValidationFailure | null {
  if (!(cause instanceof z.ZodError)) return null

  const fieldErrors: Record<string, string[]> = {}
  const formErrors: string[] = []

  for (const issue of cause.issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.code)
      continue
    }
    const key = issue.path.join('.')
    ;(fieldErrors[key] ??= []).push(issue.code)
  }

  return { fieldErrors, formErrors }
}
