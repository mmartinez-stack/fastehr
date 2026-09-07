import { beforeEach, describe, expect, it } from 'vitest'
import type { CreatePatientInput, IntakeSubmission } from '@fastehr/contracts'
import { getPrismaClient } from '../client.ts'
import { db } from '../index.ts'

/**
 * The intake repository against real PostgreSQL: the conditional writes that
 * make a link single-use and a review single-winner are database behaviour,
 * and only the database can prove them.
 */

const prisma = getPrismaClient()

const SUBMISSION: IntakeSubmission = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female',
  dateOfBirth: '1985-12-10',
  office: 'PennProgram',
  addressStreet: '10 Analytical Way',
  addressCity: 'Pasadena',
  addressState: 'CA',
  addressZip: '91101',
  phone: '9515550000',
  phoneFollowUpAllowed: true,
  heightInches: 64,
  medications: [{ name: 'Metformin', dose: '500 mg' }],
}

const PATIENT_INPUT: CreatePatientInput = {
  ...SUBMISSION,
  language: undefined,
  email: undefined,
  referralSource: undefined,
  referredByPatientId: undefined,
  programType: undefined,
  medications: [{ name: 'Metformin', dose: '500 mg', frequency: undefined }],
  pcpName: undefined,
  pcpAddress: undefined,
  pcpPhone: undefined,
  creditCardNumber: undefined,
  creditCardExpMonth: undefined,
  creditCardExpYear: undefined,
  creditCardZip: undefined,
}

let staffId: string

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "intake_requests", "patients", "users" RESTART IDENTITY CASCADE')
  const staff = await prisma.user.create({
    data: { id: 'staff-1', name: 'Front Desk', email: 'desk@example.com', role: 'frontdesk', updatedAt: new Date() },
  })
  staffId = staff.id
})

function seed(tokenHash = 'hash-1', expiresAt = new Date(Date.now() + 86_400_000)) {
  return db.intakes.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '9515550000',
    language: 'spanish',
    tokenHash,
    expiresAt,
    createdById: staffId,
  })
}

describe('intake repository', () => {
  it('creates a request as sent, findable by its token hash, without exposing the hash', async () => {
    const created = await seed()

    expect(created).toMatchObject({ status: 'sent', office: null, submission: null, language: 'spanish' })
    expect(created).not.toHaveProperty('tokenHash')
    expect(await db.intakes.findByTokenHash('hash-1')).toEqual(created)
    expect(await db.intakes.findByTokenHash('nope')).toBeNull()
    expect(await db.intakes.findById(created.id)).toEqual(created)
  })

  it('records a submission once — the second attempt finds the status moved', async () => {
    await seed()

    const submitted = await db.intakes.submit({ tokenHash: 'hash-1', submission: SUBMISSION })
    expect(submitted).toMatchObject({ status: 'submitted', office: 'PennProgram', submission: SUBMISSION })
    expect(submitted?.submittedAt).not.toBeNull()

    expect(await db.intakes.submit({ tokenHash: 'hash-1', submission: SUBMISSION })).toBeNull()
    expect(await db.intakes.submit({ tokenHash: 'unknown', submission: SUBMISSION })).toBeNull()
  })

  it('lists the office queue: submitted only, that office only, oldest first', async () => {
    const first = await seed('hash-a')
    await seed('hash-b')
    await seed('hash-c')
    await db.intakes.submit({ tokenHash: 'hash-a', submission: SUBMISSION })
    await db.intakes.submit({ tokenHash: 'hash-b', submission: { ...SUBMISSION, office: 'Sylmar' } })
    // hash-c stays `sent`.

    const penn = await db.intakes.listPending('PennProgram')
    expect(penn.map((request) => request.id)).toEqual([first.id])
    expect((await db.intakes.listPending('Sylmar')).map((request) => request.office)).toEqual(['Sylmar'])
    expect(await db.intakes.listPending('Montebello')).toEqual([])
  })

  it('accepts once: the patient row with its lists, the request linked and closed', async () => {
    const created = await seed()
    await db.intakes.submit({ tokenHash: 'hash-1', submission: SUBMISSION })

    const outcome = await db.intakes.accept({ id: created.id, patient: PATIENT_INPUT, reviewedById: staffId })

    expect(outcome).not.toBeNull()
    expect(outcome?.request).toMatchObject({ status: 'accepted', patientId: outcome?.patient.id })
    expect(outcome?.patient).toMatchObject({
      firstName: 'Ada',
      office: 'PennProgram',
      heightInches: 64,
      medications: [{ name: 'Metformin', dose: '500 mg', frequency: null }],
      historyOther: null,
      creditCardNumber: null,
    })
    expect(await db.patients.findById(outcome?.patient.id ?? '')).toEqual(outcome?.patient)

    // A second accept — another front-desk user, a double click — loses.
    expect(await db.intakes.accept({ id: created.id, patient: PATIENT_INPUT, reviewedById: staffId })).toBeNull()
    expect(await prisma.patient.count()).toBe(1)
    expect(await db.intakes.listPending('PennProgram')).toEqual([])
  })

  it('rejects a submitted request and no other', async () => {
    const created = await seed()
    expect(await db.intakes.reject({ id: created.id, reviewedById: staffId })).toBeNull() // still `sent`

    await db.intakes.submit({ tokenHash: 'hash-1', submission: SUBMISSION })
    expect((await db.intakes.reject({ id: created.id, reviewedById: staffId }))?.status).toBe('rejected')
    expect(await db.intakes.reject({ id: created.id, reviewedById: staffId })).toBeNull()
    expect(await prisma.patient.count()).toBe(0)
  })

  it('refuses a stored submission that no longer parses, at the boundary', async () => {
    const created = await seed()
    await prisma.intakeRequest.update({
      where: { id: created.id },
      data: { status: 'submitted', office: 'Sylmar', submission: { firstName: 'only' } },
    })

    await expect(db.intakes.findById(created.id)).rejects.toThrow()
  })
})
