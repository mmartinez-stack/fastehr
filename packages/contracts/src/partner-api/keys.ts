import { z } from 'zod'
import { locationSlugSchema } from '../location.ts'
import { API_KEY_ENVIRONMENTS } from './api-key.ts'
import { API_SCOPES, partnerScopeSchema, type PartnerScope } from './scopes.ts'

/**
 * Integration keys and patient verifications (ADR 36, ADR 38).
 *
 * A key belongs to an **integration principal**: a `users` row with the
 * `integration` role, which holds no human surface. The key itself is a
 * Better Auth `apiKey` row; what this module describes is the part of that
 * row the application reads and writes: the scopes, carried as the
 * plugin's `permissions`, and the settings the clinic attaches, carried as
 * its `metadata`. Neither the key nor its hash ever leaves the plugin.
 *
 * A `PatientVerification` is what the verify endpoint mints: a token bound
 * to one integration and one patient, good for a short window, presented
 * on every patient-specific call. Only its hash is stored, as with the
 * intake token (ADR 29).
 */

/** A key must expire. Ninety days by default, a year at most (ADR 36). */
export const API_KEY_DEFAULT_TTL_DAYS = 90
export const API_KEY_MAX_TTL_DAYS = 365

/** A replaced key keeps working this long, so a partner cuts over without an outage. */
export const API_KEY_ROTATION_OVERLAP_HOURS = 24
/** A partner account may rotate its own key at most this often (ADR 36 as amended). */
export const API_KEY_SELF_ROTATION_MIN_INTERVAL_MINUTES = 60

/** How long a verification token is honoured. */
export const PATIENT_VERIFICATION_TTL_MINUTES = 15

/** The header a verified call carries the token in. */
export const PATIENT_VERIFICATION_HEADER = 'x-patient-verification'

/**
 * Lockout thresholds, counted in the database so they survive a restart.
 * Per patient: five failures in the window locks that patient for the lock
 * period. Per integration: fifty failures in the window pauses its verify
 * endpoint, which is the signature of a key being used to enumerate.
 */
export const VERIFICATION_LOCKOUT = {
  perPatient: { maxFailures: 5, windowMinutes: 15, lockMinutes: 30 },
  perIntegration: { maxFailures: 50, windowMinutes: 10, lockMinutes: 10 },
} as const

/**
 * Rate limits. The overall limit per key is the plugin's own, a counter on
 * the key row, so it survives a deploy and is shared by every container.
 * The finer buckets are token buckets in the server process. The numbers
 * are here so the vendor documentation and the code agree.
 */
export const PARTNER_RATE_LIMITS = {
  /** Every operation together, per key, enforced by the key row. */
  perKeyPerMinute: 120,
  /** Lookup and verify, which are the enumeration surface. */
  identityPerIntegrationPerMinute: 30,
  /** Lookups for one normalised identifier set, per integration, per ten minutes. */
  identityPerIdentifierPerTenMinutes: 5,
  /** Failed authentications per source address per minute, checked before any database read. */
  failedAuthPerIpPerMinute: 30,
} as const

/** An IPv4 or IPv6 address, optionally with a CIDR suffix. */
export const ipAllowlistEntrySchema = z
  .string()
  .trim()
  .regex(/^(\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?|[0-9a-fA-F:]+(\/\d{1,3})?)$/)

/**
 * What the clinic attaches to a key, stored as the plugin's `metadata`.
 * Read back with `safeParse` and refused as a whole when it does not fit:
 * a row edited by hand into an unknown shape must not become a permission.
 */
export const apiKeyMetadataSchema = z.object({
  environment: z.enum(API_KEY_ENVIRONMENTS),
  vendor: z.string().min(1).max(120).nullable().default(null),
  /** Empty means any source address. */
  allowedIps: z.array(ipAllowlistEntrySchema).default([]),
  /** Empty means every active clinic; otherwise the key sees only these. */
  locationIds: z.array(locationSlugSchema).default([]),
  /** When the business associate agreement was signed; a live key is not issued without one. */
  baaSignedAt: z.iso.date().nullable().default(null),
  /** The operator who issued the key, as typed at the CLI. */
  issuedBy: z.string().min(1).max(200),
})
export type ApiKeyMetadata = z.infer<typeof apiKeyMetadataSchema>

