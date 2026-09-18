import { z } from 'zod'

/**
 * The PHI access audit event (ADR 10, ADR 35).
 *
 * One record per attempt to reach protected health information, whether the
 * attempt was allowed, refused, or failed. Two producers write it, the tRPC
 * middleware chain and the partner REST chain, and one sink records it, so
 * the shape is a contract rather than a server-layer type.
 *
 * **There is no field for the request input, and there must not be.** Inputs
 * are patient identifiers, clinical values, and message bodies; the trail
 * records that PHI was reached and by whom, never the PHI itself. Leaving the
 * field out of the schema means a well-meaning edit at a call site cannot add
 * one. The same rule keeps the route *template* here and never the concrete
 * URL: `/patients/{patientId}/verify`, not the path with the id in it.
 *
 * `patientId` is the **subject** of the access, not an input: the layer sets
 * it only from a value it resolved itself (a validated route parameter, or
 * the patient a verification token is bound to). It is a system identifier,
 * and it is the one thing an investigation of a specific chart filters on.
 */

/** Which chain produced the event. */
export const AUDIT_TRANSPORTS = ['trpc', 'rest', 'cli'] as const
export const auditTransportSchema = z.enum(AUDIT_TRANSPORTS)
export type AuditTransport = z.infer<typeof auditTransportSchema>

/** Who was asking: a staff session, a partner API client, or nobody identifiable. */
export const AUDIT_ACTOR_KINDS = ['staff', 'api_client', 'anonymous'] as const
export const auditActorKindSchema = z.enum(AUDIT_ACTOR_KINDS)
export type AuditActorKind = z.infer<typeof auditActorKindSchema>

/**
 * What happened to the call.
 *
 * `denied` is separated from `error` deliberately. A refused access attempt
 * is a security event and reads differently in an investigation from a call
 * that threw; collapsing them into one `ok: false` loses exactly the
 * distinction anyone reviewing the trail is looking for.
 */
export const AUDIT_OUTCOMES = ['allowed', 'denied', 'error'] as const
export const auditOutcomeSchema = z.enum(AUDIT_OUTCOMES)
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>

/** The longest user agent the trail keeps; anything past it is cut, not refused. */
export const AUDIT_USER_AGENT_MAX_LENGTH = 256

/** One PHI access attempt, as the producers hand it to the sink. */
export const phiAuditEventSchema = z.object({
  transport: auditTransportSchema,
  actorKind: auditActorKindSchema,
  /** Staff user id or api client id; null when anonymous. */
  actorId: z.string().min(1).nullable(),
  /** The partner key's public id (never its hash); null for staff and anonymous calls. */
  apiKeyId: z.string().min(1).nullable().optional(),
  /** The verification that authorised a patient-specific partner call, when one did. */
  verificationId: z.string().min(1).nullable().optional(),
  /** tRPC procedure path (`patient.byId`) or partner operation id (`patients.verify`). */
  action: z.string().min(1),
  /** `query` | `mutation` | `subscription` for tRPC; the HTTP verb for REST; null for a CLI. */
  method: z.string().min(1).nullable().optional(),
  /** The OpenAPI path template of a REST call. Never a concrete URL. */
  routeTemplate: z.string().min(1).nullable().optional(),
  outcome: auditOutcomeSchema,
  /** The tRPC error code or partner error code when the outcome is not `allowed`. */
  code: z.string().min(1).nullable().optional(),
  httpStatus: z.number().int().min(100).max(599).nullable().optional(),
  /** The subject of the access. See the module comment. */
  patientId: z.string().min(1).nullable().optional(),
  resourceKind: z.string().min(1).nullable().optional(),
  resourceId: z.string().min(1).nullable().optional(),
  requestId: z.string().min(1).nullable().optional(),
  ipAddress: z.string().min(1).nullable().optional(),
  /** Cut to `AUDIT_USER_AGENT_MAX_LENGTH`, not refused: a long header must not lose the event. */
  userAgent: z
    .string()
    .transform((value) => value.slice(0, AUDIT_USER_AGENT_MAX_LENGTH))
    .nullable()
    .optional(),
  durationMs: z.number().int().min(0),
})
export type PhiAuditEvent = z.infer<typeof phiAuditEventSchema>
