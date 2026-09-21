/**
 * The partner API key, as the vendor sees it (ADR 36, ADR 38).
 *
 * Keys are Better Auth's `apiKey` rows: minted by the plugin, hashed at rest
 * by the plugin, carried as `Authorization: Bearer <key>`. This module
 * owns only what the two sides must agree on: the bearer grammar and the
 * human-readable prefix, `fehr_<env>_`, which says which environment issued
 * a key when one turns up in a support ticket. The prefix is not a control;
 * a key is a row in one environment's database and means nothing elsewhere.
 */

export const API_KEY_ENVIRONMENTS = ['live', 'dev'] as const
export type ApiKeyEnvironment = (typeof API_KEY_ENVIRONMENTS)[number]

export const API_KEY_PREFIX = 'fehr_'

export function apiKeyPrefix(environment: ApiKeyEnvironment): string {
  return `${API_KEY_PREFIX}${environment}_`
}

/** The longest bearer token the chain reads before answering `unauthenticated`. */
export const API_KEY_MAX_LENGTH = 128

/** The bearer token from an `Authorization` header, or `null` when the scheme is not Bearer. */
export function bearerToken(authorization: string | null): string | null {
  if (authorization === null) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization)
  const token = match?.[1] ?? null
  return token !== null && token.length <= API_KEY_MAX_LENGTH ? token : null
}
