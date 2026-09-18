import { describe, expect, it } from 'vitest'
import { PARTNER_ERROR_CODES, PARTNER_ERROR_STATUS, partnerErrorSchema } from './errors.ts'

describe('partner error envelope', () => {
  it('every code maps to a client or server error status', () => {
    for (const code of PARTNER_ERROR_CODES) {
      const status = PARTNER_ERROR_STATUS[code]
      expect(status).toBeGreaterThanOrEqual(400)
      expect(status).toBeLessThanOrEqual(599)
    }
  })

  it('the envelope is code, request id, and optionally the validation codes, nothing else', () => {
    expect(
      partnerErrorSchema.safeParse({
        error: { code: 'invalid_input', requestId: 'r-1', validation: { fieldErrors: { phone: ['invalid_format'] }, formErrors: [] } },
      }).success,
    ).toBe(true)
    expect(partnerErrorSchema.safeParse({ error: { code: 'made_up', requestId: 'r-1' } }).success).toBe(false)
    // No message field: text is the channel ADR 12 closes.
    expect(Object.keys(partnerErrorSchema.shape.error.shape)).toEqual(['code', 'requestId', 'validation'])
  })
})
