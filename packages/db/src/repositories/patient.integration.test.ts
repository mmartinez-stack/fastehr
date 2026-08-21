import { beforeEach, describe, expect, it } from 'vitest'
import { getPrismaClient } from '../client.ts'
import { db } from '../index.ts'

/**
 * The repository against real PostgreSQL, through real migrations.
 *
 * What only this level can prove: that `@db.Date` behaves as the mapper assumes
 * across the driver, that the public API returns contract shapes and not rows,
 * and that a row violating a contract is caught at the boundary rather than
 * flowing upward. The unit tests cover the mapper given a `Date`; they cannot
 * tell you the database hands it one.
 *
 * Runs under `TZ=America/Los_Angeles` (see vitest.integration.config.ts).
 */

const prisma = getPrismaClient()

const ADA = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: new Date('1815-12-10T00:00:00.000Z'),
}

const GRACE = {
  id: '8c2b6d3f-1e4a-4b7c-9d05-2f6a8b1c3e94',
  firstName: 'Grace',
  lastName: 'Hopper',
  dateOfBirth: new Date('1906-12-09T00:00:00.000Z'),
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "patients" RESTART IDENTITY CASCADE')
})

describe('patient repository', () => {
  it('returns contract shapes, not rows', async () => {
    await prisma.patient.create({ data: ADA })

    const patient = await db.patients.findById(ADA.id)

    expect(patient).toEqual({
      id: ADA.id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1815-12-10',
      email: null,
      phone: null,
    })
    // `createdAt` exists in the table and must not reach a caller.
    expect(patient).not.toHaveProperty('createdAt')
  })

  it('reads a DATE column as the calendar day it is, west of UTC', async () => {
    // The regression: converting through local time reports 1815-12-09 for a
    // process running in a western zone. Which is what this suite runs in.
    await prisma.patient.create({ data: ADA })

    const patient = await db.patients.findById(ADA.id)

    expect(patient?.dateOfBirth).toBe('1815-12-10')
    expect(new Date().getTimezoneOffset()).toBeGreaterThan(0) // confirms the zone is west
  })

  it('returns null for an id that does not exist', async () => {
    expect(await db.patients.findById('00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('orders by last name, then first', async () => {
    await prisma.patient.createMany({ data: [ADA, GRACE] })

    const patients = await db.patients.listByLastName()

    expect(patients.map((patient) => patient.lastName)).toEqual(['Hopper', 'Lovelace'])
  })

  it('creates a patient and returns the contract shape', async () => {
    const created = await db.patients.create({
      firstName: 'Grace',
      lastName: 'Hopper',
      dateOfBirth: '1906-12-09',
      email: 'grace@example.com',
      phone: '9515550000',
    })

    expect(created.email).toBe('grace@example.com')
    expect(created.phone).toBe('9515550000')
    // The round trip that matters west of UTC: the calendar day written is the
    // calendar day read back, through a real DATE column.
    expect(created.dateOfBirth).toBe('1906-12-09')
    expect(await db.patients.findById(created.id)).toEqual(created)
  })

  it('stores absent contact details as null', async () => {
    const created = await db.patients.create({
      firstName: 'Grace',
      lastName: 'Hopper',
      dateOfBirth: '1906-12-09',
    })

    expect(created.email).toBeNull()
    expect(created.phone).toBeNull()
  })

  it('rejects a stored row that violates the contract', async () => {
    // Rows can predate a constraint, arrive from an importer, or be written by
    // hand. The mapper parses rather than casts precisely so that such a row
    // fails at the boundary, named, instead of becoming a malformed id three
    // layers up.
    await prisma.patient.create({ data: { ...ADA, id: 'not-a-uuid' } })

    await expect(db.patients.findById('not-a-uuid')).rejects.toThrow()
  })
})
