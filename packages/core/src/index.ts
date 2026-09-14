import type { Patient } from '@fastehr/contracts'

/**
 * Seed domain function — pure, framework-free, no I/O.
 *
 * `core` depends on `@fastehr/contracts` and nothing else. It has no `next` and
 * no `@prisma/client` in its manifest, so pnpm's isolated node_modules makes
 * those imports fail to resolve outright (ADR 2).
 */
export { REVIEW_SAMPLE_RATE_DEFAULT, reviewSampleSize, sampleForReview } from './review-sampling.ts'
export { minutesWaiting, rankWaitQueue } from './wait-queue.ts'

export function patientDisplayName(patient: Pick<Patient, 'firstName' | 'lastName'>): string {
  return `${patient.lastName}, ${patient.firstName}`
}
