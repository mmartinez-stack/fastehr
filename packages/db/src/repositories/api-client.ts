import { createHash, timingSafeEqual } from 'node:crypto'
import type { ApiClient, CreateApiClientInput } from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toApiClient } from '../mappers/api-client.ts'

/**
 * Partner API clients and their keys (ADR 37).
 *
 * The secret never reaches this package and the hash never leaves it. The
 * caller hands in the SHA-256 of the presented secret; the repository
 * compares it against the stored hash in constant time and returns the
 * client only on a match. An unknown key id compares against a dummy hash
 * so the two failures take the same time.
 */
export interface ApiClientRepository {
  /**
   * The active client whose key id and secret hash both match, or `null`.
   * Expiry is the caller's check, against its own clock, so a test can
   * inject one.
   */
  findByCredential(credential: { keyId: string; secretHash: string }): Promise<ApiClient | null>
  findById(id: string): Promise<ApiClient | null>
  /** Records a use; the caller decides how often (once a minute, not once a request). */
  touchLastUsed(id: string, at: Date): Promise<void>
  create(
    input: Omit<CreateApiClientInput, 'expiresInDays'> & { keyId: string; keyHash: string; expiresAt: Date },
  ): Promise<ApiClient>
  list(): Promise<ApiClient[]>
  /** Conditional: revokes an active client and returns it; `null` when it was not active. */
  revoke(id: string, at: Date): Promise<ApiClient | null>
  /** Shortens an active key's life to `expiresAt` (the rotation overlap); `null` when it was not active. */
  expireAt(id: string, expiresAt: Date): Promise<ApiClient | null>
}

const DUMMY_HASH = createHash('sha256').update('no such key').digest('hex')

function hashesMatch(presented: string, stored: string): boolean {
  const a = Buffer.from(presented, 'hex')
  const b = Buffer.from(stored, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createApiClientRepository(getClient: () => PrismaClient): ApiClientRepository {
  return {
    async findByCredential({ keyId, secretHash }) {
      const row = await getClient().apiClient.findUnique({ where: { keyId } })
      const matched = hashesMatch(secretHash, row?.keyHash ?? DUMMY_HASH)
      if (row === null || !matched || row.status !== 'active') return null
      return toApiClient(row)
    },

    async findById(id) {
      const row = await getClient().apiClient.findUnique({ where: { id } })
      return row === null ? null : toApiClient(row)
    },

    async touchLastUsed(id, at) {
      await getClient().apiClient.updateMany({ where: { id }, data: { lastUsedAt: at } })
    },

    async create(input) {
      const row = await getClient().apiClient.create({
        data: {
          name: input.name,
          vendor: input.vendor ?? null,
          environment: input.environment,
          keyId: input.keyId,
          keyHash: input.keyHash,
          scopes: [...input.scopes],
          allowedIps: [...input.allowedIps],
          locationIds: [...input.locationIds],
          expiresAt: input.expiresAt,
          baaSignedAt: input.baaSignedAt === undefined ? null : new Date(`${input.baaSignedAt}T00:00:00.000Z`),
          issuedBy: input.issuedBy,
        },
      })
      return toApiClient(row)
    },

    async list() {
      const rows = await getClient().apiClient.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] })
      return rows.map(toApiClient)
    },

    async revoke(id, at) {
      const client = getClient()
      const { count } = await client.apiClient.updateMany({
        where: { id, status: 'active' },
        data: { status: 'revoked', revokedAt: at },
      })
      if (count === 0) return null
      const row = await client.apiClient.findUniqueOrThrow({ where: { id } })
      return toApiClient(row)
    },

    async expireAt(id, expiresAt) {
      const client = getClient()
      const { count } = await client.apiClient.updateMany({ where: { id, status: 'active' }, data: { expiresAt } })
      if (count === 0) return null
      const row = await client.apiClient.findUniqueOrThrow({ where: { id } })
      return toApiClient(row)
    },
  }
}
