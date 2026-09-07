# ADR 30 — Medical-director review: a recorded sampling window, a flag, and the review on the note

**Status:** accepted  
**Applies to:** `packages/core/src/review-sampling.ts` · `packages/contracts/src/review.ts` · `packages/db/src/repositories/review.ts` · `apps/web/src/server/review-sampling.ts` · `apps/web/src/server/routers/review.ts` · `apps/web/scripts/sample-notes-for-review.ts`

The Aug 31 sync (DIA-74) asked for a scheduled job that puts a random five
percent (one in twenty, minimum one) of the clinic notes signed since its last
run into a review queue for the medical director, who opens each note,
comments, and signs off; and for a medical-director flag an admin can set.
Dr. Penn is the first holder.

## Decisions

- **The sampler is a pure function in `core`.** `sampleForReview(eligible,
  { rate, random })` takes ids and returns the picks: `ceil(n / rate)`, at
  least one when there are any, a partial Fisher–Yates shuffle. It is tested
  with a seeded generator, including a fairness check. Nothing about the
  database, the schedule, or who pressed the button lives there.
- **"Since the last run" is a recorded window, not a guess.** Each run writes
  a `ReviewSampleRun` row with the window it considered; the next run starts
  at that row's `windowEnd`. A run that is late, early, or triggered twice
  skips nothing and re-samples nothing, because eligibility is also "never
  sampled" (`sampledAt IS NULL`). The first run looks back seven days; a
  manual run may name an earlier start to catch up.
- **Cadence belongs to the scheduler.** The job is a script
  (`apps/web/scripts/sample-notes-for-review.ts`, `--rate`, `--since`) meant
  for a weekly cron line in the deployment runbook. The same function backs
  an admin's "run now" on the review page, so the two cannot drift, and a
  demo does not wait a week.
- **The flag is a column on the user, orthogonal to the role.** The reviewer
  is a provider who also reviews; an admin may or may not be one. The queue,
  the note, and the sign-off are gated on the flag alone
  (`medicalDirectorProcedure`); the run is gated on `admin`. The flag travels
  to the client with the session identity and only decides what the nav
  shows.
- **The review lives on the note.** Reviewer, comments, and timestamp are
  columns on the visit, the way the legacy review co-signature was. A note is
  in the queue while `sampledAt` is set and `reviewedAt` is not; signing off
  is a conditional write, so it happens once. `visits.reviewedById` is
  `ON DELETE RESTRICT` and the staff delete refuses a reviewer by name, like
  a signer.
- **The reviewer reads sampled notes only.** `review.note` serves a note that
  was sampled; the rest of the chart is not this queue's to show. Charting
  proper, when it lands, is a different surface with its own rules.

## What was given up

- Only the note body and its signature are shown — the visit's vitals,
  dispensing, and billing were not imported and are not needed to review the
  note as the ticket describes it.
- The stub sampling is uniform over signed notes. Stratifying by provider or
  office was not asked for and would be a change to the sampler alone.
