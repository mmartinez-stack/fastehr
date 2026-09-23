import type { Integration, IntegrationKey } from '@fastehr/contracts'
import type { IntegrationRepository } from '@fastehr/db'
import { describe, expect, it, vi } from 'vitest'
import { rotateOwnKey, type MintKey } from './integration-keys.ts'
import { fakeDb, stubRepository } from './test-support/fake-db.ts'

/**
 * Self-service rotation (ADR 36 as amended): what a partner login may and
 * may not do to its own keys, with a fake mint standing in for the plugin.
 */
const NOW = new Date('2026-09-23T12:00:00.000Z')

function key(overrides: Partial<IntegrationKey> = {}): IntegrationKey {
  return {
    id: 'key-1',
    integrationId: 'integration-1',
    name: 'Voice assistant',
    start: 'fehr_dev_abcde',
    scopes: ['patients:lookup', 'patients:verify'],
    enabled: true,
    expiresAt: '2026-10-03T12:00:00.000Z',
    lastUsedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    metadata: { environment: 'dev', vendor: 'Acme', allowedIps: ['203.0.113.5/32'], locationIds: ['sylmar'], baaSignedAt: null, issuedBy: 'ops' },
    ...overrides,
  }
}

function harness(keys: IntegrationKey[], isActive = true) {
  const integration: Integration = { id: 'integration-1', name: 'Voice assistant', isActive, hasCredential: true, createdAt: '2026-09-01T00:00:00.000Z', keys }
  const expired: Array<{ id: string; at: Date }> = []
  const repo: IntegrationRepository = {
    ...stubRepository<IntegrationRepository>('integrations'),
    async find(id) {
      return id === 'integration-1' ? integration : null
    },
    async expireKeyAt(id, at) {
      expired.push({ id, at })
      return key({ id, expiresAt: at.toISOString() })
    },
    async findKey(id) {
      return id === 'key-new' ? key({ id: 'key-new', start: 'fehr_dev_newww', createdAt: NOW.toISOString() }) : null
    },
  }
  const mint = vi.fn<MintKey>(async () => ({ id: 'key-new', key: 'fehr_dev_newww-secret' }))
  return { db: fakeDb({ integrations: repo }), mint, expired }
}

describe('rotateOwnKey', () => {
  it('mints a copy of the key, hands the secret back once, and gives the old key a day', async () => {
    const { db, mint, expired } = harness([key()])
    const result = await rotateOwnKey(db, mint, { integrationId: 'integration-1', keyId: 'key-1', now: NOW })

    expect(result.key).toBe('fehr_dev_newww-secret')
    expect(result.issued.id).toBe('key-new')
    expect(result.previousExpiresAt).toBe('2026-09-24T12:00:00.000Z')
    expect(expired).toEqual([{ id: 'key-1', at: new Date('2026-09-24T12:00:00.000Z') }])
    expect(mint).toHaveBeenCalledWith({
      integrationId: 'integration-1',
      name: 'Voice assistant',
      environment: 'dev',
      scopes: ['patients:lookup', 'patients:verify'],
      metadata: { environment: 'dev', vendor: 'Acme', allowedIps: ['203.0.113.5/32'], locationIds: ['sylmar'], baaSignedAt: null, issuedBy: 'self-service: Voice assistant' },
      // The old key had ten days left: rotation is not renewal.
      expiresInDays: 10,
    })
  })

  it("refuses another principal's key, a revoked key, and a deactivated principal", async () => {
    const other = harness([key({ id: 'theirs', integrationId: 'integration-2' })])
    await expect(rotateOwnKey(other.db, other.mint, { integrationId: 'integration-1', keyId: 'nope', now: NOW })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const revoked = harness([key({ enabled: false })])
    await expect(rotateOwnKey(revoked.db, revoked.mint, { integrationId: 'integration-1', keyId: 'key-1', now: NOW })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    const off = harness([key()], false)
    await expect(rotateOwnKey(off.db, off.mint, { integrationId: 'integration-1', keyId: 'key-1', now: NOW })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(other.mint).not.toHaveBeenCalled()
    expect(revoked.mint).not.toHaveBeenCalled()
  })

  it('rotates at most once an hour', async () => {
    const recent = key({ id: 'key-2', createdAt: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString() })
    const { db, mint } = harness([key(), recent])
    await expect(rotateOwnKey(db, mint, { integrationId: 'integration-1', keyId: 'key-1', now: NOW })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    const older = harness([key(), key({ id: 'key-2', createdAt: new Date(NOW.getTime() - 61 * 60 * 1000).toISOString() })])
    await expect(rotateOwnKey(older.db, older.mint, { integrationId: 'integration-1', keyId: 'key-1', now: NOW })).resolves.toBeDefined()
  })
})
