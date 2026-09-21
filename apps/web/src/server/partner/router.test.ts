import { describe, expect, it } from 'vitest'
import { PartnerApiError } from './errors.ts'
import { matchRoute } from './router.ts'

describe('matchRoute', () => {
  it('matches a template and hands back the segment as a string', () => {
    const match = matchRoute('POST', '/patients/3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81/verify')
    expect(match).toMatchObject({
      operation: { id: 'patients.verify' },
      params: { patientId: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81' },
    })
  })

  it('answers 404 for an unknown path and 405 with the allowed verbs for a known one', () => {
    const unknown = matchRoute('GET', '/patients/lookup/extra')
    expect(unknown).toBeInstanceOf(PartnerApiError)
    expect((unknown as PartnerApiError).code).toBe('not_found')

    const wrongVerb = matchRoute('GET', '/patients/lookup')
    expect((wrongVerb as PartnerApiError).code).toBe('method_not_allowed')
    expect((wrongVerb as PartnerApiError).allow).toEqual(['POST'])
  })

  it('does not let a segment span a slash', () => {
    expect((matchRoute('POST', '/patients/a/b/verify') as PartnerApiError).code).toBe('not_found')
  })
})
