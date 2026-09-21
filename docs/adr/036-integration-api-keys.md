# ADR 36 — Integrations authenticate with per-integration API keys, never with a staff login

**Status:** accepted (2026-09-21); implementation pending  
**Applies to:** `apps/web/src/server` · `packages/contracts` · `packages/db` · the API runbook

A system that calls FastEHR on its own (a partner such as the one in
DIA-89, a report exporter, a scheduler) authenticates with an API key
issued to that integration, carried in a header, mapped to a principal of
its own. It never signs in as a person.

## Why not a staff account

Every credential today is a human login with a twelve-hour cookie session,
and every call is audited under that person's id (ADR 10). Handing that to
a machine means scripting a sign-in, storing a staff password somewhere,
renewing a session every twelve hours, and an audit trail that names a
person who did nothing. A shared "integration" staff account is worse: the
role surfaces (ADR 31) are shaped for people, and the account's password is
known to everyone who ever needed it.

## The decision

- **Mechanism.** Better Auth's `apiKey` plugin: keys are hashed at rest,
  shown once at creation, carry an expiry, rate limits, and metadata, and
  are revoked in place. The plugin resolves a valid key to a session for
  the key's owner, which is what lets the existing `actorFromHeaders` path
  serve integrations without a second authentication code path.
- **Principal.** One `users` row per integration, role `integration`, a new
  value in `StaffRole` whose row in `ROLE_ACCESS` (ADR 31) is `false` on
  every human surface. `isActive` on that row is the kill switch for every
  key the integration holds. The audit event's `actorId` is that row, so a
  call is attributable to the integration, and to nothing else.
- **Scope.** What an integration may call is not a role surface; it is a
  list of procedure paths, declared in `packages/contracts` as named scopes
  (`INTEGRATION_SCOPES`, e.g. `patients.read`, `visits.read`) and stored on
  the key's metadata. A middleware after `requireAuth` checks the procedure
  path against the key's scopes and refuses with `FORBIDDEN` otherwise. A
  scope names procedures, never tables, so it cannot outgrow the API.
- **Issuance.** A runbook script beside `issue-temp-password.ts`, run by an
  administrator: it creates or finds the integration user, mints a key with
  a 90-day expiry and the named scopes, prints it once, and records who
  issued it. Rotation is issue-then-revoke; there is no in-place renewal.
  Later, a Users-screen tab; not before the runbook path has been used.
- **Transport.** `Authorization: Bearer <key>`, HTTPS only. Keys never
  appear in URLs, logs, or error messages (ADR 24's secret rules apply).
- **Where.** The development environment first, with invented data; a key
  for an environment holding real records needs the client's agreement
  with the partner on file.

## What this closes and what it opens

It answers DIA-80. It does not implement anything: the plugin, the role
value and its matrix row, the scope vocabulary, the scope middleware, the
issuance script, and the runbook section are the implementation ticket
that follows. Until that lands, a partner's human tester gets a named
staff account with the least role, per the API runbook; no machine gets a
credential.
