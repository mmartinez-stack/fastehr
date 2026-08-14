/**
 * PHI access audit events, and the sink that records them.
 *
 * Split from the middleware that produces them because the sink is the part
 * that changes: today it writes to stdout, and with the audit ticket it becomes
 * a durable table. Everything else — the event shape, the outcome vocabulary,
 * the call sites — stays put.
 */

/**
 * What happened to the call.
 *
 * `denied` is separated from `error` deliberately. A refused access attempt is
 * a security event and reads differently in an investigation from a procedure
 * that threw; collapsing them into a single `ok: false` loses exactly the
 * distinction anyone reviewing the trail is looking for.
 */
export type AuditOutcome = 'allowed' | 'denied' | 'error'

/**
 * One PHI access attempt.
 *
 * **There is no field for the procedure input, and there must not be.** Inputs
 * to these procedures are patient identifiers, clinical values, message bodies
 * — the audit trail records *that* PHI was reached and by whom, never the PHI
 * itself. Leaving the field out of the type means the log cannot acquire one by
 * a well-meaning edit at a call site.
 */
export interface AuditEvent {
  /** Actor id, or `anonymous` when the call never authenticated. */
  actorId: string
  /** tRPC procedure path, e.g. `patient.byId`. */
  path: string
  type: 'query' | 'mutation' | 'subscription'
  outcome: AuditOutcome
  /** tRPC error code when the outcome is not `allowed`. */
  code?: string
  durationMs: number
}

/**
 * Records an audit event. Placeholder sink: stdout, structured, one event per
 * line, so it is at least greppable and shippable by a log collector until the
 * audit table exists.
 */
export function recordAuditEvent(event: AuditEvent): void {
  console.info('[phi-audit]', event)
}
