import {
  reviewNoteSchema,
  reviewQueueItemSchema,
  reviewSampleRunSchema,
  type ReviewNote,
  type ReviewQueueItem,
  type ReviewSampleRun,
} from '@fastehr/contracts'
import type {
  Patient as PatientRow,
  ReviewSampleRun as ReviewSampleRunRow,
  Visit as VisitRow,
} from '../generated/client/client.ts'

/**
 * Row → contract mapping for the review queue (DIA-74), on the same two
 * rules as the patient mapper. A queue row is a visit with its patient's
 * identity; a note adds the body and the review. The reviewer's name is
 * joined in so the note shows who signed off even after the account's row
 * is the only thing left to say so.
 */

export type ReviewVisitRow = VisitRow & {
  patient: Pick<PatientRow, 'id' | 'firstName' | 'lastName' | 'dateOfBirth'>
  reviewedBy: { name: string } | null
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString()
}

function queueFields(row: ReviewVisitRow) {
  return {
    visitId: row.id,
    patient: {
      id: row.patient.id,
      firstName: row.patient.firstName,
      lastName: row.patient.lastName,
      dateOfBirth: row.patient.dateOfBirth.toISOString().slice(0, 10),
    },
    dateOfService: row.dateOfService.toISOString(),
    office: row.office,
    signedByName: row.signedByName,
    signedAt: iso(row.signedAt),
    // A row reaches these mappers only through the queue's own query, which
    // requires `sampledAt`; the parse is what refuses one that did not.
    sampledAt: iso(row.sampledAt),
  }
}

export function toReviewQueueItem(row: ReviewVisitRow): ReviewQueueItem {
  return reviewQueueItemSchema.parse(queueFields(row))
}

export function toReviewNote(row: ReviewVisitRow): ReviewNote {
  return reviewNoteSchema.parse({
    ...queueFields(row),
    notes: row.notes,
    reviewedById: row.reviewedById,
    reviewedByName: row.reviewedBy?.name ?? null,
    reviewComments: row.reviewComments,
    reviewedAt: iso(row.reviewedAt),
  })
}

export function toReviewSampleRun(row: ReviewSampleRunRow): ReviewSampleRun {
  return reviewSampleRunSchema.parse({
    id: row.id,
    ranAt: row.ranAt.toISOString(),
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    eligibleCount: row.eligibleCount,
    sampledCount: row.sampledCount,
    rate: row.rate,
  })
}
