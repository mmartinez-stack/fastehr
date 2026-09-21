import { randomUUID } from 'node:crypto'
import type { Integration, IntegrationKey } from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toIntegration, toIntegrationKey } from '../mappers/integration.ts'

/**
 * Integration principals and their keys (ADR 36).
 *
 * A principal is a `users` row with the `integration` role: it exists so
 * the audit trail has an actor to name and so `isActive` is one switch for
 * every key it holds. The keys are Better Auth's rows: minted and verified
 * by the plugin, never here. What this repository does with a key row is
 * read it for the Users screen and the CLI, and end it: a shortened expiry
 * for the rotation overlap, `enabled = false` for a revocation. Neither the
 * key nor its hash is ever returned.
 */
export interface IntegrationRepository {
  /** The active integration behind a key, or `null`: an inactive principal refuses every key it holds. */
  findActive(id: string): Promise<{ id: string; name: string } | null>
  /**
   * The principal for an integration name, created on first use. The
   * synthetic email is the uniqueness key; nobody signs in with it.
   */
  findOrCreate(input: { name: string }): Promise<{ id: string; name: string; isActive: boolean }>
  list(): Promise<Integration[]>
  findKey(keyId: string): Promise<IntegrationKey | null>
  /** Shortens an enabled key's life to `expiresAt` (the rotation overlap); `null` when the key is not enabled. */
  expireKeyAt(keyId: string, expiresAt: Date): Promise<IntegrationKey | null>
  /** Disables a key at once; `null` when it was not enabled. */
  disableKey(keyId: string): Promise<IntegrationKey | null>
}

/** The address an integration principal exists under. Not a mailbox; nothing is ever sent to it. */
export function integrationEmail(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `integration+${slug || 'unnamed'}@fastehr.invalid`
}

export function createIntegrationRepository(getClient: () => PrismaClient): IntegrationRepository {
  return {
    async findActive(id) {
      const row = await getClient().user.findUnique({ where: { id }, select: { id: true, name: true, role: true, isActive: true } })
      if (row === null || row.role !== 'integration' || !row.isActive) return null
      return { id: row.id, name: row.name }
    },

    async findOrCreate({ name }) {
      const client = getClient()
      const email = integrationEmail(name)
      const existing = await client.user.findUnique({ where: { email } })
      if (existing !== null) {
        if (existing.role !== 'integration') throw new Error(`${email} exists and is not an integration`)
        return { id: existing.id, name: existing.name, isActive: existing.isActive }
      }
      const row = await client.user.create({
        data: { id: randomUUID(), name, email, role: 'integration', emailVerified: false },
      })
      return { id: row.id, name: row.name, isActive: row.isActive }
    },

    async list() {
      const rows = await getClient().user.findMany({
        where: { role: 'integration' },
        orderBy: [{ name: 'asc' }],
        include: { apiKeys: { orderBy: [{ createdAt: 'asc' }] } },
      })
      return rows.map(toIntegration)
    },

    async findKey(keyId) {
      const row = await getClient().apiKey.findUnique({ where: { id: keyId } })
      return row === null ? null : toIntegrationKey(row)
    },

    async expireKeyAt(keyId, expiresAt) {
      const client = getClient()
      const { count } = await client.apiKey.updateMany({ where: { id: keyId, enabled: true }, data: { expiresAt, updatedAt: new Date() } })
      if (count === 0) return null
      return toIntegrationKey(await client.apiKey.findUniqueOrThrow({ where: { id: keyId } }))
    },

    async disableKey(keyId) {
      const client = getClient()
      const { count } = await client.apiKey.updateMany({ where: { id: keyId, enabled: true }, data: { enabled: false, updatedAt: new Date() } })
      if (count === 0) return null
      return toIntegrationKey(await client.apiKey.findUniqueOrThrow({ where: { id: keyId } }))
    },
  }
}
