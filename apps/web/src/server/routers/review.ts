import { reviewNoteInput, runReviewSampleInput, signOffReviewInput } from '@fastehr/contracts'
import { TRPCError } from '@trpc/server'
import { adminProcedure, medicalDirectorProcedure } from '../procedures.ts'
import { runReviewSample } from '../review-sampling.ts'
import { router } from '../trpc.ts'

/**
 * Medical-director review (DIA-74, ADR 30, ADR 31). The queue, the note, and
 * the sign-off belong to the medical director role; the sampling run belongs
 * to the staff surface, admin and medical director alike (the scheduled job
 * runs it too, outside any session).
 */
export const reviewRouter = router({
  /** Sampled notes awaiting sign-off, oldest pick first. */
  queue: medicalDirectorProcedure.query(({ ctx }) => ctx.db.reviews.listQueue()),

  /** A sampled note with its body — a note outside the queue is not served here. */
  note: medicalDirectorProcedure.input(reviewNoteInput).query(async ({ ctx, input }) => {
    const note = await ctx.db.reviews.findNote(input.visitId)
    if (note === null) throw new TRPCError({ code: 'NOT_FOUND' })
    return note
  }),

  /** Sign off: reviewer, comments, and timestamp land on the note; it leaves the queue. */
  signOff: medicalDirectorProcedure.input(signOffReviewInput).mutation(async ({ ctx, input }) => {
    const reviewed = await ctx.db.reviews.signOff({
      visitId: input.visitId,
      reviewerId: ctx.actor.id,
      comments: input.comments,
    })
    if (reviewed === null) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'note is not in the review queue' })
    }
    return reviewed
  }),

  /** The scheduled run, on demand — for a catch-up, or a demo that cannot wait a week. */
  runSample: adminProcedure.input(runReviewSampleInput).mutation(({ ctx, input }) =>
    runReviewSample(ctx.db, {
      rate: input.rate,
      windowStart: input.windowStart === undefined ? undefined : new Date(input.windowStart),
      triggeredById: ctx.actor.id,
    }),
  ),
})
