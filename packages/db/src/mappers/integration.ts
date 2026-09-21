import {
  apiKeyMetadataSchema,
  integrationKeySchema,
  integrationSchema,
  permissionsToScopes,
  type Integration,
  type IntegrationKey,
} from '@fastehr/contracts'
import type { ApiKey as ApiKeyRow, User as UserRow } from '../generated/client/client.ts'

/**
 * Row → contract mapping for an integration principal and its keys (ADR 36).
 *
 * Two columns stay behind on purpose: `key`, the hash the plugin compares
 * against, and `email`, the synthetic address the principal exists under.
 * `permissions` and `metadata` are JSON text the plugin wrote; each is
 * parsed through its contract, and a value that does not fit becomes an
 * empty scope list or a `null` metadata rather than a permission.
 */
function parseJson(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

export function toIntegrationKey(row: ApiKeyRow): IntegrationKey {
  const metadata = apiKeyMetadataSchema.safeParse(parseJson(row.metadata))
  return integrationKeySchema.parse({
    id: row.id,
    integrationId: row.referenceId,
    name: row.name ?? 'unnamed',
    start: row.start,
    scopes: permissionsToScopes(parseJson(row.permissions)),
    enabled: row.enabled,
    expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
    lastUsedAt: row.lastRequest === null ? null : row.lastRequest.toISOString(),
    createdAt: row.createdAt.toISOString(),
    metadata: metadata.success ? metadata.data : null,
  })
}

export function toIntegration(row: UserRow & { apiKeys: ApiKeyRow[] }): Integration {
  return integrationSchema.parse({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    keys: row.apiKeys.map(toIntegrationKey),
  })
}
