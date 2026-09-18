import { apiClientSchema, type ApiClient } from '@fastehr/contracts'
import type { ApiClient as ApiClientRow } from '../generated/client/client.ts'
import { toCalendarDate } from './patient.ts'

/**
 * Row → contract mapping for `ApiClient`, on the patient mapper's two rules:
 * every field listed, the result parsed. One column stays behind on
 * purpose: `keyHash`. A read of a client must never yield anything a key
 * could be reconstructed or compared from outside the repository.
 */
export function toApiClient(row: ApiClientRow): ApiClient {
  return apiClientSchema.parse({
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    environment: row.environment,
    keyId: row.keyId,
    scopes: row.scopes,
    allowedIps: row.allowedIps,
    locationIds: row.locationIds,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt === null ? null : row.lastUsedAt.toISOString(),
    baaSignedAt: row.baaSignedAt === null ? null : toCalendarDate(row.baaSignedAt),
    issuedBy: row.issuedBy,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt === null ? null : row.revokedAt.toISOString(),
  })
}
