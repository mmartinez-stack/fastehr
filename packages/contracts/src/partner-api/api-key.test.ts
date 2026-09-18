import { describe, expect, it } from 'vitest'
import { bearerToken, formatApiKey, parseApiKey } from './api-key.ts'

const SECRET = 'A'.repeat(43)

describe('api key format', () => {
  it('round-trips through format and parse', () => {
    const key = formatApiKey({ environment: 'live', keyId: 'ABCDEFGH', secret: SECRET })
    expect(key).toBe(`fehr_live_ABCDEFGH_${SECRET}`)
    expect(parseApiKey(key)).toEqual({ environment: 'live', keyId: 'ABCDEFGH', secret: SECRET })
  })

  it('refuses anything not in the grammar, without saying why', () => {
    for (const bad of [
      '',
      'fehr_live_ABCDEFGH',
      `fehr_prod_ABCDEFGH_${SECRET}`,
      `fehr_live_abcdefgh_${SECRET}`, // lower case is not in the id alphabet
      `fehr_live_ABCDEFGH_${SECRET}x`,
      `fehr_live_ABCDEFGI_${SECRET}`, // I is excluded from the alphabet
    ]) {
      expect(parseApiKey(bad), bad).toBeNull()
    }
  })

  it('reads a bearer token and only a bearer token', () => {
    expect(bearerToken('Bearer abc')).toBe('abc')
    expect(bearerToken('bearer   abc  ')).toBe('abc')
    expect(bearerToken('Basic abc')).toBeNull()
    expect(bearerToken('Bearer')).toBeNull()
    expect(bearerToken(null)).toBeNull()
  })
})
