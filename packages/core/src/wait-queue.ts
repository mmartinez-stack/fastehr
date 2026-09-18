import type { WaitQueueEntry, WaitQueueRow } from '@fastehr/contracts'

/**
 * The wait-time queue's arithmetic (ADR 33): a place in line and the count
 * a patient is told, from the ordered statuses alone. Pure, so the "3
 * patients are before you" number is testable without a database, and so
 * the same function serves the staff screen and any patient-facing message.
 */

/**
 * Ranks rows within each clinic by arrival. Rows for one clinic are
 * expected in arrival order (the repository orders them); rows for
 * several clinics may be interleaved, and each clinic's line is counted on
 * its own. Output keeps the input order.
 */
export function rankWaitQueue(rows: readonly WaitQueueRow[]): WaitQueueEntry[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const ahead = seen.get(row.locationId) ?? 0
    seen.set(row.locationId, ahead + 1)
    return { ...row, position: ahead + 1, patientsAhead: ahead }
  })
}

/** Whole minutes since arrival; never negative, so a clock skew reads as zero. */
export function minutesWaiting(arrivedAt: string, now: Date): number {
  const elapsed = now.getTime() - new Date(arrivedAt).getTime()
  return Math.max(0, Math.floor(elapsed / 60_000))
}