/**
 * Scopes ride on the plugin's `permissions`, a `{ resource: [actions] }`
 * map. `patients:lookup` is `{ patients: ['lookup'] }`. Only the vocabulary
 * in `API_SCOPES` survives the round trip: an action a retired scope left
 * on a row is dropped on read, never promoted to a live permission.
 */
export type ApiKeyPermissions = Record<string, string[]>

export function scopesToPermissions(scopes: readonly PartnerScope[]): ApiKeyPermissions {
  const permissions: ApiKeyPermissions = {}
  for (const scope of scopes) {
    const [resource, action] = scope.split(':')
    if (resource === undefined || action === undefined) continue
    permissions[resource] = [...(permissions[resource] ?? []), action]
  }
  return permissions
}

export function permissionsToScopes(permissions: unknown): PartnerScope[] {
  const parsed = z.record(z.string(), z.array(z.string())).safeParse(permissions)
  if (!parsed.success) return []
  const scopes: PartnerScope[] = []
  for (const [resource, actions] of Object.entries(parsed.data)) {
    for (const action of actions) {
      const scope = partnerScopeSchema.safeParse(`${resource}:${action}`)
      if (scope.success && !scopes.includes(scope.data)) scopes.push(scope.data)
    }
  }
  return API_SCOPES.filter((scope) => scopes.includes(scope))
}

/** One key as the Users screen and the CLI list it: never the key, never its hash. */
export const integrationKeySchema = z.object({
  id: z.string().min(1),
  integrationId: z.string().min(1),
  name: z.string().min(1).max(120),
  /** The first characters, prefix included, for telling keys apart. */
  start: z.string().nullable(),
  scopes: z.array(partnerScopeSchema),
  enabled: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  metadata: apiKeyMetadataSchema.nullable(),
})
export type IntegrationKey = z.infer<typeof integrationKeySchema>

/** An integration principal with its keys, for the Users screen and the partner's own page. */
export const integrationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean(),
  /** Whether the partner's team can sign in to the integration page (ADR 36 as amended). */
  hasCredential: z.boolean(),
  createdAt: z.iso.datetime(),
  keys: z.array(integrationKeySchema),
})
export type Integration = z.infer<typeof integrationSchema>

export const issueIntegrationKeyInput = z
  .object({
    /** The integration's name; also the key's. */
    name: z.string().trim().min(1).max(120),
    vendor: z.string().trim().min(1).max(120).optional(),
    environment: z.enum(API_KEY_ENVIRONMENTS),
    scopes: z.array(partnerScopeSchema).min(1),
    allowedIps: z.array(ipAllowlistEntrySchema).default([]),
    locationIds: z.array(locationSlugSchema).default([]),
    expiresInDays: z.number().int().min(1).max(API_KEY_MAX_TTL_DAYS).default(API_KEY_DEFAULT_TTL_DAYS),
    baaSignedAt: z.iso.date().optional(),
    issuedBy: z.string().trim().min(1).max(200),
  })
  .refine((input) => input.environment !== 'live' || input.baaSignedAt !== undefined)
export type IssueIntegrationKeyInput = z.infer<typeof issueIntegrationKeyInput>

/** The partner account asks to replace one of its own keys. */
export const rotateIntegrationKeyInput = z.object({
  keyId: z.string().min(1),
})
export type RotateIntegrationKeyInput = z.infer<typeof rotateIntegrationKeyInput>

/**
 * The one response that ever carries a key: the answer to a rotation, shown
 * once. Nothing stores it; a page copies it and forgets it.
 */
export const rotatedIntegrationKeySchema = z.object({
  key: z.string().min(1),
  issued: integrationKeySchema,
  /** When the key it replaces stops working. */
  previousExpiresAt: z.iso.datetime(),
})
export type RotatedIntegrationKey = z.infer<typeof rotatedIntegrationKeySchema>

export const PATIENT_VERIFICATION_METHODS = ['dob_phone'] as const
export const patientVerificationMethodSchema = z.enum(PATIENT_VERIFICATION_METHODS)
export type PatientVerificationMethod = z.infer<typeof patientVerificationMethodSchema>

export const patientVerificationSchema = z.object({
  id: z.uuid(),
  integrationId: z.string().min(1),
  patientId: z.uuid(),
  method: patientVerificationMethodSchema,
  expiresAt: z.iso.datetime(),
  useCount: z.number().int().min(0),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type PatientVerification = z.infer<typeof patientVerificationSchema>
