import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getPrismaClient } from '../client.ts'
import { db } from '../index.ts'

/**
 * Verification tokens and the attempt counter against real PostgreSQL
 * (ADR 36): only the hash is stored, and failures count per patient and per
 * client inside a window.
 */
const prisma = getPrismaClient()

const ADA = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: new Date('1815-12-10T00:00:00.000Z'),
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

let clientId: string

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "patient_verification_attempts", "patient_verifications", "api_clients", "patients" RESTART IDENTITY CASCADE',
  )
  await prisma.patient.create({ data: ADA })
  const client = await db.apiClients.create({
    name: 'Voice assistant',
    vendor: undefined,
    environment: 'dev',
    scopes: ['patients:verify'],
    allowedIps: [],
    locationIds: [],
    baaSignedAt: undefined,
    issuedBy: 'ops@example.com',
    keyId: 'ABCDEFGH',
    keyHash: hash('secret'),
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
  })
  clientId = client.id
})

describe('verification repository', () => {
  it('stores a token by hash only and finds it by hash', async () => {
    const created = await db.verifications.create({
      apiClientId: clientId,
      patientId: ADA.id,
      tokenHash: hash('token'),
      method: 'dob_phone',
      expiresAt: new Date('2026-09-17T12:15:00.000Z'),
      requestId: 'r-1',
      ipAddress: '203.0.113.5',
    })
    expect(created).not.toHaveProperty('tokenHash')
    expect(created).toMatchObject({ apiClientId: clientId, patientId: ADA.id, method: 'dob_phone', useCount: 0 })

    expect((await db.verifications.findByTokenHash(hash('token')))?.id).toBe(created.id)
    expect(await db.verifications.findByTokenHash(hash('other'))).toBeNull()

    await db.verifications.markUsed(created.id, new Date('2026-09-17T12:05:00.000Z'))
    expect(await db.verifications.findByTokenHash(hash('token'))).toMatchObject({
      useCount: 1,
      lastUsedAt: '2026-09-17T12:05:00.000Z',
    })
  })

  it('counts failures per patient and per client inside the window', async () => {
    const since = new Date(Date.now() - 15 * 60 * 1000)
    for (let i = 0; i < 3; i += 1) {
      await db.verifications.recordAttempt({ apiClientId: clientId, patientId: ADA.id, succeeded: false, ipAddress: null })
    }
    await db.verifications.recordAttempt({ apiClientId: clientId, patientId: 'unknown-id', succeeded: false, ipAddress: null })
    await db.verifications.recordAttempt({ apiClientId: clientId, patientId: ADA.id, succeeded: true, ipAddress: null })

    expect(await db.verifications.countFailedAttempts({ apiClientId: clientId, patientId: ADA.id, since })).toBe(3)
    expect(await db.verifications.countFailedAttempts({ apiClientId: clientId, since })).toBe(4)
    expect(
      await db.verifications.countFailedAttempts({ apiClientId: clientId, since: new Date(Date.now() + 60_000) }),
    ).toBe(0)
    expect(await db.verifications.lastSuccessAt({ apiClientId: clientId, patientId: ADA.id })).toBeInstanceOf(Date)
    expect(await db.verifications.lastSuccessAt({ apiClientId: clientId, patientId: 'unknown-id' })).toBeNull()
  })
})
