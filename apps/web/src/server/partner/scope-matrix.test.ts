import { API_SCOPES, PARTNER_OPERATIONS } from '@fastehr/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADA, partnerHarness, testKey } from '../test-support/partner-fakes.ts'

/**
 * Every operation against a key holding exactly one scope: the call gets
 * past authorization only when that scope is the operation's. The matrix
 * is the registry, so this cross-product is the whole matrix.
 */
beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

function minimalRequest(operationId: string): { path: string; body?: unknown } {
  switch (operationId) {
    case 'patients.lookup':
      return { path: '/patients/lookup', body: { dateOfBirth: '1985-12-10', phone: '9515550000' } }
    case 'patients.verify':
      return { path: `/patients/${ADA.patientId}/verify`, body: { dateOfBirth: '1985-12-10', phone: '9515550000' } }
    case 'queue.count':
      return { path: '/queue/count' }
    default:
      throw new Error(`no minimal request for ${operationId}: add one`)
  }
}

describe('scope matrix', () => {
  for (const operation of PARTNER_OPERATIONS) {
    for (const scope of API_SCOPES) {
      const expected = operation.scope === null || operation.scope === scope ? 'passes' : 'is forbidden'
      it(`${operation.id} with only ${scope} ${expected}`, async () => {
        const harness = partnerHarness({ keys: [testKey({ scopes: [scope] })] })
        const { status, body } = await harness.send(minimalRequest(operation.id))
        const code = (body as { error?: { code: string } }).error?.code
        if (expected === 'passes') {
          expect(code).not.toBe('forbidden')
          expect(code).not.toBe('unauthenticated')
        } else {
          expect(status).toBe(403)
          expect(code).toBe('forbidden')
        }
      })
    }
  }
})
