import { z } from 'zod'

/**
 * The partner API error envelope (ADR 12 applied to REST, ADR 37).
 *
 * Every failure leaves as `{ error: { code, requestId, validation? } }`:
 * a code from the closed list below, the request id the caller can quote
 * back, and for `invalid_input` the field paths and issue codes that
 * `describeValidationFailure` produces. No message text, no stack, and
 * nothing from the request, for the reason ADR 12 gives: a message is a
 * channel for a patient identifier to reach a proxy log.
 *
 * The codes are deliberately coarse where the distinction would inform a
 * probe. One `unauthenticated` covers an unknown key, a bad secret, an
 * expired key, a revoked key, and an IP outside the allowlist; one
 * `verification_failed` covers an unknown patient id, a wrong date of
 * birth, and a wrong phone. `forbidden` (a scope the key lacks) is safe to
 * distinguish: the caller is authenticated and learns nothing about a
 * patient.
 */
export const PARTNER_ERROR_STATUS = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  verification_required: 403,
  verification_failed: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  idempotency_mismatch: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  verification_locked: 429,
  internal_error: 500,
} as const

export const PARTNER_ERROR_CODES = Object.keys(PARTNER_ERROR_STATUS) as [
  PartnerErrorCode,
  ...PartnerErrorCode[],
]
export type PartnerErrorCode = keyof typeof PARTNER_ERROR_STATUS

export const partnerErrorCodeSchema = z.enum(
  Object.keys(PARTNER_ERROR_STATUS) as [PartnerErrorCode, ...PartnerErrorCode[]],
)

/** The shape `describeValidationFailure` returns: dotted field paths to Zod issue codes. */
export const validationFailureSchema = z.object({
  fieldErrors: z.record(z.string(), z.array(z.string())),
  formErrors: z.array(z.string()),
})

export const partnerErrorSchema = z.object({
  error: z.object({
    code: partnerErrorCodeSchema,
    /** Server generated; quote it in support requests. */
    requestId: z.string(),
    validation: validationFailureSchema.optional(),
  }),
})
export type PartnerError = z.infer<typeof partnerErrorSchema>

/** Codes every authenticated operation can answer with, listed once. */
export const COMMON_PARTNER_ERRORS: readonly PartnerErrorCode[] = [
  'invalid_input',
  'unauthenticated',
  'forbidden',
  'rate_limited',
  'internal_error',
]
