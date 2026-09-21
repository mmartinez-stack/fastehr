/**
 * The partner API key format (ADR 37).
 *
 *   fehr_<env>_<keyId>_<secret>
 *
 * `env` is `live` or `dev`, for a human reading a key in a support ticket;
 * it is not a control (a dev key presented to production fails as any
 * unknown key does, because keys are rows in each environment's database).
 * `keyId` is eight base32 characters stored in clear and indexed, so the
 * server can find the row without a secret ever touching an index. `secret`
 * is 32 random bytes, base64url; only its SHA-256 is stored.
 *
 * This module is pure string handling so the issuing CLI in `packages/db`
 * and the authenticator in the server layer agree on one grammar.
 */

export const API_KEY_ENVIRONMENTS = ['live', 'dev'] as const
export type ApiKeyEnvironment = (typeof API_KEY_ENVIRONMENTS)[number]

export const API_KEY_ID_LENGTH = 8
/** Crockford-style base32 without the ambiguous letters: what a key id is made of. */
export const API_KEY_ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const KEY_PATTERN = /^fehr_(live|dev)_([0-9A-HJKMNP-TV-Z]{8})_([A-Za-z0-9_-]{43})$/

export interface ParsedApiKey {
  environment: ApiKeyEnvironment
  keyId: string
  secret: string
}

export function formatApiKey(parts: ParsedApiKey): string {
  return `fehr_${parts.environment}_${parts.keyId}_${parts.secret}`
}

/** `null` for anything that is not a well-formed key; the caller answers `unauthenticated` either way. */
export function parseApiKey(value: string): ParsedApiKey | null {
  const match = KEY_PATTERN.exec(value)
  if (match === null) return null
  const [, environment, keyId, secret] = match
  if (environment === undefined || keyId === undefined || secret === undefined) return null
  return { environment: environment as ApiKeyEnvironment, keyId, secret }
}

/** The bearer token from an `Authorization` header, or `null` when the scheme is not Bearer. */
export function bearerToken(authorization: string | null): string | null {
  if (authorization === null) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization)
  return match?.[1] ?? null
}
