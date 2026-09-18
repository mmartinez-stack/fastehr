import { describe, expect, it } from 'vitest'
import { createRateLimiter, perMinute } from './rate-limit.ts'

describe('rate limiter', () => {
  it('allows a burst up to capacity, then refills over time', () => {
    const limiter = createRateLimiter()
    const limit = perMinute(60)
    const start = new Date('2026-09-17T12:00:00.000Z')

    for (let i = 0; i < 60; i += 1) expect(limiter.take('k', limit, start).allowed).toBe(true)
    const refused = limiter.take('k', limit, start)
    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 1 })

    expect(limiter.peek('k', limit, new Date(start.getTime() + 500))).toBe(false)
    expect(limiter.take('k', limit, new Date(start.getTime() + 1000)).allowed).toBe(true)
  })

  it('keeps buckets apart by key', () => {
    const limiter = createRateLimiter()
    const limit = { capacity: 1, refillPerSecond: 0 }
    const now = new Date()
    expect(limiter.take('a', limit, now).allowed).toBe(true)
    expect(limiter.take('a', limit, now).allowed).toBe(false)
    expect(limiter.take('b', limit, now).allowed).toBe(true)
  })
})
