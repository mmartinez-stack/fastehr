# ADR 10 — Middleware order: audit, authenticate, authorize

**Status:** accepted  
**Applies to:** `apps/web/src/server/procedures.ts`

`protectedProcedure` runs the PHI audit **outermost**, so it observes the
outcome of the checks beneath it and records refusals as well as reads. tRPC's
`next()` resolves rather than throws when something downstream fails, which is
what makes an outer middleware able to see a rejection at all.

An earlier version ran the audit innermost, reasoning that a record should only
be written for calls that passed authorization. That is the right instinct for
an *access* log and the wrong one for a *security* log: an actor probing records
they had no right to left no trace, while every legitimate read was faithfully
recorded. Refused attempts are what an investigation goes looking for, so
`outcome: 'denied'` is a first-class value in the event, distinct from a
procedure that merely threw.

The event type in `src/server/audit-log.ts` has **no field for the procedure
input**, and must not acquire one — inputs here are patient identifiers,
clinical values, and message bodies. The trail records that PHI was reached and
by whom, never the PHI itself.

`src/server/audit.test.ts` drives all of this through `appRouter.createCaller`
with a fabricated actor: no HTTP, no database, no session. That the security
behaviour is this cheap to test is the direct payoff for rule 1.
