import { apiKeyEndpoints } from '../auth.ts'

/**
 * The seam between the partner chain and Better Auth's api key plugin
 * (ADR 36). The chain hands a bearer token in and gets back one of three
 * answers; the plugin does the hashing, the lookup, the expiry, the
 * `enabled` check, and the per-key request counter. A test hands in a fake
 * with the same shape and never constructs the auth instance.
 */
export interface VerifiedApiKey {
  /** The key row's id: what the audit trail records as `apiKeyId`. */
  id: string
  /** The owner: an integration principal's user id. */
  referenceId: string
  name: string | null
  /** The plugin's permissions map; parsed into scopes by the contract. */
  permissions: unknown
  /** The plugin's metadata; parsed through `apiKeyMetadataSchema`. */
  metadata: unknown
}

export type KeyVerification =
  | { status: 'valid'; key: VerifiedApiKey }
  | { status: 'invalid' }
  | { status: 'rate_limited' }

export interface KeyVerifier {
  verify(token: string): Promise<KeyVerification>
}

export function betterAuthKeyVerifier(): KeyVerifier {
  return {
    async verify(token) {
      let result: Awaited<ReturnType<ReturnType<typeof apiKeyEndpoints>['verifyApiKey']>>
      try {
        result = await apiKeyEndpoints().verifyApiKey({ body: { key: token } })
      } catch {
        // The plugin throws for a few refusals (a banned owner, a malformed
        // body); to the chain they are all one `unauthenticated`.
        return { status: 'invalid' }
      }
      if (result.valid && result.key !== null) {
        const key = result.key
        return {
          status: 'valid',
          key: { id: key.id, referenceId: key.referenceId, name: key.name, permissions: key.permissions, metadata: key.metadata },
        }
      }
      if (result.error?.code === 'RATE_LIMIT_EXCEEDED') return { status: 'rate_limited' }
      return { status: 'invalid' }
    },
  }
}
