import type { PhiAuditEvent } from '@fastehr/contracts'
import type { Db } from '@fastehr/db'

/**
 * The PHI audit sink (ADR 10, ADR 37).
 *
 * Two producers hand events here, the tRPC middleware and the partner REST
 * chain, and every event goes to two places:
 *
 * 1. **stdout**, one line of JSON per event, prefixed `[phi-audit]`. This is
 *    the log collector's copy, and it is what alerting reads: a denial, a
 *    lockout, or an authentication failure is visible without a database
 *    query. The event is stringified rather than passed as an object because
 *    Node's console pretty-prints objects across multiple lines, and a
 *    line-oriented collector reads that as several unrelated records.
 * 2. **the `phi_audit_events` table**, through `Db.audit`: the durable record
 *    with the retention HIPAA audit controls ask for.
 *
 * The table write is fire-and-forget. A request that has already returned
 * PHI must not fail because the trail write did; the stdout line, plus the
 * `[phi-audit] write failed` line a failure produces, are the evidence when
 * the table is unreachable, and a database outage is loud everywhere else.
 * `flush` exists so a host about to exit (a CLI, a test) can wait for the
 * writes it started.
 *
 * The event shape lives in `@fastehr/contracts` (`phiAuditEventSchema`),
 * which is also where the rule that it carries no request input is stated.
 */
export interface AuditSink {
  record(event: PhiAuditEvent): void
  /** Resolves once every table write started so far has settled. */
  flush(): Promise<void>
}

/** The stdout half, on its own so a test can assert the line without a repository. */
export function writeAuditLine(event: PhiAuditEvent): void {
  console.info('[phi-audit]', JSON.stringify(event))
}

export function createAuditSink(repository: Db['audit']): AuditSink {
  const pending = new Set<Promise<void>>()

  return {
    record(event) {
      writeAuditLine(event)

      const write: Promise<void> = repository
        .record(event)
        .catch((error: unknown) => {
          console.error('[phi-audit] write failed', event.requestId ?? '-', error)
        })
        .finally(() => {
          pending.delete(write)
        })
      pending.add(write)
    },

    async flush() {
      await Promise.all([...pending])
    },
  }
}
