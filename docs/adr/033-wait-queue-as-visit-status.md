# ADR 33 — The wait-time queue is a status on the visit, and the place in line is derived

**Status:** accepted 2026-09-13 (DIA-42, DIA-43; the data layer, the screen follows)  
**Applies to:** `packages/contracts/src/queue.ts` · `packages/core/src/wait-queue.ts` · `packages/db/prisma/schema.prisma` · `packages/db/prisma/migrations/20260913200000_visit_wait_queue` · `packages/db/src/repositories/queue.ts` · `packages/db/scripts/migrate-visits.ts`

DIA-42 decided the wait-time queue with Joshua Penn: **status-based**, the
front desk marks a patient Arrived and then Roomed, and the patient leaves
the queue on the provider's **first write** to the record, however partial.
Opening the chart is not a trigger. A manual "Seen / Remove from Queue"
covers the provider who saw the patient and will chart later. DIA-48 placed
the status on the appointment, `scheduled → arrived → roomed → in-progress →
closed`, with Closed on sign-off, and walk-ins entering the same way as
booked patients. The clinic also wants the number a waiting patient can be
told: how many are before them.

## Current state

`/queues` reads the mockup fixtures. Its two cards are the legacy model,
which was only "visits without a signature" and "visits signed today";
the legacy system had no arrival state, no rooming, and no wait time (its
`seen` flag was set by signing). There is no Appointment table and no
schedule: DIA-48 and DIA-49 delivered the imported **visit** (date of
service, note, signature, and since ADR 30 the review), not a status. There
is no visit write path either. The provider's write to "the record" today
is the Medical tab save on the patient (`patient.updateClinical`).

## Decisions

1. **Status on the visit, no queue table.** `visits.status` is an enum,
   `scheduled | arrived | roomed | in_progress | closed`, with `arrivedAt`
   (the wait-time source), `roomedAt`, and `startedAt` (when the patient
   left the queue). "In the queue" is `status IN (arrived, roomed)`; there
   is no second source of truth to reconcile, which is what DIA-42 asked
   for. An Appointment entity, when scheduling arrives, is a row that
   *becomes* a visit on arrival, not a place for this status to move to.
2. **Arrival creates the visit.** There is nothing to arrive against, so
   `queue.arrive` creates a visit at the clinic with `status = arrived`,
   `arrivedAt = now`, the date of service set to the same instant, and the
   `office` string set to the clinic's legacy name so everything that still
   reads `office` (the roster, the review queue) sees the visit as it sees
   an imported one. A patient already waiting at that clinic is returned
   as they are: the second click is the double click.
3. **Every transition is conditional on the status it leaves.** Room
   requires `arrived`; Seen and the write trigger require `arrived` or
   `roomed`. A repeat or a race changes nothing and reports `null` (or a
   count of zero), so the screen can say "already seen" rather than
   silently re-stamp a timestamp.
4. **The trigger is a repository call the write path makes, never a read.**
   `queue.startFromRecordWrite(patientId)` moves that patient's waiting
   visits to `in_progress`. It is the mutation's job to call it (the
   Medical tab save first; visit charting when it lands), and it is a test's
   job to prove `patient.byId` does not. The manual Seen is the same
   transition by hand (`queue.remove`).
5. **The place in line is computed, not stored.** The repository returns
   the waiting rows of one clinic, or of all clinics with each clinic's
   rows contiguous, in arrival order. `rankWaitQueue` in `core` assigns
   `position` and `patientsAhead` per clinic from that order alone, and
   `minutesWaiting` is the wait time from `arrivedAt`. The "3 patients are
   before you" number is therefore a pure function over statuses,
   testable without a database and reusable for a patient-facing message
   without a second implementation.
6. **History never waited.** The backfill and the import script set a
   signed visit to `closed` and an unsigned one to `in_progress` (with
   `startedAt` = the date of service): the legacy "unsigned" queue, which
   is charting owed, not a patient in a chair. Neither enters the wait
   queue. New rows default to `scheduled`, which nothing creates yet.
7. **The provider on the visit is an assignment, not a record.**
   `providerId` is the clinician the front desk expects to see the patient
   (DIA-43: providers see their own patients), nullable, `ON DELETE SET
   NULL`, unlike a signature which is `RESTRICT`. Who actually signed is
   still `signedById`.

## What is not here

- **Closed on sign-off.** No provider sign-off path exists; the review
  sign-off (ADR 30) is the medical director's, not the provider's. The
  status moves to `closed` when visit charting gets its sign-off.
- **The screen and the procedures.** `/queues` on real data, the arrive
  and room actions on the front desk's path, the provider's own-patients
  filter, and the read-only test on `patient.byId` are the next slice.
- **Telling the patient.** The count exists; the channel (a text on
  arrival, a display) is a product decision with the SMS provider
  (DIA-67).
