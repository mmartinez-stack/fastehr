import { z } from 'zod'

/**
 * The stored form of a password migrated from the legacy system — the contract
 * between `packages/db/scripts/migrate-users.ts` (which writes it into
 * `Account.password`) and the auth server's verifier (which recognises and
 * checks it). See ADR 26.
 *
 * Legacy verification was `crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha1')`
 * hex-compared against the stored `hash` (see the users section of
 * docs/legacy-data-mapping.md). Both values are carried verbatim inside a
 * single string:
 *
 *   legacy-pbkdf2-sha1$1000$<salt hex>$<hash hex>
 *
 * The `$` separator cannot collide with Better Auth's own scrypt format
 * (`<salt>:<key>`), so a stored password is unambiguously one or the other.
 * Iterations are written into the string rather than assumed, so a record
 * hashed under a different legacy cost would fail parsing loudly instead of
 * verifying wrongly.
 *
 * This module is string shape only — the actual PBKDF2 computation lives with
 * the verifier, which is the only place that should ever run it.
 */

export const LEGACY_CREDENTIAL_PREFIX = 'legacy-pbkdf2-sha1'

const hex = z.string().regex(/^[0-9a-f]+$/)

export const legacyCredentialSchema = z.object({
  /** PBKDF2 iteration count — always 1000 in the legacy system. */
  iterations: z.literal(1000),
  /** The per-user salt, hex (legacy generated 16 random bytes → 32 chars). */
  salt: hex,
  /** The derived key, hex (legacy derived 64 bytes → 128 chars). */
  hash: hex,
})

export type LegacyCredential = z.infer<typeof legacyCredentialSchema>

export function serializeLegacyCredential(credential: LegacyCredential): string {
  const parsed = legacyCredentialSchema.parse(credential)
  return `${LEGACY_CREDENTIAL_PREFIX}$${parsed.iterations}$${parsed.salt}$${parsed.hash}`
}

/**
 * `null` for anything that is not a well-formed legacy credential string —
 * including a scrypt hash, which is the common case on every login by a
 * non-migrated account. Callers treat `null` as "not legacy", never as an
 * error.
 */
export function parseLegacyCredential(value: string): LegacyCredential | null {
  const parts = value.split('$')
  if (parts.length !== 4 || parts[0] !== LEGACY_CREDENTIAL_PREFIX) return null

  const result = legacyCredentialSchema.safeParse({
    iterations: Number(parts[1]),
    salt: parts[2],
    hash: parts[3],
  })
  return result.success ? result.data : null
}

export function isLegacyCredential(value: string): boolean {
  return parseLegacyCredential(value) !== null
}
