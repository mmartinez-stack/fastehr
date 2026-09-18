import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  PATIENT_VERIFICATION_HEADER,
  PATIENT_VERIFICATION_TTL_MINUTES,
  VERIFICATION_LOCKOUT,
  type PatientVerification,
} from '@fastehr/contracts'
import type { PartnerContext } from './context.ts'
import { PartnerApiError } from './errors.ts'

/**
 * Patient verification tokens and the lockout (ADR 36).
 *
 * The token is 32 random bytes, base64url; only its SHA-256 is stored, as
 * with the intake token (ADR 29). It is bound to one client and one
 * patient and honoured for a short window; a bot makes several calls per
 * conversation, so it is reusable within that window rather than single
 * use. Every way a presented token can be wrong (absent, unknown, expired,
 * another client's, another patient's) answers the same
 * `verification_required`, and it is decided before any patient row is
 * read, so it reveals nothing about the patient.
 */

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function minutesAgo(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60 * 1000)
}

/**
 * Refuses when the patient, or the whole client, has failed too often.
 * Failures are counted over the lock period (which contains the window),
 * and a success resets the patient's count: the first wrong answer after a
 * verified call is one, not six.
 */
export async function assertNotLockedOut(
  ctx: PartnerContext,
  { clientId, patientId }: { clientId: string; patientId: string },
): Promise<void> {
  const now = ctx.now()
  const { perPatient, perClient } = VERIFICATION_LOCKOUT

  const lastSuccess = await ctx.db.verifications.lastSuccessAt({ apiClientId: clientId, patientId })
  const patientWindowStart = minutesAgo(now, perPatient.lockMinutes)
  const patientSince =
    lastSuccess !== null && lastSuccess.getTime() > patientWindowStart.getTime() ? lastSuccess : patientWindowStart
  const patientFailures = await ctx.db.verifications.countFailedAttempts({
    apiClientId: clientId,
    patientId,
    since: patientSince,
  })
  if (patientFailures >= perPatient.maxFailures) {
    throw new PartnerApiError('verification_locked', { retryAfterSeconds: perPatient.lockMinutes * 60 })
  }

  const clientFailures = await ctx.db.verifications.countFailedAttempts({
    apiClientId: clientId,
    since: minutesAgo(now, perClient.lockMinutes),
  })
  if (clientFailures >= perClient.maxFailures) {
    // The signature of a key being used to enumerate: worth its own line.
    console.warn('[partner-api] verify paused for client', ctx.actor?.keyId ?? clientId, ctx.requestId)
    throw new PartnerApiError('verification_locked', { retryAfterSeconds: perClient.lockMinutes * 60 })
  }
}

/**
 * Whether the presented factors match the stored ones, in constant time:
 * both sides are hashed and the digests compared, so a wrong date of birth
 * and a wrong phone take the same time, and so does a patient with no
 * phone on file (compared against a random digest).
 */
export function factorsMatch(
  stored: { dateOfBirth: string; phone: string | null } | undefined,
  presented: { dateOfBirth: string; phone: string },
): boolean {
  const expected =
    stored === undefined || stored.phone === null
      ? randomBytes(32)
      : createHash('sha256').update(`${stored.dateOfBirth}|${stored.phone}`).digest()
  const actual = createHash('sha256').update(`${presented.dateOfBirth}|${presented.phone}`).digest()
  return timingSafeEqual(expected, actual)
}

export async function issueVerificationToken(
  ctx: PartnerContext,
  { clientId, patientId }: { clientId: string; patientId: string },
): Promise<{ token: string; expiresAt: Date; verification: PatientVerification }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(ctx.now().getTime() + PATIENT_VERIFICATION_TTL_MINUTES * 60 * 1000)
  const verification = await ctx.db.verifications.create({
    apiClientId: clientId,
    patientId,
    tokenHash: hashToken(token),
    method: 'dob_phone',
    expiresAt,
    requestId: ctx.requestId,
    ipAddress: ctx.ipAddress,
  })
  return { token, expiresAt, verification }
}

export async function resolveVerification(
  ctx: PartnerContext,
  { clientId, patientId, headers }: { clientId: string; patientId: string; headers: Headers },
): Promise<PatientVerification> {
  const refuse = () => new PartnerApiError('verification_required')

  const token = headers.get(PATIENT_VERIFICATION_HEADER)?.trim() ?? ''
  if (token.length < 16 || token.length > 256) throw refuse()

  const verification = await ctx.db.verifications.findByTokenHash(hashToken(token))
  if (verification === null) throw refuse()
  const now = ctx.now()
  if (new Date(verification.expiresAt).getTime() <= now.getTime()) throw refuse()
  if (verification.apiClientId !== clientId || verification.patientId !== patientId) throw refuse()

  await ctx.db.verifications.markUsed(verification.id, now)
  return verification
}
