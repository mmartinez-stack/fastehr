# ADR 36 — The PHI audit trail is an append-only table, written through one sink

**Status:** accepted 2026-09-17 (the partner API foundation; amends the reading of ADR 10)  
**Applies to:** `packages/contracts/src/audit.ts` · `packages/db/prisma/schema.prisma` · `packages/db/prisma/migrations/20260917120000_phi_audit_events` · `packages/db/src/repositories/audit.ts` · `apps/web/src/server/audit-log.ts` · `apps/web/src/server/context.ts` · `apps/web/src/server/middleware/audit.ts`

ADR 10 put the audit outermost in the procedure chain so a refused probe
leaves a trace, and left the sink as a placeholder: one line of JSON on
stdout, "until the audit table exists". A partner API (ADR 37) is the point
at which that placeholder stops being acceptable. A business associate's
reads of patient records need a record that survives a container restart,
that nobody can quietly edit, and that an investigation can query by
patient, by actor, and by outcome. HIPAA's audit-controls standard
(§164.312(b)) asks for exactly that, and its documentation retention
(§164.316(b)(2)(i)) asks for six years of it.

## Decisions

1. **One event shape, in contracts.** `phiAuditEventSchema` in
   `@fastehr/contracts` is what both producers hand the sink: the tRPC
   middleware and the partner REST chain. It carries who (`actorKind`,
   `actorId`, the partner key's public id), what (`action`, `method`, the
   route *template*), the outcome (`allowed | denied | error`, with the
   code), the subject (`patientId`), correlation (`requestId`, `ipAddress`,
   `userAgent`), and the duration. `denied` stays distinct from `error`, for
   the reason ADR 10 gives.
2. **Still no field for the request input.** ADR 10's rule holds, and the
   schema is now the enforcement: a producer cannot record a body, a query
   string, or a name, because there is no field to put them in. Two
   additions look like input and are not. `patientId` is the **subject** of
   the access, set only from a value the server resolved itself (a validated
   route parameter, or the patient a verification token is bound to), never
   copied from a request body; it is a system identifier, and it is the one
   thing an investigation of a specific chart filters on. `routeTemplate` is
   the OpenAPI template (`/patients/{patientId}/verify`), never the concrete
   URL, so the trail records which operation was reached and not what was
   typed into it. The "never records the input" test now asserts the same
   for the table rows.
3. **The table is append-only, and the database enforces it.** The migration
   adds triggers that raise on `UPDATE`, `DELETE`, and `TRUNCATE`;
   `Db.audit` exposes `record` and nothing else. The table has no foreign
   keys on purpose: a staff account can be deleted and a partner key
   revoked, and the record of what they reached must stay exactly as
   written. Retention is six years; there is no purge path in code, and one
   is not to be added without a decision here. Reads arrive later as an
   audited admin procedure, not as a repository method a handler could reach
   for; until then the runbook documents the query.
4. **Two sinks, one call.** `AuditSink.record` on the context writes the
   stdout line first (the format ADR 10 established, which the log collector
   and its alerts already read) and then the table row. Both producers call
   the same sink, so the partner chain cannot record differently from the
   tRPC chain.
5. **The table write is fire-and-forget.** A request that has already
   returned PHI must not fail because the trail write did: the stdout line is
   still the evidence, the failure produces its own `[phi-audit] write
   failed` line with the request id, and a database outage is loud
   everywhere else. `flush` exists for hosts that exit (a CLI, a test). The
   alternative, failing closed on the audit write, would let a transient
   database blip take the clinic offline in exchange for nothing the stdout
   line does not already give.

## What was given up

- The application connects as one database role, so the triggers, rather
  than revoked grants, are what refuse rewrites. A dedicated role without
  `UPDATE`/`DELETE` on this table is a deployment hardening for later.
- Partitioning by year waits until the table is large enough to need it.
- `console.info` is still the transport for the log line; ADR 24's rule that
  no PHI or secret goes in a log holds because the event has no field for
  either.
