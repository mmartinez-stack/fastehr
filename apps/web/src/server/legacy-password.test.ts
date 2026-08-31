import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { serializeLegacyCredential } from '@fastehr/contracts'
import { verifyLegacyPassword } from './legacy-password.ts'

/**
 * The fixture is built the way the legacy system built real credentials:
 * a 16-byte hex salt, PBKDF2-SHA1 over the salt
 * *string*, 1000 iterations, 64-byte key. If `verifyLegacyPassword` drifts
 * from that recipe — decoding the salt, changing the digest — these fail.
 */
function legacyCredentialFor(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(password, salt, 1000, 64, 'sha1').toString('hex')
  return serializeLegacyCredential({ iterations: 1000, salt, hash })
}

describe('verifyLegacyPassword', () => {
  it('accepts the password the legacy system hashed', () => {
    const stored = legacyCredentialFor('correct horse battery staple')
    expect(verifyLegacyPassword(stored, 'correct horse battery staple')).toBe(true)
  })

  it('refuses a wrong password', () => {
    const stored = legacyCredentialFor('correct horse battery staple')
    expect(verifyLegacyPassword(stored, 'correct horse battery stable')).toBe(false)
    expect(verifyLegacyPassword(stored, '')).toBe(false)
  })

  it('refuses anything that is not a legacy credential, scrypt included', () => {
    // Better Auth's own format — must fall through to scrypt, never "verify" here.
    expect(verifyLegacyPassword('abc123:def456', 'anything')).toBe(false)
    expect(verifyLegacyPassword('', 'anything')).toBe(false)
  })

  it('refuses a truncated stored hash instead of throwing', () => {
    const salt = randomBytes(16).toString('hex')
    const truncated = serializeLegacyCredential({
      iterations: 1000,
      salt,
      hash: pbkdf2Sync('pw', salt, 1000, 64, 'sha1').toString('hex').slice(0, 32),
    })
    expect(verifyLegacyPassword(truncated, 'pw')).toBe(false)
  })
})
