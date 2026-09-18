import { z } from 'zod'
import { locationSlugSchema } from '../location.ts'
import { API_KEY_ENVIRONMENTS, API_KEY_ID_LENGTH } from './api-key.ts'
import { partnerScopeSchema } from './scopes.ts'

/**
 * Partner API clients and patient verifications (ADR 36).
 *
 * An `ApiClient` is one partner integration holding one key. The row keeps
 * the key's public id and the hash of its secret; neither the secret nor
 * the hash ever leaves `packages/db` (the mapper does not map the hash).
 *
 * A `PatientVerification` is what the verify endpoint mints: a token bound
 * to one client and one patient, good for a short window, presented on every
 * patient-specific call. Only its hash is stored, as with the intake token
 * (ADR 29).
 */

export const API_CLIENT_STATUSES = ['active', 'revoked'] as const
export const apiClientStatusSchema = z.enum(API_CLIENT_STATUSES)
export type ApiClientStatus = z.infer<typeof apiClientStatusSchema>

/** A key must expire. Ninety days by default, a year at most (ADR 36). */
export const API_KEY_DEFAULT_TTL_DAYS = 90
export const API_KEY_MAX_TTL_DAYS = 365

/** How long a verification token is honoured. */
export const PATIENT_VERIFICATION_TTL_MINUTES = 15

/** The header a verified call carries the token in. */
export const PATIENT_VERIFICATION_HEADER = 'x-patient-verification'

/**
 * Lockout thresholds, counted in the database so they survive a restart.
 * Per patient: five failures in the window locks that patient for the lock
 * period. Per client: fifty failures in the window pauses the client's
 * verify endpoint, which is the signature of a key being used to enumerate.
 */
export const VERIFICATION_LOCKOUT = {
  perPatient: { maxFailures: 5, windowMinutes: 15, lockMinutes: 30 },
  perClient: { maxFailures: 50, windowMinutes: 10, lockMinutes: 10 },
} as const

/**
 * Rate limits, per key, per minute, as token buckets in the server process.
 * The numbers are here so the vendor documentation and the code agree.
 */
export const PARTNER_RATE_LIMITS = {
  /** Every operation together. */
  perClientPerMinute: 120,
  /** Lookup and verify, which are the enumeration surface. */
  identityPerClientPerMinute: 30,
  /** Lookups for one normalised identifier set, per client, per ten minutes. */
  identityPerIdentifierPerTenMinutes: 5,
  /** Failed authentications per source address per minute, checked before any database read. */
  failedAuthPerIpPerMinute: 30,
} as const

/** An IPv4 or IPv6 address, optionally with a CIDR suffix. */
export const ipAllowlistEntrySchema = z
  .string()
  .trim()
  .regex(/^(\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?|[0-9a-fA-F:]+(\/\d{1,3})?)$/)

export const apiClientSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  vendor: z.string().min(1).max(120).nullable(),
  environment: z.enum(API_KEY_ENVIRONMENTS),
  keyId: z.string().length(API_KEY_ID_LENGTH),
  scopes: z.array(partnerScopeSchema),
  /** Empty means any source address. */
  allowedIps: z.array(ipAllowlistEntrySchema),
  /** Empty means every active clinic; otherwise the key sees only these. */
  locationIds: z.array(locationSlugSchema),
  status: apiClientStatusSchema,
  expiresAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  /** When the business associate agreement was signed; a live key is not issued without one. */
  baaSignedAt: z.iso.date().nullable(),
  /** The operator who issued the key, as typed at the CLI. */
  issuedBy: z.string().min(1).max(200),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
})
export type ApiClient = z.infer<typeof apiClientSchema>

export const createApiClientInput = z
  .object({
    name: apiClientSchema.shape.name,
    vendor: z.string().trim().min(1).max(120).optional(),
    environment: apiClientSchema.shape.environment,
    scopes: z.array(partnerScopeSchema).min(1),
    allowedIps: z.array(ipAllowlistEntrySchema).default([]),
    locationIds: z.array(locationSlugSchema).default([]),
    expiresInDays: z.number().int().min(1).max(API_KEY_MAX_TTL_DAYS).default(API_KEY_DEFAULT_TTL_DAYS),
    baaSignedAt: z.iso.date().optional(),
    issuedBy: apiClientSchema.shape.issuedBy,
  })
  .refine((input) => input.environment !== 'live' || input.baaSignedAt !== undefined)
export type CreateApiClientInput = z.infer<typeof createApiClientInput>

export const PATIENT_VERIFICATION_METHODS = ['dob_phone'] as const
export const patientVerificationMethodSchema = z.enum(PATIENT_VERIFICATION_METHODS)
export type PatientVerificationMethod = z.infer<typeof patientVerificationMethodSchema>

export const patientVerificationSchema = z.object({
  id: z.uuid(),
  apiClientId: z.uuid(),
  patientId: z.uuid(),
  method: patientVerificationMethodSchema,
  expiresAt: z.iso.datetime(),
  useCount: z.number().int().min(0),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type PatientVerification = z.infer<typeof patientVerificationSchema>
