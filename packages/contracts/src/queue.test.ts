import { describe, expect, it } from 'vitest'
import { arriveInput, waitQueueEntrySchema, waitQueueRowSchema } from './queue.ts'

const ROW = {
  visitId: 'a1b2c3d4-0000-4000-8000-000000000101',
  patient: {
    id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
    firstName: 'Ada',
    lastName: 'Lovelace',
    dateOfBirth: '1815-12-10',
  },
  locationId: 'sylmar',
  status: 'arrived',
  providerId: null,
  providerName: null,
  arrivedAt: '2026-09-14T15:00:00.000Z',
  roomedAt: null,
}

describe('wait queue contracts', () => {
  it('accepts a waiting row and refuses one that has left the queue', () => {
    expect(waitQueueRowSchema.safeParse(ROW).success).toBe(true)
    expect(waitQueueRowSchema.safeParse({ ...ROW, status: 'in_progress' }).success).toBe(false)
    expect(waitQueueRowSchema.safeParse({ ...ROW, locationId: 'Sylmar' }).success).toBe(false)
  })

  it('an entry carries a one-based position and a non-negative count ahead', () => {
    expect(waitQueueEntrySchema.safeParse({ ...ROW, position: 1, patientsAhead: 0 }).success).toBe(true)
    expect(waitQueueEntrySchema.safeParse({ ...ROW, position: 0, patientsAhead: 0 }).success).toBe(false)
    expect(waitQueueEntrySchema.safeParse({ ...ROW, position: 2, patientsAhead: -1 }).success).toBe(false)
  })

  it('arrival names a patient and a clinic, and may leave the provider open', () => {
    expect(
      arriveInput.safeParse({ patientId: ROW.patient.id, location: 'kanoga', providerId: null }).success,
    ).toBe(true)
    expect(arriveInput.safeParse({ patientId: ROW.patient.id, location: 'all', providerId: null }).success).toBe(
      false,
    )
    expect(arriveInput.safeParse({ patientId: ROW.patient.id, location: 'kanoga', providerId: '' }).success).toBe(
      false,
    )
  })
})
