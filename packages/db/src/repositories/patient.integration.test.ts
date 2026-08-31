import { beforeEach, describe, expect, it } from 'vitest'
import type { CreatePatientInput } from '@fastehr/contracts'
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

/** A full legacy-form submission, post-contract-parse (the router's output). */
const GRACE_INPUT: CreatePatientInput = {
  firstName: 'Grace',
  lastName: 'Hopper',
  gender: 'female',
  heightInches: 60,
  dateOfBirth: '1906-12-09',
  healthyWeight: 120,
  language: 'english',
  office: 'Sylmar',
  email: 'grace@example.com',
  addressStreet: '1 Navy Way',
  addressCity: 'Arlington',
  addressState: 'VA',
  addressZip: '22202',
  phone: '9515550000',
  phoneFollowUpAllowed: true,
  referralSource: 'word of mouth',
  referredByPatientId: undefined,
  historyNotes: 'None pertinent.',
  programType: undefined,
  creditCardNumber: '4111111111111111',
  creditCardExpMonth: '12',
  creditCardExpYear: '2030',
  creditCardZip: '90210',
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
      gender: null,
      heightInches: null,
      healthyWeight: null,
      language: null,
      office: null,
      email: null,
      phone: null,
      phoneFollowUpAllowed: true,
      addressStreet: null,
      addressCity: null,
      addressState: null,
      addressZip: null,
      referralSource: null,
      referredByPatientId: null,
      historyNotes: null,
      programType: null,
      status: 'active',
      creditCardNumber: null,
      creditCardExpMonth: null,
      creditCardExpYear: null,
      creditCardZip: null,
    })
    // Bookkeeping columns exist in the table and must not reach a caller.
    expect(patient).not.toHaveProperty('createdAt')
    expect(patient).not.toHaveProperty('legacyId')
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

  it('lists the most recently created first, capped at thirty', async () => {
    await prisma.patient.create({ data: { ...ADA, createdAt: new Date('2026-01-01T00:00:00Z') } })
    await prisma.patient.create({ data: { ...GRACE, createdAt: new Date('2026-02-01T00:00:00Z') } })

    const patients = await db.patients.listRecent()

    expect(patients.map((patient) => patient.firstName)).toEqual(['Grace', 'Ada'])
  })

  it('creates a patient from the full form input and round-trips it', async () => {
    const created = await db.patients.create(GRACE_INPUT)

    expect(created).toMatchObject({
      firstName: 'Grace',
      gender: 'female',
      heightInches: 60,
      healthyWeight: 120,
      language: 'english',
      office: 'Sylmar',
      email: 'grace@example.com',
      addressStreet: '1 Navy Way',
      addressState: 'VA',
      phone: '9515550000',
      phoneFollowUpAllowed: true,
      referralSource: 'word of mouth',
      historyNotes: 'None pertinent.',
      programType: null,
      status: 'active',
      creditCardNumber: '4111111111111111',
      creditCardExpMonth: '12',
      creditCardExpYear: '2030',
      creditCardZip: '90210',
    })
    // The round trip that matters west of UTC: the calendar day written is the
    // calendar day read back, through a real DATE column.
    expect(created.dateOfBirth).toBe('1906-12-09')
    expect(await db.patients.findById(created.id)).toEqual(created)
  })

  it('stores absent optional fields as null', async () => {
    const created = await db.patients.create({
      ...GRACE_INPUT,
      healthyWeight: undefined,
      language: undefined,
      office: undefined,
      email: undefined,
      referralSource: undefined,
      historyNotes: undefined,
    })

    expect(created.healthyWeight).toBeNull()
    expect(created.language).toBeNull()
    expect(created.office).toBeNull()
    expect(created.email).toBeNull()
    expect(created.referralSource).toBeNull()
    expect(created.historyNotes).toBeNull()
  })

  it('updates every form field and clears the ones an update leaves blank', async () => {
    const created = await db.patients.create(GRACE_INPUT)

    const updated = await db.patients.update({
      ...GRACE_INPUT,
      id: created.id,
      lastName: 'Hopper-Murray',
      office: 'At Home',
      programType: 'Basic Program',
      healthyWeight: undefined, // cleared on the form → cleared in the row
    })

    expect(updated.lastName).toBe('Hopper-Murray')
    expect(updated.office).toBe('At Home')
    expect(updated.programType).toBe('Basic Program')
    expect(updated.healthyWeight).toBeNull()
    expect(updated.status).toBe('active') // update never touches status
    expect(await db.patients.findById(created.id)).toEqual(updated)
  })

  it('sets status without touching anything else', async () => {
    const created = await db.patients.create(GRACE_INPUT)

    const deactivated = await db.patients.setStatus({ id: created.id, status: 'inactive' })

    expect(deactivated).toEqual({ ...created, status: 'inactive' })
  })

  it('links a referred-by patient through the self-relation', async () => {
    const referrer = await db.patients.create(GRACE_INPUT)
    const referred = await db.patients.create({
      ...GRACE_INPUT,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: undefined,
      referralSource: 'another patient',
      referredByPatientId: referrer.id,
    })

    expect(referred.referredByPatientId).toBe(referrer.id)
  })

  it('searches one word against either name, exact and case-insensitive', async () => {
    await prisma.patient.createMany({ data: [ADA, GRACE] })

    expect(
      (await db.patients.search({ query: { kind: 'name', name: 'hopper' } })).map((p) => p.id),
    ).toEqual([GRACE.id])
    // Exact match, not substring — "hop" finds nobody.
    expect(await db.patients.search({ query: { kind: 'name', name: 'hop' } })).toEqual([])
    // A first name finds the patient too — one input, either field.
    expect(
      (await db.patients.search({ query: { kind: 'name', name: 'ada' } })).map((p) => p.id),
    ).toEqual([ADA.id])
  })

  it('searches a full name in both orientations', async () => {
    await prisma.patient.createMany({ data: [ADA, GRACE] })

    const asTyped = { kind: 'fullName', firstName: 'grace', lastName: 'hopper' } as const
    const reversed = { kind: 'fullName', firstName: 'hopper', lastName: 'grace' } as const
    expect((await db.patients.search({ query: asTyped })).map((p) => p.id)).toEqual([GRACE.id])
    expect((await db.patients.search({ query: reversed })).map((p) => p.id)).toEqual([GRACE.id])
    expect(
      await db.patients.search({
        query: { kind: 'fullName', firstName: 'grace', lastName: 'lovelace' },
      }),
    ).toEqual([])
  })

  it('searches by calendar day of birth through the separate filter', async () => {
    await prisma.patient.createMany({ data: [ADA, GRACE] })

    expect(
      (await db.patients.search({ dateOfBirth: '1815-12-10' })).map((p) => p.id),
    ).toEqual([ADA.id])
  })

  it('combines the query and the date of birth as AND', async () => {
    await prisma.patient.createMany({ data: [ADA, GRACE] })

    expect(
      (
        await db.patients.search({
          query: { kind: 'name', name: 'lovelace' },
          dateOfBirth: '1815-12-10',
        })
      ).map((p) => p.id),
    ).toEqual([ADA.id])
    expect(
      await db.patients.search({
        query: { kind: 'name', name: 'hopper' },
        dateOfBirth: '1815-12-10',
      }),
    ).toEqual([])
  })

  it('searches by phone against the normalized digits', async () => {
    await db.patients.create(GRACE_INPUT)

    const found = await db.patients.search({ query: { kind: 'phone', phone: '9515550000' } })
    expect(found.map((p) => p.firstName)).toEqual(['Grace'])
  })

  it('finds referred-by candidates by name substring, "Last, First"', async () => {
    await prisma.patient.createMany({ data: [ADA, GRACE] })

    expect((await db.patients.searchByName({ name: 'hop' })).map((p) => p.id)).toEqual([GRACE.id])
    expect((await db.patients.searchByName({ name: 'Lovelace, ad' })).map((p) => p.id)).toEqual([ADA.id])
    expect(await db.patients.searchByName({ name: 'Lovelace, Grace' })).toEqual([])
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
