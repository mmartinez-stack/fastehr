/**
 * Random sampling of signed clinic notes for medical-director review
 * (DIA-74, ADR 30). Pure: the caller supplies the eligible set and, in
 * tests, the random source.
 *
 * "Five percent, minimum one" is `ceil(n / rate)` with `rate = 20`: 1 of 1,
 * 1 of 19, 2 of 21, 5 of 100. Rounding up rather than to nearest means a
 * small clinic week still gets a note reviewed, which is the point of a
 * minimum. The pick is a partial Fisher–Yates shuffle, so every eligible
 * note has the same chance and no note is picked twice within a run.
 */

export const REVIEW_SAMPLE_RATE_DEFAULT = 20

/** How many of `eligible` a run reviews at "1 in `rate`", never fewer than one when there are any. */
export function reviewSampleSize(eligible: number, rate: number): number {
  if (!Number.isInteger(rate) || rate < 1) throw new RangeError('rate must be a positive integer')
  if (eligible <= 0) return 0
  return Math.max(1, Math.ceil(eligible / rate))
}

export function sampleForReview<T>(
  eligible: readonly T[],
  options: { rate?: number; random?: () => number } = {},
): T[] {
  const rate = options.rate ?? REVIEW_SAMPLE_RATE_DEFAULT
  const random = options.random ?? Math.random
  const size = reviewSampleSize(eligible.length, rate)

  const pool = [...eligible]
  const picked: T[] = []
  for (let i = 0; i < size; i += 1) {
    // Pick uniformly from the unpicked tail and swap it into position i.
    const j = i + Math.floor(random() * (pool.length - i))
    const chosen = pool[j]
    const current = pool[i]
    if (chosen === undefined || current === undefined) break
    pool[j] = current
    pool[i] = chosen
    picked.push(chosen)
  }
  return picked
}
