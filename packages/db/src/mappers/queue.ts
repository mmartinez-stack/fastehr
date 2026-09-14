import { waitQueueRowSchema, type WaitQueueRow } from '@fastehr/contracts'
import type { Patient as PatientRow, Visit as VisitRow } from '../generated/client/client.ts'

/**
 * Row → contract for the wait queue (ADR 33). The parse is the guard: a
 * visit that is not `arrived` or `roomed`, or one with no clinic or no
 * arrival instant, is a named failure rather than a row in the line.
 */
export type WaitQueueVisitRow = VisitRow & {
  patient: Pick<PatientRow, 'id' | 'firstName' | 'lastName' | 'dateOfBirth'>
  provider: { name: string } | null
}

export function toWaitQueueRow(row: WaitQueueVisitRow): WaitQueueRow {
  return waitQueueRowSchema.parse({
    visitId: row.id,
    patient: {
      id: row.patient.id,
      firstName: row.patient.firstName,
      lastName: row.patient.lastName,
      dateOfBirth: row.patient.dateOfBirth.toISOString().slice(0, 10),
    },
    locationId: row.locationId,
    status: row.status,
    providerId: row.providerId,
    providerName: row.provider?.name ?? null,
    arrivedAt: row.arrivedAt?.toISOString() ?? null,
    roomedAt: row.roomedAt?.toISOString() ?? null,
  })
}
