import type { ReviewNote, ReviewQueueItem, ReviewSampleRun } from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toReviewNote, toReviewQueueItem, toReviewSampleRun } from '../mappers/review.ts'

/**
 * The medical-director review queue (DIA-74, ADR 30): which signed notes a
 * sampling run may consider, the record of each run, the queue itself, and
 * the sign-off.
 *
 * The *choice* of which notes to sample is not here — it is a pure function
 * in `@fastehr/core` (`sampleForReview`), fed by `listEligible` and recorded
 * by `recordSample`. This repository only knows what was signed, what was
 * picked, and what was reviewed.
 */
export interface ReviewRepository {
  /** The most recent run, whose window end is where the next one starts. */
  lastRun(): Promise<ReviewSampleRun | null>
  /** Ids of notes signed within the window and never sampled. Oldest first, so a sample is reproducible. */
  listEligible(window: { from: Date; to: Date }): Promise<string[]>
  /** Records a run and marks its picks sampled, atomically. */
  recordSample(input: {
    visitIds: readonly string[]
    windowStart: Date
    windowEnd: Date
    eligibleCount: number
    rate: number
    triggeredById: string | null
  }): Promise<ReviewSampleRun>
  /** Sampled and not yet reviewed, oldest pick first. */
  listQueue(): Promise<ReviewQueueItem[]>
  /** A sampled note with its body and review; null if not sampled (a note outside the queue is not the reviewer's to read here). */
  findNote(visitId: string): Promise<ReviewNote | null>
  /** Records the review on the note; null if it was not in the queue. */
  signOff(input: { visitId: string; reviewerId: string; comments: string | undefined }): Promise<ReviewNote | null>
}

const NOTE_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, dateOfBirth: true } },
  reviewedBy: { select: { name: true } },
}

export function createReviewRepository(getClient: () => PrismaClient): ReviewRepository {
  return {
    async lastRun() {
      const row = await getClient().reviewSampleRun.findFirst({ orderBy: { windowEnd: 'desc' } })
      return row === null ? null : toReviewSampleRun(row)
    },

    async listEligible(window) {
      const rows = await getClient().visit.findMany({
        where: { signedAt: { gt: window.from, lte: window.to }, sampledAt: null },
        select: { id: true },
        orderBy: [{ signedAt: 'asc' }, { id: 'asc' }],
      })
      return rows.map((row) => row.id)
    },

    async recordSample(input) {
      const client = getClient()
      const now = new Date()
      const [run] = await client.$transaction([
        client.reviewSampleRun.create({
          data: {
            ranAt: now,
            windowStart: input.windowStart,
            windowEnd: input.windowEnd,
            eligibleCount: input.eligibleCount,
            sampledCount: input.visitIds.length,
            rate: input.rate,
            triggeredById: input.triggeredById,
          },
        }),
      ])
      if (input.visitIds.length > 0) {
        await client.visit.updateMany({
          where: { id: { in: [...input.visitIds] }, sampledAt: null },
          data: { sampledAt: now, sampleRunId: run.id },
        })
      }
      return toReviewSampleRun(run)
    },

    async listQueue() {
      const rows = await getClient().visit.findMany({
        where: { sampledAt: { not: null }, reviewedAt: null },
        include: NOTE_INCLUDE,
        orderBy: [{ sampledAt: 'asc' }, { dateOfService: 'asc' }],
      })
      return rows.map(toReviewQueueItem)
    },

    async findNote(visitId) {
      const row = await getClient().visit.findFirst({
        where: { id: visitId, sampledAt: { not: null } },
        include: NOTE_INCLUDE,
      })
      return row === null ? null : toReviewNote(row)
    },

    async signOff(input) {
      const client = getClient()
      // Conditional on being in the queue: a second sign-off, or one on a
      // note never sampled, updates nothing and reports null.
      const { count } = await client.visit.updateMany({
        where: { id: input.visitId, sampledAt: { not: null }, reviewedAt: null },
        data: {
          reviewedById: input.reviewerId,
          reviewComments: input.comments ?? null,
          reviewedAt: new Date(),
        },
      })
      if (count === 0) return null
      const row = await client.visit.findUnique({ where: { id: input.visitId }, include: NOTE_INCLUDE })
      return row === null ? null : toReviewNote(row)
    },
  }
}
