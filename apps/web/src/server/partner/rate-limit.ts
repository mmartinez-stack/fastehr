/**
 * Token buckets in process memory (ADR 37).
 *
 * One bucket per key: a partner client, a client and operation class, a
 * source address. Each has a capacity and a refill rate; a request takes
 * one token or is told how long until the next one. The buckets reset on
 * deploy and are per container, which is acceptable because the controls
 * that carry the security property, the verification lockouts, are counted
 * in the database (./verification.ts). These buckets keep a chatty or
 * broken integration from turning into load.
 */

export interface RateLimit {
  capacity: number
  refillPerSecond: number
}

export interface RateLimitDecision {
  allowed: boolean
  /** Seconds until a token will be available; 0 when allowed. */
  retryAfterSeconds: number
}

export interface RateLimiter {
  /** Takes one token from the bucket, creating it full if unseen. */
  take(key: string, limit: RateLimit, now: Date): RateLimitDecision
  /** Whether a take would succeed, without taking. */
  peek(key: string, limit: RateLimit, now: Date): boolean
}

interface Bucket {
  tokens: number
  updatedAt: number
}

/** Buckets untouched this long are dropped on the next sweep. */
const STALE_MS = 15 * 60 * 1000
const SWEEP_EVERY = 1000

/** A limit expressed per minute, the way the contract states them. */
export function perMinute(count: number): RateLimit {
  return { capacity: count, refillPerSecond: count / 60 }
}

export function createRateLimiter(): RateLimiter {
  const buckets = new Map<string, Bucket>()
  let sinceSweep = 0

  function refill(key: string, limit: RateLimit, nowMs: number): Bucket {
    const bucket = buckets.get(key) ?? { tokens: limit.capacity, updatedAt: nowMs }
    const elapsed = Math.max(0, nowMs - bucket.updatedAt) / 1000
    bucket.tokens = Math.min(limit.capacity, bucket.tokens + elapsed * limit.refillPerSecond)
    bucket.updatedAt = nowMs
    buckets.set(key, bucket)
    return bucket
  }

  function sweep(nowMs: number): void {
    sinceSweep += 1
    if (sinceSweep < SWEEP_EVERY) return
    sinceSweep = 0
    for (const [key, bucket] of buckets) {
      if (nowMs - bucket.updatedAt > STALE_MS) buckets.delete(key)
    }
  }

  return {
    take(key, limit, now) {
      const nowMs = now.getTime()
      sweep(nowMs)
      const bucket = refill(key, limit, nowMs)
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1
        return { allowed: true, retryAfterSeconds: 0 }
      }
      const deficit = 1 - bucket.tokens
      return { allowed: false, retryAfterSeconds: Math.ceil(deficit / limit.refillPerSecond) }
    },

    peek(key, limit, now) {
      return refill(key, limit, now.getTime()).tokens >= 1
    },
  }
}
