import { beforeEach, describe, expect, it } from 'vitest'
import type { CreatePatientInput } from '@fastehr/contracts'
import { getPrismaClient } from '../client.ts'
import { db } from '../index.ts'

/**
 * The repository against real PostgreSQL, through real migrations.
 *
 * What only this level can prove: that `@db.Date` behaves as the mapper assumes
 * across the driver, that the public API returns contract shapes and not rows,
 * that the child lists really are replaced atomically, and that a row
 * violating a contract is caught at the boundary rather than flowing upward.
 * The unit tests cover the mapper given a `Date`; they cannot tell you the
 * database hands it one.
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

/** A full sectioned submission, post-contract-parse (the router's output). */
const GRACE_INPUT: CreatePatientInput = {
  firstName: 'Grace',
  lastName: 'Hopper',
  gender: 'female',
  dateOfBirth: '1906-12-09',
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
  programType: undefined,
  heightInches: 60,
  medications: [
    { name: 'Metformin', dose: '500 mg', frequency: 'twice daily' },
    { name: 'Lisinopril', dose: undefined, frequency: undefined },
  ],
  conditions: [
    { condition: 'diabetes', onset: '2019', treatedBy: 'Dr. Smith', medicated: true, medications: 'Metformin' },
    { condition: 'hypertension', onset: undefined, treatedBy: undefined, medicated: false, medications: undefined },
  ],
  pcpName: 'Dr. Jones',
  pcpAddress: undefined,
  pcpPhone: '9515550001',
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
      programType: null,
      heightInches: null,
      medications: [],
      conditions: [],
      historyOther: null,
      pcpName: null,
      pcpAddress: null,
      pcpPhone: null,
      status: 'active',
      lastVisitAt: null,
      creditCardNumber: null,
      creditCardExpMonth: null,
      creditCardExpYear: null,
      creditCardZip: null,
    })
    // Bookkeeping columns exist in the table and must not reach a caller.
    expect(patient).not.toHaveProperty('createdAt')
    expect(patient).not.toHaveProperty('legacyId')
  })

  it('has no healthy weight column any more', async () => {
    // Dropped by 20260906150000_patient_record_sections; nothing reads or
    // writes it, and the migration history is the record of its removal.
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'patients'
    `
    expect(columns.map((column) => column.column_name)).not.toContain('healthyWeight')
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

  it('sorts the roster by most recently seen first, patients with no visit last', async () => {
    // Legacy `GET /patients` sorted by `recentVisit` descending; DIA-50 makes
    // that the roster's one order. Ada was seen most recently, Grace a year
    // before, and the third patient never.
    await prisma.patient.createMany({
      data: [
        { ...ADA, lastVisitAt: new Date('2026-02-01T18:00:00Z') },
        { ...GRACE, lastVisitAt: new Date('2025-02-01T18:00:00Z') },
        {
          id: 'a1b2c3d4-0000-4000-8000-000000000003',
          firstName: 'Katherine',
          lastName: 'Johnson',
          dateOfBirth: new Date('1918-08-26T00:00:00.000Z'),
        },
      ],
    })

    expect((await db.patients.listRecent()).map((patient) => patient.firstName)).toEqual([
      'Ada',
      'Grace',
      'Katherine',
    ])
    // All three share the letter "a"; the roster has one order, not two.
    expect(
      (await db.patients.search({ query: { kind: 'name', name: 'a' } })).map((p) => p.firstName),
    ).toEqual(['Ada', 'Grace', 'Katherine'])
  })

  it('roster rows are summaries: no clinical lists, no card columns', async () => {
    await db.patients.create(GRACE_INPUT)

    const [row] = await db.patients.listRecent()
    expect(row).toEqual({
      id: expect.any(String),
      firstName: 'Grace',
      lastName: 'Hopper',
      dateOfBirth: '1906-12-09',
      office: 'Sylmar',
      lastVisitAt: null,
      phone: '9515550000',
    })
  })

  it('creates a patient from the full sectioned input and round-trips it', async () => {
    const created = await db.patients.create(GRACE_INPUT)

    expect(created).toMatchObject({
      firstName: 'Grace',
      gender: 'female',
      language: 'english',
      office: 'Sylmar',
      email: 'grace@example.com',
      addressStreet: '1 Navy Way',
      addressState: 'VA',
      phone: '9515550000',
      phoneFollowUpAllowed: true,
      referralSource: 'word of mouth',
      programType: null,
      heightInches: 60,
      // Lists come back in the order they were entered, with absent
      // optional fields as null.
      medications: [
        { name: 'Metformin', dose: '500 mg', frequency: 'twice daily' },
        { name: 'Lisinopril', dose: null, frequency: null },
      ],
      conditions: [
        { condition: 'diabetes', onset: '2019', treatedBy: 'Dr. Smith', medicated: true, medications: 'Metformin' },
        { condition: 'hypertension', onset: null, treatedBy: null, medicated: false, medications: null },
      ],
      historyOther: null,
      pcpName: 'Dr. Jones',
      pcpAddress: null,
      pcpPhone: '9515550001',
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
      language: undefined,
      office: undefined,
      email: undefined,
      referralSource: undefined,
      pcpName: undefined,
    })

    expect(created.language).toBeNull()
    expect(created.office).toBeNull()
    expect(created.email).toBeNull()
    expect(created.referralSource).toBeNull()
    expect(created.pcpName).toBeNull()
  })

  it('round-trips a height entered as feet and inches: 5 ft 4 in stores as 64', async () => {
    const created = await db.patients.create({ ...GRACE_INPUT, heightInches: 5 * 12 + 4 })
    expect(created.heightInches).toBe(64)
    expect((await db.patients.findById(created.id))?.heightInches).toBe(64)
  })

  it('updates demographics without touching the clinical or billing sections', async () => {
    const created = await db.patients.create(GRACE_INPUT)

    const updated = await db.patients.updateDemographics({
      ...GRACE_INPUT,
      id: created.id,
      lastName: 'Hopper-Murray',
      office: 'At Home',
      programType: 'Basic Program',
      email: undefined, // cleared on the form → cleared in the row
    })

    expect(updated).toEqual({
      ...created,
      lastName: 'Hopper-Murray',
      office: 'At Home',
      programType: 'Basic Program',
      email: null,
    })
    expect(await db.patients.findById(created.id)).toEqual(updated)
  })

  it('replaces the clinical lists wholesale and leaves the rest alone', async () => {
    const created = await db.patients.create(GRACE_INPUT)

    // A removed row (Metformin, diabetes) stays removed; a changed one is the new row.
    const updated = await db.patients.updateClinical({
      id: created.id,
      heightInches: 61.5,
      medications: [{ name: 'Lisinopril', dose: '10 mg', frequency: 'daily' }],
      conditions: [{ condition: 'hypertension', onset: '2021', treatedBy: undefined, medicated: true, medications: 'Lisinopril' }],
      pcpName: 'Dr. Lee',
      pcpAddress: '2 Clinic Rd',
      pcpPhone: undefined,
    })

    expect(updated).toEqual({
      ...created,
      heightInches: 61.5,
      medications: [{ name: 'Lisinopril', dose: '10 mg', frequency: 'daily' }],
      conditions: [{ condition: 'hypertension', onset: '2021', treatedBy: null, medicated: true, medications: 'Lisinopril' }],
      pcpName: 'Dr. Lee',
      pcpAddress: '2 Clinic Rd',
      pcpPhone: null,
    })
    // The old rows are gone, not orphaned: one row of each in the tables.
    expect(await prisma.patientMedication.count()).toBe(1)
    expect(await prisma.patientCondition.count()).toBe(1)
    expect(await db.patients.findById(created.id)).toEqual(updated)

    // Removing the last row leaves an empty list, not a stale one; a checklist
    // answered all "No" likewise stores nothing.
    const emptied = await db.patients.updateClinical({
      id: created.id,
      heightInches: 61.5,
      medications: [],
      conditions: [],
      pcpName: 'Dr. Lee',
      pcpAddress: '2 Clinic Rd',
      pcpPhone: undefined,
    })
    expect(emptied?.medications).toEqual([])
    expect(emptied?.conditions).toEqual([])
    expect(await prisma.patientMedication.count()).toBe(0)
    expect(await prisma.patientCondition.count()).toBe(0)
  })

  it('leaves the legacy history text untouched by a clinical save', async () => {
    // The column is read-only until the history section is built: the
    // migrated text must survive every save of the Medical tab.
    await prisma.patient.create({ data: { ...ADA, historyOther: 'HTN. Prior phentermine, tolerated.' } })

    const updated = await db.patients.updateClinical({
      id: ADA.id,
      heightInches: 64,
      medications: [],
      conditions: [],
      pcpName: undefined,
      pcpAddress: undefined,
      pcpPhone: undefined,
    })

    expect(updated?.historyOther).toBe('HTN. Prior phentermine, tolerated.')
  })

  it('updates billing alone', async () => {
    const created = await db.patients.create(GRACE_INPUT)

    const updated = await db.patients.updateBilling({
      id: created.id,
      creditCardNumber: undefined,
      creditCardExpMonth: undefined,
      creditCardExpYear: undefined,
      creditCardZip: undefined,
    })

    expect(updated).toEqual({
      ...created,
      creditCardNumber: null,
      creditCardExpMonth: null,
      creditCardExpYear: null,
      creditCardZip: null,
    })
  })

  it('returns null from a section update for a record that does not exist', async () => {
    expect(
      await db.patients.updateBilling({
        id: '00000000-0000-4000-8000-000000000000',
        creditCardNumber: undefined,
        creditCardExpMonth: undefined,
        creditCardExpYear: undefined,
        creditCardZip: undefined,
      }),
    ).toBeNull()
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

  it('searches one word against either name by substring, case-insensitive', async () => {
    await prisma.patient.createMany({ data: [ADA, GRACE] })

    expect(
      (await db.patients.search({ query: { kind: 'name', name: 'hopper' } })).map((p) => p.id),
    ).toEqual([GRACE.id])
    // Substring, anywhere in the name (DIA-59): "pp" is inside Hopper.
    expect(
      (await db.patients.search({ query: { kind: 'name', name: 'PP' } })).map((p) => p.id),
    ).toEqual([GRACE.id])
    // A first name finds the patient too — one input, either field.
    expect(
      (await db.patients.search({ query: { kind: 'name', name: 'ad' } })).map((p) => p.id),
    ).toEqual([ADA.id])
    expect(await db.patients.search({ query: { kind: 'name', name: 'zz' } })).toEqual([])
  })

  it('searches a full name in both orientations, each part a substring', async () => {
    await prisma.patient.createMany({ data: [ADA, GRACE] })

    const asTyped = { kind: 'fullName', firstName: 'gr', lastName: 'hop' } as const
    const reversed = { kind: 'fullName', firstName: 'hop', lastName: 'gr' } as const
    expect((await db.patients.search({ query: asTyped })).map((p) => p.id)).toEqual([GRACE.id])
    expect((await db.patients.search({ query: reversed })).map((p) => p.id)).toEqual([GRACE.id])
    expect(
      await db.patients.search({
        query: { kind: 'fullName', firstName: 'grace', lastName: 'lovelace' },
      }),
    ).toEqual([])
  })

  it('finds patients seen on a clinic calendar day, combinable with a name', async () => {
    await prisma.patient.createMany({ data: [ADA, GRACE] })
    // Two visits for Ada that are the same UTC day but different Los
    // Angeles days: 06:30Z is the previous evening in the clinic's zone.
    await prisma.visit.createMany({
      data: [
        { patientId: ADA.id, dateOfService: new Date('2026-09-01T06:30:00Z') }, // Aug 31, 23:30 PDT
        { patientId: ADA.id, dateOfService: new Date('2026-09-01T18:00:00Z') }, // Sep 1, 11:00 PDT
        { patientId: GRACE.id, dateOfService: new Date('2026-09-02T18:00:00Z') }, // Sep 2
      ],
    })

    expect((await db.patients.search({ serviceDate: '2026-09-01' })).map((p) => p.id)).toEqual([ADA.id])
    expect((await db.patients.search({ serviceDate: '2026-08-31' })).map((p) => p.id)).toEqual([ADA.id])
    expect((await db.patients.search({ serviceDate: '2026-09-02' })).map((p) => p.id)).toEqual([GRACE.id])
    expect(await db.patients.search({ serviceDate: '2026-09-03' })).toEqual([])
    // ANDed with the query: Grace was not seen on the 1st.
    expect(
      await db.patients.search({ query: { kind: 'name', name: 'hop' }, serviceDate: '2026-09-01' }),
    ).toEqual([])
  })

  it('suggests a handful of matches in roster order', async () => {
    await prisma.patient.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        id: `a1b2c3d4-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
        firstName: `Pat${i}`,
        lastName: 'Penn',
        dateOfBirth: new Date('1980-01-01T00:00:00.000Z'),
        lastVisitAt: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T18:00:00Z`),
      })),
    })

    const suggested = await db.patients.suggest({ query: { kind: 'name', name: 'pe' } })
    expect(suggested).toHaveLength(8)
    expect(suggested[0]?.firstName).toBe('Pat11') // most recently seen first
  })

  it('finds an inactive patient like any other — status is not a filter', async () => {
    // The column stays (DIA-50 keeps the field) but nothing reads it: an
    // inactive patient is still on the roster and still found by name.
    await prisma.patient.createMany({
      data: [ADA, { ...GRACE, status: 'inactive' as const }],
    })

    expect(
      (await db.patients.search({ query: { kind: 'name', name: 'hopper' } })).map((p) => p.id),
    ).toEqual([GRACE.id])
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
