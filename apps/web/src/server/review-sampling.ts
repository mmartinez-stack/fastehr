import type { ReviewSampleRun } from '@fastehr/contracts'
import { REVIEW_SAMPLE_RATE_DEFAULT, sampleForReview } from '@fastehr/core'
import type { Db } from '@fastehr/db'

/**
 * One sampling run (DIA-74, ADR 30): the notes signed since the last run and
 * not already sampled, a random five percent of them (minimum one) into the
 * review queue, and a record of the run so the next one starts where this
 * one ended.
 *
 * Shared by the scheduled job (`apps/web/scripts/sample-notes-for-review.ts`)
 * and the admin's "run now" procedure, so the two cannot drift. Takes a `Db`
 * rather than importing one for the same reason procedures do: a test hands
 * in fakes.
 */

/** The first run's window when there is no previous run to start from. */
const FIRST_WINDOW_DAYS = 7

export async function runReviewSample(
  db: Db,
  options: {
    rate?: number
    /** Overrides the window start — a catch-up over older signatures. */
    windowStart?: Date
    now?: Date
    /** Null for the scheduled job; the admin who pressed "run now" otherwise. */
    triggeredById: string | null
    random?: () => number
  },
): Promise<ReviewSampleRun> {
  const now = options.now ?? new Date()
  const rate = options.rate ?? REVIEW_SAMPLE_RATE_DEFAULT
  const last = await db.reviews.lastRun()
  const windowStart =
    options.windowStart ??
    (last === null
      ? new Date(now.getTime() - FIRST_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      : new Date(last.windowEnd))

  const eligible = await db.reviews.listEligible({ from: windowStart, to: now })
  const picked = sampleForReview(eligible, { rate, random: options.random })

  return db.reviews.recordSample({
    visitIds: picked,
    windowStart,
    windowEnd: now,
    eligibleCount: eligible.length,
    rate,
    triggeredById: options.triggeredById,
  })
}
