import { describe, expect, it } from 'vitest'
import { reviewSampleSize, sampleForReview } from './review-sampling.ts'

/** A tiny deterministic generator, so the picks are reproducible. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0
    return state / 2 ** 32
  }
}

describe('reviewSampleSize', () => {
  it('is five percent rounded up, at one in twenty', () => {
    expect(reviewSampleSize(100, 20)).toBe(5)
    expect(reviewSampleSize(21, 20)).toBe(2)
    expect(reviewSampleSize(19, 20)).toBe(1)
  })

  it('is never fewer than one when anything is eligible, and zero when nothing is', () => {
    expect(reviewSampleSize(1, 20)).toBe(1)
    expect(reviewSampleSize(0, 20)).toBe(0)
  })

  it('follows a configured rate', () => {
    expect(reviewSampleSize(100, 10)).toBe(10)
    expect(reviewSampleSize(100, 1)).toBe(100)
    expect(() => reviewSampleSize(100, 0)).toThrow(RangeError)
  })
})

describe('sampleForReview', () => {
  const notes = Array.from({ length: 100 }, (_, i) => `note-${i}`)

  it('picks the sample size, without repeats, from the eligible set', () => {
    const picked = sampleForReview(notes, { random: seeded(1) })

    expect(picked).toHaveLength(5)
    expect(new Set(picked).size).toBe(5)
    for (const note of picked) expect(notes).toContain(note)
  })

  it('is deterministic for a given random source and different across sources', () => {
    expect(sampleForReview(notes, { random: seeded(7) })).toEqual(sampleForReview(notes, { random: seeded(7) }))
    expect(sampleForReview(notes, { random: seeded(7) })).not.toEqual(sampleForReview(notes, { random: seeded(8) }))
  })

  it('does not mutate the input', () => {
    const before = [...notes]
    sampleForReview(notes, { random: seeded(3) })
    expect(notes).toEqual(before)
  })

  it('returns everything at rate 1 and nothing for an empty set', () => {
    expect(sampleForReview(['a', 'b', 'c'], { rate: 1, random: seeded(2) }).sort()).toEqual(['a', 'b', 'c'])
    expect(sampleForReview([], { random: seeded(2) })).toEqual([])
  })

  it('gives every note a fair chance over many runs', () => {
    // Each of 20 notes should be picked in roughly 1/20 of 4000 single-pick
    // runs — far from exact, but a biased shuffle would fall well outside.
    const small = Array.from({ length: 20 }, (_, i) => i)
    const counts = new Array<number>(20).fill(0)
    const random = seeded(11)
    for (let run = 0; run < 4000; run += 1) {
      const [pick] = sampleForReview(small, { random })
      if (pick !== undefined) counts[pick] = (counts[pick] ?? 0) + 1
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(120)
      expect(count).toBeLessThan(280)
    }
  })
})
