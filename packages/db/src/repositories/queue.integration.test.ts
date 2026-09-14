import { beforeEach, describe, expect, it } from 'vitest'
import { getPrismaClient } from '../client.ts'
import { db } from '../index.ts'

/**
 * The wait queue against real PostgreSQL (ADR 33): arrival creates the
 * visit, the transitions are conditional on the status they leave from,
 * the record-write trigger clears a patient's waiting visits, and the line
 * reads in arrival order per clinic.
 */

const prisma = getPrismaClient()

const ADA = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: new Date('1815-12-10T00:00:00.000Z'),
}
const GRACE = {
  id: '5c2b8d3f-1a4e-4f6b-8c7d-9e0f1a2b3c4d',
  firstName: 'Grace',
  lastName: 'Hopper',
  dateOfBirth: new Date('1906-12-09T00:00:00.000Z'),
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "visits", "patients", "users" RESTART IDENTITY CASCADE')
  await prisma.patient.createMany({ data: [ADA, GRACE] })
  await prisma.user.create({
    data: { id: 'dr-penn', name: 'Dr Penn', email: 'penn@example.com', role: 'provider', updatedAt: new Date() },
  })
})

describe('queue repository', () => {
  it('arrival creates an arrived visit at the clinic, and a second arrival returns the same one', async () => {
    const first = await db.queue.arrive({ patientId: ADA.id, locationId: 'sylmar', providerId: 'dr-penn' })
    expect(first).toMatchObject({
      status: 'arrived',
      locationId: 'sylmar',
      providerId: 'dr-penn',
      providerName: 'Dr Penn',
      roomedAt: null,
      patient: { firstName: 'Ada', dateOfBirth: '1815-12-10' },
    })
    const stored = await prisma.visit.findUniqueOrThrow({ where: { id: first.visitId } })
    expect(stored.office).toBe('Sylmar')
    expect(stored.arrivedAt).not.toBeNull()

    const again = await db.queue.arrive({ patientId: ADA.id, locationId: 'sylmar', providerId: null })
    expect(again.visitId).toBe(first.visitId)
    expect(await prisma.visit.count()).toBe(1)
  })

  it('rooms an arrived visit once', async () => {
    const { visitId } = await db.queue.arrive({ patientId: ADA.id, locationId: 'sylmar', providerId: null })
    const roomed = await db.queue.room(visitId)
    expect(roomed).toMatchObject({ visitId, status: 'roomed' })
    expect(roomed?.roomedAt).not.toBeNull()
    expect(await db.queue.room(visitId)).toBeNull()
  })

  it('the manual "Seen" takes a waiting visit out of the line, and nothing else', async () => {
    const { visitId } = await db.queue.arrive({ patientId: ADA.id, locationId: 'sylmar', providerId: null })
    await db.queue.room(visitId)
    expect(await db.queue.remove(visitId)).toMatchObject({ visitId, status: 'roomed' })
    const stored = await prisma.visit.findUniqueOrThrow({ where: { id: visitId } })
    expect(stored.status).toBe('in_progress')
    expect(stored.startedAt).not.toBeNull()
    expect(await db.queue.remove(visitId)).toBeNull()
    expect(await db.queue.listWaiting('sylmar')).toEqual([])
  })

  it('a write to the record clears that patient\'s waiting visits and no one else\'s', async () => {
    await db.queue.arrive({ patientId: ADA.id, locationId: 'sylmar', providerId: null })
    await db.queue.arrive({ patientId: GRACE.id, locationId: 'sylmar', providerId: null })

    expect(await db.queue.startFromRecordWrite(ADA.id)).toBe(1)
    expect(await db.queue.startFromRecordWrite(ADA.id)).toBe(0)
    expect((await db.queue.listWaiting('sylmar')).map((row) => row.patient.firstName)).toEqual(['Grace'])
  })

  it('lists one clinic in arrival order, or every clinic with each line contiguous', async () => {
    const a = await db.queue.arrive({ patientId: ADA.id, locationId: 'kanoga', providerId: null })
    const g = await db.queue.arrive({ patientId: GRACE.id, locationId: 'sylmar', providerId: null })
    // Grace arrived at Sylmar a minute before Ada's Kanoga arrival, whatever the wall clock said.
    await prisma.visit.update({ where: { id: g.visitId }, data: { arrivedAt: new Date(Date.now() - 60_000) } })

    expect((await db.queue.listWaiting('sylmar')).map((row) => row.visitId)).toEqual([g.visitId])
    expect((await db.queue.listWaiting('kanoga')).map((row) => row.visitId)).toEqual([a.visitId])
    expect((await db.queue.listWaiting('all')).map((row) => row.locationId)).toEqual(['kanoga', 'sylmar'])
    expect(await db.queue.listWaiting('montebello')).toEqual([])
  })
})
