import { beforeEach, describe, expect, it } from 'vitest'
import { getPrismaClient } from '../client.ts'
import { db } from '../index.ts'

/**
 * The review repository against real PostgreSQL: eligibility by signature
 * window, the atomic record of a run, the queue, and a sign-off that can
 * happen once.
 */

const prisma = getPrismaClient()

const ADA = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: new Date('1815-12-10T00:00:00.000Z'),
}

let directorId: string

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "visits", "review_sample_runs", "patients", "users" RESTART IDENTITY CASCADE',
  )
  await prisma.patient.create({ data: ADA })
  const director = await prisma.user.create({
    data: {
      id: 'dr-penn',
      name: 'Dr Penn',
      email: 'penn@example.com',
      role: 'provider',
      medicalDirector: true,
      updatedAt: new Date(),
    },
  })
  directorId = director.id
})

async function visit(id: string, signedAt: Date | null, extra: Record<string, unknown> = {}) {
  await prisma.visit.create({
    data: {
      id,
      patientId: ADA.id,
      dateOfService: signedAt ?? new Date('2026-08-01T18:00:00Z'),
      office: 'Sylmar',
      notes: 'Lost 4 lbs.',
      signedByName: signedAt === null ? null : 'Dr Penn',
      signedAt,
      ...extra,
    },
  })
}

const V1 = 'a1b2c3d4-0000-4000-8000-000000000101'
const V2 = 'a1b2c3d4-0000-4000-8000-000000000102'
const V3 = 'a1b2c3d4-0000-4000-8000-000000000103'
const V4 = 'a1b2c3d4-0000-4000-8000-000000000104'

describe('review repository', () => {
  it('lists notes signed within the window and never sampled, oldest first', async () => {
    await visit(V1, new Date('2026-08-20T18:00:00Z'))
    await visit(V2, new Date('2026-08-22T18:00:00Z'))
    await visit(V3, new Date('2026-08-30T18:00:00Z')) // outside the window
    await visit(V4, null) // unsigned
    await prisma.visit.update({ where: { id: V2 }, data: { sampledAt: new Date() } })

    expect(
      await db.reviews.listEligible({ from: new Date('2026-08-18T00:00:00Z'), to: new Date('2026-08-25T00:00:00Z') }),
    ).toEqual([V1])
  })

  it('records a run and marks its picks, and the next window starts where it ended', async () => {
    await visit(V1, new Date('2026-08-20T18:00:00Z'))
    await visit(V2, new Date('2026-08-22T18:00:00Z'))

    expect(await db.reviews.lastRun()).toBeNull()
    const run = await db.reviews.recordSample({
      visitIds: [V1],
      windowStart: new Date('2026-08-18T00:00:00Z'),
      windowEnd: new Date('2026-08-25T00:00:00Z'),
      eligibleCount: 2,
      rate: 20,
      triggeredById: null,
    })

    expect(run).toMatchObject({ eligibleCount: 2, sampledCount: 1, rate: 20, windowEnd: '2026-08-25T00:00:00.000Z' })
    expect((await db.reviews.lastRun())?.id).toBe(run.id)
    const queue = await db.reviews.listQueue()
    expect(queue.map((item) => item.visitId)).toEqual([V1])
    expect(queue[0]).toMatchObject({
      patient: { id: ADA.id, firstName: 'Ada', lastName: 'Lovelace', dateOfBirth: '1815-12-10' },
      office: 'Sylmar',
      signedByName: 'Dr Penn',
    })
    // V2 is still eligible for the next run; V1 is not, whatever the window.
    expect(
      await db.reviews.listEligible({ from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-09-01T00:00:00Z') }),
    ).toEqual([V2])
  })

  it('serves only sampled notes, and signs off once', async () => {
    await visit(V1, new Date('2026-08-20T18:00:00Z'))
    await visit(V2, new Date('2026-08-22T18:00:00Z'))
    await db.reviews.recordSample({
      visitIds: [V1],
      windowStart: new Date('2026-08-18T00:00:00Z'),
      windowEnd: new Date('2026-08-25T00:00:00Z'),
      eligibleCount: 2,
      rate: 20,
      triggeredById: directorId,
    })

    expect(await db.reviews.findNote(V2)).toBeNull() // not sampled: not the reviewer's to read here
    expect((await db.reviews.findNote(V1))?.notes).toBe('Lost 4 lbs.')

    const reviewed = await db.reviews.signOff({ visitId: V1, reviewerId: directorId, comments: 'Agree.' })
    expect(reviewed).toMatchObject({
      reviewedById: directorId,
      reviewedByName: 'Dr Penn',
      reviewComments: 'Agree.',
    })
    expect(reviewed?.reviewedAt).not.toBeNull()
    expect(await db.reviews.listQueue()).toEqual([])
    // Once: a second sign-off, or one on an unsampled note, updates nothing.
    expect(await db.reviews.signOff({ visitId: V1, reviewerId: directorId, comments: undefined })).toBeNull()
    expect(await db.reviews.signOff({ visitId: V2, reviewerId: directorId, comments: undefined })).toBeNull()
  })

  it('keeps a reviewer’s account: the delete is restricted by the review FK', async () => {
    await visit(V1, new Date('2026-08-20T18:00:00Z'))
    await db.reviews.recordSample({
      visitIds: [V1],
      windowStart: new Date('2026-08-18T00:00:00Z'),
      windowEnd: new Date('2026-08-25T00:00:00Z'),
      eligibleCount: 1,
      rate: 20,
      triggeredById: null,
    })
    await db.reviews.signOff({ visitId: V1, reviewerId: directorId, comments: undefined })

    await expect(prisma.user.delete({ where: { id: directorId } })).rejects.toThrow()
  })
})
