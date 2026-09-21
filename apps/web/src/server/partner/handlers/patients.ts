import { createHash } from 'node:crypto'
import {
  PARTNER_RATE_LIMITS,
  PATIENT_LOOKUP_LIMIT,
  type lookupPatientsOperation,
  type verifyPatientOperation,
} from '@fastehr/contracts'
import type { OperationHandler } from '../chain.ts'
import { PartnerApiError } from '../errors.ts'
import { assertNotLockedOut, factorsMatch, issueVerificationToken } from '../verification.ts'

/**
 * Patient lookup and verification (ADR 38).
 *
 * Lookup answers the minimum the bot needs to disambiguate: names, the last
 * four digits of the phone, the clinic, and the id. Never the date of
 * birth, which is a verification factor. More matches than the cap answers
 * an empty list with `truncated`, so the bot asks for another identifier
 * rather than paging through the roster.
 *
 * Verify compares both factors in constant time, records the attempt
 * before answering (the lockout counts on it), and mints the token only on
 * a match. Every failure is one code.
 */

/** One bucket per distinct identifier set an integration asks about, keyed by a hash so the identifiers are not held in memory. */
function identifierKey(integrationId: string, body: Record<string, string | undefined>): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([body.patientId, body.dateOfBirth, body.phone, body.lastName?.toLowerCase(), body.firstName?.toLowerCase()]))
    .digest('hex')
  return `lookup:${integrationId}:${digest}`
}

export const lookupPatients: OperationHandler<typeof lookupPatientsOperation> = async ({ ctx, body }) => {
  const perIdentifier = ctx.rateLimiter.take(
    identifierKey(ctx.actor.integrationId, body),
    { capacity: PARTNER_RATE_LIMITS.identityPerIdentifierPerTenMinutes, refillPerSecond: PARTNER_RATE_LIMITS.identityPerIdentifierPerTenMinutes / 600 },
    ctx.now(),
  )
  if (!perIdentifier.allowed) throw new PartnerApiError('rate_limited', { retryAfterSeconds: perIdentifier.retryAfterSeconds })

  const rows = await ctx.db.patients.lookup({
    ...body,
    locationIds: ctx.actor.locations,
    limit: PATIENT_LOOKUP_LIMIT + 1,
  })
  if (rows.length > PATIENT_LOOKUP_LIMIT) return { candidates: [], truncated: true }

  return {
    candidates: rows.map((row) => ({
      patientId: row.patientId,
      firstName: row.firstName,
      lastName: row.lastName,
      phoneLast4: row.phone === null ? null : row.phone.slice(-4),
      locationId: row.locationId,
    })),
    truncated: false,
  }
}

export const verifyPatient: OperationHandler<typeof verifyPatientOperation> = async ({ ctx, params, body }) => {
  const { patientId } = params
  const integrationId = ctx.actor.integrationId
  // The subject of this access is the patient named in the path, whether or
  // not the factors match: a failed attempt is recorded against them.
  ctx.auditScope.patientId = patientId

  await assertNotLockedOut(ctx, { integrationId, patientId })

  const [stored] = await ctx.db.patients.lookup({ patientId, locationIds: ctx.actor.locations, limit: 1 })
  const matched = factorsMatch(stored, body)
  await ctx.db.verifications.recordAttempt({ integrationId, patientId, succeeded: matched, ipAddress: ctx.ipAddress })
  if (!matched) throw new PartnerApiError('verification_failed')

  const issued = await issueVerificationToken(ctx, { integrationId, patientId })
  ctx.auditScope.verificationId = issued.verification.id
  return { verified: true, verificationToken: issued.token, expiresAt: issued.expiresAt.toISOString() }
}
