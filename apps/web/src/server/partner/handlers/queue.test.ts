import type { WaitQueueRow } from '@fastehr/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADA, GRACE, partnerHarness, testClient } from '../../test-support/partner-fakes.ts'

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

function waiting(patient: typeof ADA, locationId: 'sylmar' | 'kanoga', arrivedAt: string): WaitQueueRow {
  return {
    visitId: `visit-${patient.firstName}`,
    patient: { id: patient.patientId, firstName: patient.firstName, lastName: patient.lastName, dateOfBirth: patient.dateOfBirth },
    locationId,
    status: 'arrived',
    providerId: null,
    providerName: null,
    arrivedAt,
    roomedAt: null,
  }
}

const ROWS = [waiting(ADA, 'sylmar', '2026-09-17T11:40:00.000Z'), waiting(GRACE, 'sylmar', '2026-09-17T11:55:00.000Z')]

describe('queue count', () => {
  it('counts per clinic and overall, with the longest wait, and nothing about who', async () => {
    const harness = partnerHarness({ waiting: ROWS })
    const { status, body } = await harness.send({ path: '/queue/count' })
    expect(status).toBe(200)
    expect(body).toEqual({
      asOf: '2026-09-17T12:00:00.000Z',
      location: 'all',
      waiting: 2,
      longestWaitMinutes: 20,
      byLocation: [
        { location: 'sylmar', waiting: 2, longestWaitMinutes: 20 },
        { location: 'kanoga', waiting: 0, longestWaitMinutes: 0 },
      ],
    })
    const text = JSON.stringify(body)
    expect(text).not.toContain('Ada')
    expect(text).not.toContain(ADA.patientId)
  })

  it('answers one clinic, and 404 for an inactive or unpermitted one', async () => {
    const harness = partnerHarness({ waiting: ROWS })
    expect((await harness.send({ path: '/queue/count?location=kanoga' })).body).toMatchObject({ location: 'kanoga', waiting: 0 })
    expect((await harness.send({ path: '/queue/count?location=montebello' })).status).toBe(404)

    const restricted = partnerHarness({ waiting: ROWS, clients: [testClient({ locationIds: ['kanoga'] })] })
    expect((await restricted.send({ path: '/queue/count?location=sylmar' })).status).toBe(404)
    expect((await restricted.send({ path: '/queue/count' })).body).toMatchObject({ byLocation: [{ location: 'kanoga', waiting: 0 }] })
  })

  it('refuses an unknown location value as invalid input', async () => {
    const harness = partnerHarness()
    expect((await harness.send({ path: '/queue/count?location=mars' })).status).toBe(400)
  })
})
