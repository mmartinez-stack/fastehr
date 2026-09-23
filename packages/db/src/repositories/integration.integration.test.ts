import { beforeEach, describe, expect, it } from 'vitest'
import { getPrismaClient } from '../client.ts'
import { db } from '../index.ts'
import { integrationEmail } from './integration.ts'

/**
 * Integration principals and what the application reads of their keys,
 * against real PostgreSQL (ADR 36): the principal is found or created by
 * name, an inactive one refuses every key, and a key row (written here the
 * way the plugin writes one) is read back without its hash and ended by
 * expiry or revocation.
 */
const prisma = getPrismaClient()

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "api_keys", "users" RESTART IDENTITY CASCADE')
})

async function writeKey(referenceId: string, id = 'key-1') {
  return prisma.apiKey.create({
    data: {
      id,
      name: 'Voice assistant',
      start: 'fehr_dev_abcde',
      prefix: 'fehr_dev_',
      key: 'not-the-key-its-hash',
      referenceId,
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-17T12:00:00.000Z'),
      updatedAt: new Date('2026-09-17T12:00:00.000Z'),
      permissions: JSON.stringify({ patients: ['lookup', 'verify'], queue: ['read'], retired: ['thing'] }),
      metadata: JSON.stringify({ environment: 'dev', issuedBy: 'ops@example.com', allowedIps: ['203.0.113.5/32'] }),
    },
  })
}

describe('integration repository', () => {
  it('finds or creates the principal by name, as an integration with no credential', async () => {
    const created = await db.integrations.findOrCreate({ name: 'Voice assistant' })
    const again = await db.integrations.findOrCreate({ name: 'Voice Assistant' })
    expect(again.id).toBe(created.id)
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id } })
    expect(row).toMatchObject({ role: 'integration', email: integrationEmail('Voice assistant'), isActive: true })
    expect(await prisma.account.count()).toBe(0)
    expect(await db.integrations.find(created.id)).toMatchObject({ id: created.id, hasCredential: false, keys: [] })

    // With a real address, the partner's team can later sign in to their page.
    const withLogin = await db.integrations.findOrCreate({ name: 'Voice assistant login', email: 'integrations@vendor.example' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: withLogin.id } })).email).toBe('integrations@vendor.example')
    expect((await db.integrations.findOrCreate({ name: 'renamed', email: 'integrations@vendor.example' })).id).toBe(withLogin.id)
    // People are listed apart: the staff list never shows a principal.
    expect(await db.staffUsers.list()).toEqual([])
  })

  it('refuses a person and an inactive principal as a key owner', async () => {
    const person = await db.staffUsers.create({ name: 'Ada', email: 'ada@example.com', role: 'admin' })
    expect(await db.integrations.findActive(person.id)).toBeNull()
    expect(await db.integrations.find(person.id)).toBeNull()
    const integration = await db.integrations.findOrCreate({ name: 'Voice assistant' })
    expect(await db.integrations.findActive(integration.id)).toEqual({ id: integration.id, name: 'Voice assistant' })
    await prisma.user.update({ where: { id: integration.id }, data: { isActive: false } })
    expect(await db.integrations.findActive(integration.id)).toBeNull()
  })

  it('reads a key without its hash, with only known scopes, and ends it by expiry or revocation', async () => {
    const integration = await db.integrations.findOrCreate({ name: 'Voice assistant' })
    await writeKey(integration.id)

    const [listed] = await db.integrations.list()
    expect(listed?.keys).toHaveLength(1)
    const key = listed?.keys[0]
    expect(key).toMatchObject({
      id: 'key-1',
      integrationId: integration.id,
      start: 'fehr_dev_abcde',
      scopes: ['patients:lookup', 'patients:verify', 'queue:read'],
      enabled: true,
      metadata: { environment: 'dev', allowedIps: ['203.0.113.5/32'], locationIds: [], issuedBy: 'ops@example.com' },
    })
    expect(JSON.stringify(key)).not.toContain('not-the-key')

    const shortened = await db.integrations.expireKeyAt('key-1', new Date('2026-09-18T12:00:00.000Z'))
    expect(shortened?.expiresAt).toBe('2026-09-18T12:00:00.000Z')
    expect(await db.integrations.disableKey('key-1')).toMatchObject({ enabled: false })
    expect(await db.integrations.disableKey('key-1')).toBeNull()
    expect(await db.integrations.expireKeyAt('key-1', new Date())).toBeNull()
    expect(await db.integrations.findKey('nope')).toBeNull()
  })

  it('reads a row whose settings no longer parse as scopeless and without metadata', async () => {
    const integration = await db.integrations.findOrCreate({ name: 'Voice assistant' })
    await prisma.apiKey.create({
      data: {
        id: 'key-2',
        key: 'hash',
        referenceId: integration.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        permissions: 'patients:lookup',
        metadata: '{not json',
      },
    })
    expect(await db.integrations.findKey('key-2')).toMatchObject({ name: 'unnamed', scopes: [], metadata: null, expiresAt: null })
  })
})
