import { beforeEach, describe, expect, it } from 'vitest'
import { getPrismaClient } from '../client.ts'
import { db } from '../index.ts'

/**
 * Locations against real PostgreSQL (ADR 32): the seed the migration wrote,
 * and the clinic the patient repository derives from the office it writes.
 */

const prisma = getPrismaClient()

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "patients" RESTART IDENTITY CASCADE')
})

const ADA = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female' as const,
  dateOfBirth: '1985-12-10',
  language: undefined,
  office: 'PennProgram' as const,
  email: undefined,
  addressStreet: '10 Analytical Way',
  addressCity: 'Pasadena',
  addressState: 'CA',
  addressZip: '91101',
  phone: '9515550000',
  phoneFollowUpAllowed: true,
  referralSource: undefined,
  referredByPatientId: undefined,
  programType: undefined,
  heightInches: 64,
  medications: [],
  conditions: [],
  pcpName: undefined,
  pcpAddress: undefined,
  pcpPhone: undefined,
  creditCardNumber: undefined,
  creditCardExpMonth: undefined,
  creditCardExpYear: undefined,
  creditCardZip: undefined,
}

describe('locations', () => {
  it('are seeded by the migration: two active clinics and Montebello inactive, in order', async () => {
    expect((await db.locations.list()).map((row) => `${row.slug}:${row.active ? 'on' : 'off'}`)).toEqual([
      'sylmar:on',
      'kanoga:on',
      'montebello:off',
    ])
    expect((await db.locations.listActive()).map((row) => row.slug)).toEqual(['sylmar', 'kanoga'])
    expect((await db.locations.list()).find((row) => row.slug === 'kanoga')).toMatchObject({
      name: 'Kanoga',
      legacyName: 'PennProgram',
    })
  })

  it('are derived from the office a patient is written with, and cleared with it', async () => {
    const created = await db.patients.create(ADA)
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: created.id } })).locationId).toBe('kanoga')

    await db.patients.updateDemographics({ ...ADA, id: created.id, office: 'Telemedicine' })
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: created.id } })).locationId).toBeNull()

    await db.patients.updateDemographics({ ...ADA, id: created.id, office: 'Sylmar' })
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: created.id } })).locationId).toBe('sylmar')
  })
})
