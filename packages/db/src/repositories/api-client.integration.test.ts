import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getPrismaClient } from '../client.ts'
import { db } from '../index.ts'

/**
 * Partner API clients against real PostgreSQL (ADR 36): the credential
 * match, what a read never yields, and the conditional revoke.
 */
const prisma = getPrismaClient()

const SECRET = 'not-a-real-secret-just-forty-three-chars-xx'
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex')

async function issue(overrides: Partial<Parameters<typeof db.apiClients.create>[0]> = {}) {
  return db.apiClients.create({
    name: 'Voice assistant',
    vendor: undefined,
    environment: 'dev',
    scopes: ['patients:lookup', 'patients:verify'],
    allowedIps: [],
    locationIds: ['sylmar'],
    baaSignedAt: undefined,
    issuedBy: 'ops@example.com',
    keyId: 'ABCDEFGH',
    keyHash: hash(SECRET),
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    ...overrides,
  })
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "patient_verification_attempts", "patient_verifications", "api_clients" RESTART IDENTITY CASCADE',
  )
})

describe('api client repository', () => {
  it('matches a key id and secret hash, and never returns the hash', async () => {
    const created = await issue()
    expect(created).not.toHaveProperty('keyHash')
    expect(created).toMatchObject({ keyId: 'ABCDEFGH', status: 'active', scopes: ['patients:lookup', 'patients:verify'] })

    const found = await db.apiClients.findByCredential({ keyId: 'ABCDEFGH', secretHash: hash(SECRET) })
    expect(found?.id).toBe(created.id)
    expect(found).not.toHaveProperty('keyHash')
  })

  it('refuses a wrong secret, an unknown key id, and a revoked client the same way', async () => {
    const created = await issue()
    expect(await db.apiClients.findByCredential({ keyId: 'ABCDEFGH', secretHash: hash('wrong') })).toBeNull()
    expect(await db.apiClients.findByCredential({ keyId: 'ZZZZZZZZ', secretHash: hash(SECRET) })).toBeNull()

    expect(await db.apiClients.revoke(created.id, new Date())).toMatchObject({ status: 'revoked' })
    expect(await db.apiClients.findByCredential({ keyId: 'ABCDEFGH', secretHash: hash(SECRET) })).toBeNull()
    // A second revoke changes nothing and says so.
    expect(await db.apiClients.revoke(created.id, new Date())).toBeNull()
  })

  it('keeps the key id unique', async () => {
    await issue()
    await expect(issue({ keyHash: hash('another') })).rejects.toThrow()
  })

  it('records the last use and a shortened expiry', async () => {
    const created = await issue()
    await db.apiClients.touchLastUsed(created.id, new Date('2026-09-17T12:00:00.000Z'))
    const shortened = await db.apiClients.expireAt(created.id, new Date('2026-09-18T12:00:00.000Z'))
    expect(shortened).toMatchObject({
      lastUsedAt: '2026-09-17T12:00:00.000Z',
      expiresAt: '2026-09-18T12:00:00.000Z',
    })
    expect((await db.apiClients.list()).map((client) => client.keyId)).toEqual(['ABCDEFGH'])
  })

  it('stores the BAA date as a calendar date', async () => {
    const created = await issue({ environment: 'live', baaSignedAt: '2026-09-01' })
    expect(created.baaSignedAt).toBe('2026-09-01')
  })
})
