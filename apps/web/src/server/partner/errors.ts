import { PARTNER_ERROR_STATUS, type PartnerError, type PartnerErrorCode } from '@fastehr/contracts'
import { jsonResponse } from './http.ts'

/**
 * The one error a partner handler throws, and how it leaves (ADR 12 on
 * REST). The code decides the status; the envelope carries the code, the
 * request id, and for `invalid_input` the field paths and issue codes.
 * Nothing else: no message text, no stack, nothing from the request.
 */
export class PartnerApiError extends Error {
  readonly code: PartnerErrorCode
  readonly validation: PartnerError['error']['validation']
  readonly retryAfterSeconds: number | undefined
  readonly allow: readonly string[] | undefined

  constructor(
    code: PartnerErrorCode,
    options: {
      validation?: PartnerError['error']['validation']
      retryAfterSeconds?: number
      allow?: readonly string[]
    } = {},
  ) {
    super(code)
    this.name = 'PartnerApiError'
    this.code = code
    this.validation = options.validation
    this.retryAfterSeconds = options.retryAfterSeconds
    this.allow = options.allow
  }

  get status(): number {
    return PARTNER_ERROR_STATUS[this.code]
  }
}

/** Codes that mean "refused", as opposed to "failed": the audit outcome distinction ADR 10 keeps. */
export const DENIAL_CODES: ReadonlySet<PartnerErrorCode> = new Set<PartnerErrorCode>([
  'unauthenticated',
  'forbidden',
  'verification_required',
  'verification_failed',
  'verification_locked',
  'rate_limited',
])

export function errorResponse(error: PartnerApiError, requestId: string): Response {
  const headers: Record<string, string> = {}
  if (error.code === 'unauthenticated') headers['WWW-Authenticate'] = 'Bearer realm="fastehr-partner-api"'
  if (error.retryAfterSeconds !== undefined) headers['Retry-After'] = String(Math.max(1, Math.ceil(error.retryAfterSeconds)))
  if (error.allow !== undefined) headers.Allow = error.allow.join(', ')

  const body: PartnerError = {
    error: {
      code: error.code,
      requestId,
      ...(error.validation === undefined ? {} : { validation: error.validation }),
    },
  }
  return jsonResponse(error.status, body, requestId, headers)
}
