import { z } from 'zod'

/**
 * Medical-director review (DIA-74, ADR 30): a random sample of signed clinic
 * notes, a queue for the reviewer, and a sign-off recorded on the note.
 *
 * The visit is the note: the legacy `visits` collection carried one
 * free-text body per visit, and that is what a reviewer reads. These shapes
 * are the review's view of it — identity, provenance, the body, and the
 * review fields — not a general visit entity, which arrives with charting.
 */

/** "1 in N". Twenty is the five percent the Aug 31 sync asked for. */
export const REVIEW_SAMPLE_RATE_DEFAULT = 20

export const reviewSampleRunSchema = z.object({
  id: z.uuid(),
  ranAt: z.iso.datetime(),
  windowStart: z.iso.datetime(),
  windowEnd: z.iso.datetime(),
  eligibleCount: z.number().int().min(0),
  sampledCount: z.number().int().min(0),
  rate: z.number().int().min(1),
})
export type ReviewSampleRun = z.infer<typeof reviewSampleRunSchema>

/** A row in the reviewer's queue: whose note, when, by whom, and when it was picked. */
export const reviewQueueItemSchema = z.object({
  visitId: z.uuid(),
  patient: z.object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    dateOfBirth: z.iso.date(),
  }),
  dateOfService: z.iso.datetime(),
  office: z.string().nullable(),
  signedByName: z.string().nullable(),
  signedAt: z.iso.datetime().nullable(),
  sampledAt: z.iso.datetime(),
})
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>

/** The note opened from the queue: the body and the review, if any. */
export const reviewNoteSchema = reviewQueueItemSchema.extend({
  notes: z.string().nullable(),
  reviewedById: z.string().nullable(),
  reviewedByName: z.string().nullable(),
  reviewComments: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
})
export type ReviewNote = z.infer<typeof reviewNoteSchema>

export const reviewNoteInput = z.object({ visitId: z.uuid() })
export type ReviewNoteInput = z.infer<typeof reviewNoteInput>

const blankAsAbsent = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  )

/** Signing off may carry comments; a bare sign-off is a valid review. */
export const signOffReviewInput = z.object({
  visitId: z.uuid(),
  comments: blankAsAbsent(z.string().trim().max(10000)),
})
export type SignOffReviewInput = z.infer<typeof signOffReviewInput>

/**
 * A manual run. The window starts where the last run ended (or a week ago
 * for the first); `windowStart` overrides that for a catch-up over older
 * signatures. The rate is the schedule's to configure, overridable here.
 */
export const runReviewSampleInput = z.object({
  rate: z.number().int().min(1).max(1000).optional(),
  windowStart: z.iso.date().optional(),
})
export type RunReviewSampleInput = z.infer<typeof runReviewSampleInput>
