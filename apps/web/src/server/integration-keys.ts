import {
  API_KEY_ROTATION_OVERLAP_HOURS,
  API_KEY_SELF_ROTATION_MIN_INTERVAL_MINUTES,
  apiKeyPrefix,
  PARTNER_RATE_LIMITS,
  scopesToPermissions,
  type ApiKeyEnvironment,
  type ApiKeyMetadata,
  type IntegrationKey,
  type PartnerScope,
  type RotatedIntegrationKey,
} from '@fastehr/contracts'
import type { Db } from '@fastehr/db'
import { TRPCError } from '@trpc/server'
import { apiKeyEndpoints } from './auth.ts'

/**
 * Minting integration keys (ADR 36). One place that talks to the plugin's
 * `createApiKey`, used by the operator's script and by the partner's own
 * rotation, so both write the same row: the scopes as permissions, the
 * clinic's settings as metadata, the environment as the prefix, and the
 * per-key limit the chain relies on.
 */
export interface MintKeyInput {
  integrationId: string
  name: string
  environment: ApiKeyEnvironment
  scopes: readonly PartnerScope[]
  metadata: ApiKeyMetadata
  expiresInDays: number
}

export type MintKey = (input: MintKeyInput) => Promise<{ id: string; key: string }>

export const mintIntegrationKey: MintKey = async (input) => {
  const created = await apiKeyEndpoints().createApiKey({
    body: {
      userId: input.integrationId,
      name: input.name,
      prefix: apiKeyPrefix(input.environment),
      expiresIn: input.expiresInDays * 24 * 60 * 60,
      permissions: scopesToPermissions(input.scopes),
      metadata: input.metadata,
      rateLimitEnabled: true,
      rateLimitTimeWindow: 60 * 1000,
      rateLimitMax: PARTNER_RATE_LIMITS.perKeyPerMinute,
    },
  })
  return { id: created.id, key: created.key }
}

/**
 * The partner account replaces one of its own keys (ADR 36 as amended).
 *
 * What it may not do is the point: the new key copies the old one's scopes,
 * settings, and environment, so a login can never widen what a key reaches;
 * the first key is still the clinic's to issue, so the agreement date and
 * the allowlist stay in the clinic's hands; the old key keeps working for
 * the overlap; and a principal rotates at most once an hour, so a stolen
 * login cannot churn the vendor's live key into an outage. The new key is
 * returned once and stored nowhere.
 */
export async function rotateOwnKey(
  db: Db,
  mint: MintKey,
  { integrationId, keyId, now = new Date() }: { integrationId: string; keyId: string; now?: Date },
): Promise<RotatedIntegrationKey> {
  const integration = await db.integrations.find(integrationId)
  if (integration === null || !integration.isActive) throw new TRPCError({ code: 'FORBIDDEN' })

  const previous = integration.keys.find((key) => key.id === keyId)
  // Another principal's key id is indistinguishable from a missing one.
  if (previous === undefined) throw new TRPCError({ code: 'NOT_FOUND' })
  if (!previous.enabled || previous.metadata === null) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'key is revoked or cannot be copied; ask the clinic for a new one' })
  }

  const recent = integration.keys.find(
    (key) =>
      key.enabled &&
      key.id !== keyId &&
      now.getTime() - new Date(key.createdAt).getTime() < API_KEY_SELF_ROTATION_MIN_INTERVAL_MINUTES * 60 * 1000,
  )
  if (recent !== undefined) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'a key was rotated less than an hour ago' })

  const expiresInDays = remainingDays(previous, now)
  const metadata: ApiKeyMetadata = { ...previous.metadata, issuedBy: `self-service: ${integration.name}` }
  const minted = await mint({
    integrationId,
    name: previous.name,
    environment: previous.metadata.environment,
    scopes: previous.scopes,
    metadata,
    expiresInDays,
  })

  const previousExpiresAt = new Date(now.getTime() + API_KEY_ROTATION_OVERLAP_HOURS * 60 * 60 * 1000)
  await db.integrations.expireKeyAt(previous.id, previousExpiresAt)
  const issued = await db.integrations.findKey(minted.id)
  if (issued === null) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'the key was created but cannot be read back' })

  return { key: minted.key, issued, previousExpiresAt: previousExpiresAt.toISOString() }
}

/** The new key lives as long as the old one had left, never longer: rotation is not renewal. */
function remainingDays(previous: IntegrationKey, now: Date): number {
  if (previous.expiresAt === null) return 90
  const days = Math.ceil((new Date(previous.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  return Math.max(1, Math.min(365, days))
}
