/**
 * The scheduled sampling job (DIA-74, ADR 30): picks a random five percent
 * (minimum one) of the clinic notes signed since the last run and puts them
 * in the medical-director review queue.
 *
 * The cadence is the scheduler's, not this script's: run it weekly from cron
 * (docs/runbooks/deploy-development-ec2.md) or whenever a catch-up is
 * wanted — the window always starts where the last run ended, so running it
 * late or twice skips nothing and samples nothing twice. The same function
 * backs the admin's "run now" button.
 *
 * Usage (from the repo root, with DATABASE_URL in the environment):
 *   node apps/web/scripts/sample-notes-for-review.ts               # 1 in 20
 *   node apps/web/scripts/sample-notes-for-review.ts --rate 10      # 1 in 10
 *   node apps/web/scripts/sample-notes-for-review.ts --since 2026-08-01
 */
import { db } from '@fastehr/db'
import { runReviewSample } from '../src/server/review-sampling.ts'

function parseArgs(argv: readonly string[]): { rate: number | undefined; since: Date | undefined } {
  let rate: number | undefined
  let since: Date | undefined
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue
    else if (arg === '--rate') {
      rate = Number(argv[i + 1])
      if (!Number.isInteger(rate) || rate < 1) throw new Error('--rate must be a positive integer')
      i += 1
    } else if (arg === '--since') {
      since = new Date(`${argv[i + 1]}T00:00:00Z`)
      if (Number.isNaN(since.getTime())) throw new Error('--since must be a YYYY-MM-DD date')
      i += 1
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  return { rate, since }
}

const { rate, since } = parseArgs(process.argv.slice(2))
const run = await runReviewSample(db, { rate, windowStart: since, triggeredById: null })

console.log(
  `review sample: ${run.sampledCount} of ${run.eligibleCount} notes signed between ` +
    `${run.windowStart} and ${run.windowEnd} (1 in ${run.rate}) added to the queue`,
)
