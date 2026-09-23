import type { z } from 'zod'
import { COMMON_PARTNER_ERRORS, type PartnerErrorCode } from './errors.ts'
import {
  partnerPatientLookupInput,
  partnerPatientLookupOutput,
  partnerPatientParams,
  partnerVerifyPatientInput,
  partnerVerifyPatientOutput,
} from './patients.ts'
import { partnerQueueCountOutput, partnerQueueCountQuery } from './queue.ts'
import type { PartnerScope } from './scopes.ts'

/**
 * The partner API operation registry (ADR 38): the one list the router, the
 * chain, the OpenAPI document, the scope-matrix test, and the handler table
 * all read. An operation that is not here does not exist; a handler for an
 * id that is not here does not typecheck.
 *
 * `path` is the OpenAPI template, and it is also what the audit trail
 * records (ADR 37): the template, never the concrete URL.
 */
export interface PartnerOperation<
  Params extends z.ZodType = z.ZodType,
  Query extends z.ZodType = z.ZodType,
  Body extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
> {
  id: string
  method: 'GET' | 'POST' | 'PATCH'
  /** OpenAPI path template under `/api/v1`, e.g. `/patients/{patientId}/verify`. */
  path: string
  summary: string
  description: string
  /** The scope a key must carry; `null` for an operation any active key may call. */
  scope: PartnerScope | null
  /** Whether the call must carry a patient verification token for `params.patientId`. */
  requiresVerification: boolean
  params?: Params
  query?: Query
  body?: Body
  output: Output
  /** The status the success response uses. */
  successStatus: 200 | 201
  /** Error codes this operation documents beyond the common ones. */
  errors: readonly PartnerErrorCode[]
}

/** Identity helper so each entry keeps its precise schema types. */
function defineOperation<
  Params extends z.ZodType,
  Query extends z.ZodType,
  Body extends z.ZodType,
  Output extends z.ZodType,
>(operation: PartnerOperation<Params, Query, Body, Output>) {
  return operation
}

export const lookupPatientsOperation = defineOperation({
  id: 'patients.lookup',
  method: 'POST',
  path: '/patients/lookup',
  summary: 'Find a patient',
  description:
    'Returns up to five candidates matching the identifiers given. Two request shapes are valid, and nothing else: ' +
    '(1) patientId on its own, for a record you already hold; ' +
    '(2) dateOfBirth (required) with phone and/or lastName (at least one), where firstName may be added only alongside lastName to narrow it. ' +
    'Anything else is refused with 400 invalid_input and the offending field names. ' +
    'Names match exactly, case-insensitively; the phone is compared as ten digits. ' +
    'No date of birth is ever returned: it is a verification factor, which is also why it is required as input. ' +
    'More than five matches answers an empty list with truncated: true; ask for another identifier.',
  scope: 'patients:lookup',
  requiresVerification: false,
  body: partnerPatientLookupInput,
  output: partnerPatientLookupOutput,
  successStatus: 200,
  errors: [],
})

export const verifyPatientOperation = defineOperation({
  id: 'patients.verify',
  method: 'POST',
  path: '/patients/{patientId}/verify',
  summary: 'Verify the caller as a patient',
  description:
    'Checks the date of birth and phone against the record. On success returns a verification token, valid fifteen minutes, that every patient-specific call must present. Failures do not say which factor was wrong; repeated failures lock the patient out.',
  scope: 'patients:verify',
  requiresVerification: false,
  params: partnerPatientParams,
  body: partnerVerifyPatientInput,
  output: partnerVerifyPatientOutput,
  successStatus: 200,
  errors: ['verification_failed', 'verification_locked'],
})

export const queueCountOperation = defineOperation({
  id: 'queue.count',
  method: 'GET',
  path: '/queue/count',
  summary: 'Live clinic queue count',
  description:
    'How many patients are waiting to be seen, per clinic. The count is exact once the front desk records arrivals on the queue screen; until then it is zero.',
  scope: 'queue:read',
  requiresVerification: false,
  query: partnerQueueCountQuery,
  output: partnerQueueCountOutput,
  successStatus: 200,
  errors: ['not_found'],
})

export const PARTNER_OPERATIONS = [lookupPatientsOperation, verifyPatientOperation, queueCountOperation] as const

export type PartnerOperations = typeof PARTNER_OPERATIONS
export type PartnerOperationId = PartnerOperations[number]['id']
export type PartnerOperationById<Id extends PartnerOperationId> = Extract<PartnerOperations[number], { id: Id }>

/**
 * Type helpers for the server layer, which has no Zod of its own (ADR 5) and
 * so cannot name `z.output` itself.
 */
export type PartnerSchema = z.ZodType
export type SchemaInput<Schema extends z.ZodType> = z.input<Schema>
export type SchemaOutput<Schema extends z.ZodType> = z.output<Schema>
/** The parsed value of an optional operation schema; an operation without one gets an empty object. */
export type OptionalSchemaOutput<Schema> = NonNullable<Schema> extends z.ZodType
  ? z.output<NonNullable<Schema>>
  : Record<string, never>

/** Every code an operation may answer with: its own plus the common set, plus the verification ones when it needs a token. */
export function documentedErrors(operation: PartnerOperation): PartnerErrorCode[] {
  const codes = new Set<PartnerErrorCode>([...COMMON_PARTNER_ERRORS, ...operation.errors])
  if (operation.requiresVerification) codes.add('verification_required')
  if (operation.method !== 'GET') {
    codes.add('unsupported_media_type')
    codes.add('payload_too_large')
  }
  return [...codes]
}
