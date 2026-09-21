import { phiAuditEventSchema, type PhiAuditEvent } from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'

/**
 * The PHI audit trail (ADR 37): one row per access attempt, appended and
 * never changed.
 *
 * The interface has a single method on purpose. There is no update, no
 * delete, and no read here: the table is protected by database triggers
 * that refuse UPDATE, DELETE, and TRUNCATE, and this interface is the
 * application-side half of the same rule. A reviewer's query arrives with
 * the audit viewer, as its own audited procedure, not as a method a handler
 * could reach for.
 */
export interface AuditRepository {
  /** Appends one event. Validates through the contract so a producer cannot write a shape the trail does not describe. */
  record(event: PhiAuditEvent): Promise<void>
}

export function createAuditRepository(getClient: () => PrismaClient): AuditRepository {
  return {
    async record(event) {
      const parsed = phiAuditEventSchema.parse(event)
      await getClient().phiAuditEvent.create({
        data: {
          transport: parsed.transport,
          actorKind: parsed.actorKind,
          actorId: parsed.actorId,
          apiKeyId: parsed.apiKeyId ?? null,
          verificationId: parsed.verificationId ?? null,
          action: parsed.action,
          method: parsed.method ?? null,
          routeTemplate: parsed.routeTemplate ?? null,
          outcome: parsed.outcome,
          code: parsed.code ?? null,
          httpStatus: parsed.httpStatus ?? null,
          patientId: parsed.patientId ?? null,
          resourceKind: parsed.resourceKind ?? null,
          resourceId: parsed.resourceId ?? null,
          requestId: parsed.requestId ?? null,
          ipAddress: parsed.ipAddress ?? null,
          userAgent: parsed.userAgent ?? null,
          durationMs: parsed.durationMs,
        },
      })
    },
  }
}
