import { describe, expect, it } from 'vitest'
import type { WaitQueueRow } from '@fastehr/contracts'
import { minutesWaiting, rankWaitQueue } from './wait-queue.ts'

function row(visitId: string, locationId: WaitQueueRow['locationId'], arrivedAt: string): WaitQueueRow {
  return {
    visitId,
    patient: {
      id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1815-12-10',
    },
    locationId,
    status: 'arrived',
    providerId: null,
    providerName: null,
    arrivedAt,
    roomedAt: null,
  }
}

describe('rankWaitQueue', () => {
  it('counts the patients ahead within one clinic, by arrival order', () => {
    const ranked = rankWaitQueue([
      row('v1', 'sylmar', '2026-09-14T15:00:00.000Z'),
      row('v2', 'sylmar', '2026-09-14T15:05:00.000Z'),
      row('v3', 'sylmar', '2026-09-14T15:09:00.000Z'),
    ])
    expect(ranked.map((entry) => [entry.position, entry.patientsAhead])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
    ])
  })

  it('keeps each clinic on its own line when the list covers all of them', () => {
    const ranked = rankWaitQueue([
      row('v1', 'sylmar', '2026-09-14T15:00:00.000Z'),
      row('v2', 'kanoga', '2026-09-14T15:01:00.000Z'),
      row('v3', 'sylmar', '2026-09-14T15:02:00.000Z'),
      row('v4', 'kanoga', '2026-09-14T15:03:00.000Z'),
    ])
    expect(ranked.map((entry) => `${entry.visitId}:${entry.patientsAhead}`)).toEqual([
      'v1:0',
      'v2:0',
      'v3:1',
      'v4:1',
    ])
  })

  it('is empty for an empty line and leaves the rows untouched', () => {
    expect(rankWaitQueue([])).toEqual([])
    const input = [row('v1', 'sylmar', '2026-09-14T15:00:00.000Z')]
    rankWaitQueue(input)
    expect(input[0]).not.toHaveProperty('position')
  })
})

describe('minutesWaiting', () => {
  it('is whole minutes since arrival', () => {
    expect(minutesWaiting('2026-09-14T15:00:00.000Z', new Date('2026-09-14T15:17:59.000Z'))).toBe(17)
  })

  it('never goes negative', () => {
    expect(minutesWaiting('2026-09-14T15:00:00.000Z', new Date('2026-09-14T14:59:00.000Z'))).toBe(0)
  })
})
