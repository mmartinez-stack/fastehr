import { describe, expect, it } from 'vitest'
import {
  isLegacyCredential,
  parseLegacyCredential,
  serializeLegacyCredential,
} from './legacy-credential.ts'

// Shaped like real legacy values: 16 salt bytes and 64 derived bytes, hex.
const SALT = 'ab'.repeat(16)
const HASH = 'cd'.repeat(64)

describe('serializeLegacyCredential', () => {
  it('round-trips through parse', () => {
    const serialized = serializeLegacyCredential({ iterations: 1000, salt: SALT, hash: HASH })
    expect(serialized).toBe(`legacy-pbkdf2-sha1$1000$${SALT}$${HASH}`)
    expect(parseLegacyCredential(serialized)).toEqual({ iterations: 1000, salt: SALT, hash: HASH })
  })

  it('refuses non-hex material rather than storing it', () => {
    expect(() => serializeLegacyCredential({ iterations: 1000, salt: 'not hex!', hash: HASH })).toThrow()
  })
})

describe('parseLegacyCredential', () => {
  it('returns null for a Better Auth scrypt hash', () => {
    // Better Auth stores `<salt>:<key>` — the common case on every login.
    expect(parseLegacyCredential(`${SALT}:${HASH}`)).toBeNull()
  })

  it('returns null for the wrong prefix or field count', () => {
    expect(parseLegacyCredential(`pbkdf2-sha1$1000$${SALT}$${HASH}`)).toBeNull()
    expect(parseLegacyCredential(`legacy-pbkdf2-sha1$1000$${SALT}`)).toBeNull()
    expect(parseLegacyCredential('')).toBeNull()
  })

  it('returns null for an unexpected iteration count instead of verifying wrongly', () => {
    expect(parseLegacyCredential(`legacy-pbkdf2-sha1$999$${SALT}$${HASH}`)).toBeNull()
  })

  it('returns null when salt or hash is not hex', () => {
    expect(parseLegacyCredential(`legacy-pbkdf2-sha1$1000$XYZ$${HASH}`)).toBeNull()
    expect(parseLegacyCredential(`legacy-pbkdf2-sha1$1000$${SALT}$`)).toBeNull()
  })
})

describe('isLegacyCredential', () => {
  it('distinguishes the two stored formats', () => {
    expect(isLegacyCredential(serializeLegacyCredential({ iterations: 1000, salt: SALT, hash: HASH }))).toBe(true)
    expect(isLegacyCredential(`${SALT}:${HASH}`)).toBe(false)
  })
})
