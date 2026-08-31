import { pbkdf2Sync, timingSafeEqual } from 'node:crypto'
import { parseLegacyCredential } from '@fastehr/contracts'

/**
 * Verification for passwords migrated from the legacy system (ADR 26).
 *
 * The computation reproduces the legacy system's password check exactly:
 * PBKDF2-SHA1, the stored iteration count (always 1000), the salt passed as
 * the *hex string* — the legacy code never decoded it to bytes, so neither
 * does this — and a 64-byte derived key. Anything else and every migrated
 * password would simply stop working, silently.
 *
 * This is the only place in the codebase that runs the legacy KDF. It exists
 * to be deleted: the sign-in hook in `auth.ts` re-hashes to scrypt on each
 * successful legacy login, so this function's callers dwindle to zero as
 * staff sign in.
 */
export function verifyLegacyPassword(stored: string, password: string): boolean {
  const credential = parseLegacyCredential(stored)
  if (credential === null) return false

  const derived = pbkdf2Sync(password, credential.salt, credential.iterations, 64, 'sha1')
  const expected = Buffer.from(credential.hash, 'hex')

  // Length inequality means the stored hash is malformed, not merely wrong —
  // still a refusal, checked first because timingSafeEqual throws on it.
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}
