import type { LocationSlug, PartnerScope } from '@fastehr/contracts'
import { db as defaultDb, type Db } from '@fastehr/db'
import { createAuditSink, type AuditSink } from '../audit-log.ts'
import { betterAuthKeyVerifier, type KeyVerifier } from './keys.ts'
import { createRateLimiter, type RateLimiter } from './rate-limit.ts'

/**
 * Request-scoped context for the partner API (ADR 38).
 *
 * Deliberately its own type rather than the tRPC `Context`: a partner call
 * must never be able to satisfy `requireRole` or reach a staff procedure, so
 * the actor shape does not overlap. What is shared is what should be: the
 * repositories (`Db`) and the audit sink (ADR 37), so the two chains write
 * one trail through one seam.
 */

/** An authenticated partner: the integration principal and the key it presented, minus anything secret. */
export interface PartnerActor {
  kind: 'integration'
  /** The integration principal's user id (ADR 36): the audit trail's `actorId`. */
  integrationId: string
  /** The key row's id: the audit trail's `apiKeyId`. */
  keyId: string
  name: string
  scopes: readonly PartnerScope[]
  /** Empty means every active clinic; otherwise the key sees only these (ADR 38: a boundary for a key). */
  locations: readonly LocationSlug[]
}

/** Facts the inner layers hand to the outermost audit layer. */
export interface AuditScope {
  patientId?: string
  verificationId?: string
  resourceKind?: string
  resourceId?: string
}

export interface PartnerContext {
  /** Null until the chain authenticates the key. */
  actor: PartnerActor | null
  db: Db
  audit: AuditSink
  /** The key verifier (ADR 36): Better Auth's plugin, or a fake in a test. */
  keys: KeyVerifier
  requestId: string
  ipAddress: string | null
  userAgent: string | null
  /** Injectable clock, so expiry and lockout tests need no waiting. */
  now: () => Date
  rateLimiter: RateLimiter
  auditScope: AuditScope
}

/** One limiter per process: the buckets are what a single container can offer (ADR 38). */
let sharedRateLimiter: RateLimiter | undefined

export function createPartnerContext({
  requestId,
  ipAddress,
  userAgent,
  db = defaultDb,
  audit = createAuditSink(db.audit),
  now = () => new Date(),
  rateLimiter = (sharedRateLimiter ??= createRateLimiter()),
  keys = betterAuthKeyVerifier(),
}: {
  requestId: string
  ipAddress: string | null
  userAgent: string | null
  db?: Db
  audit?: AuditSink
  now?: () => Date
  rateLimiter?: RateLimiter
  keys?: KeyVerifier
}): PartnerContext {
  return { actor: null, db, audit, keys, requestId, ipAddress, userAgent, now, rateLimiter, auditScope: {} }
}
