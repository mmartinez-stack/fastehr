import { describe, expect, it } from 'vitest'
import { apiKeyPrefix, bearerToken } from './api-key.ts'

describe('bearerToken', () => {
  it('reads a Bearer token and nothing else', () => {
    expect(bearerToken('Bearer fehr_dev_abc')).toBe('fehr_dev_abc')
    expect(bearerToken('bearer   fehr_dev_abc  ')).toBe('fehr_dev_abc')
    expect(bearerToken('Basic Zm9v')).toBeNull()
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken('Bearer')).toBeNull()
    expect(bearerToken(`Bearer ${'x'.repeat(129)}`)).toBeNull()
  })

  it('prefixes a key with its environment', () => {
    expect(apiKeyPrefix('dev')).toBe('fehr_dev_')
    expect(apiKeyPrefix('live')).toBe('fehr_live_')
  })
})
