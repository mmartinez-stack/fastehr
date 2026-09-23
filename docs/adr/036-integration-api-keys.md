# ADR 36 — Integrations authenticate with per-integration API keys, never with a staff login

**Status:** accepted (2026-09-21); amended 2026-09-21 and 2026-09-22, below; implemented with ADR 38  
**Applies to:** `apps/web/src/server/auth.ts` · `apps/web/src/server/partner/keys.ts` · `apps/web/scripts/partner-api-keys.ts` · `packages/contracts/src/partner-api/keys.ts` · `packages/contracts/src/staff-role.ts` · `packages/db/prisma/migrations/20260917130000_integration_keys` · `packages/db/src/repositories/integration.ts`

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

## Amended 2026-09-21: the surface the keys unlock, and what the plugin does

The decision above was written for keys calling tRPC procedures. The
integration that made it concrete (DIA-89, an AI phone assistant) needs a
patient verification token and lockouts that tRPC has no shape for, so the
keys unlock the REST surface at `/api/v1` instead (ADR 38). What changes
from the text above, and what does not:

- **Mechanism, unchanged.** `@better-auth/api-key` on the auth instance
  (`apps/web/src/server/auth.ts`). The plugin mints the key, stores its
  hash in `api_keys` (the plugin's `apikey` model, one column per field it
  declares), enforces the expiry, `enabled`, and a per-key request counter
  that survives a deploy and is shared by every container. The partner
  chain verifies a bearer token through `verifyApiKey`
  (`apps/web/src/server/partner/keys.ts`); a key never becomes a session
  (`enableSessionForAPIKeys` stays off), so it cannot reach `/api/trpc` or
  a page.
- **Principal, unchanged.** A `users` row with role `integration`, whose
  `ROLE_ACCESS` row is `false` on every surface; `requireRole` refuses a
  role with no surface at all, `actorFromHeaders` refuses the role by name,
  the Users screen lists the principals apart and never assigns the role,
  and the role switcher never offers it. `isActive` on the row is the kill
  switch for every key it holds. The audit event's `actorId` is the row;
  `apiKeyId` is the key row's id.
- **Scope, amended.** A scope names a `/api/v1` operation
  (`patients:lookup`, `patients:verify`, `queue:read`; the registry in
  `packages/contracts/src/partner-api/operations.ts`), not a tRPC
  procedure path. Scopes ride on the plugin's `permissions` as
  `{ resource: [actions] }` (`scopesToPermissions`) and only the vocabulary
  in `API_SCOPES` survives the read back. The clinic's settings, the
  source-address allowlist, the clinic restriction, the environment, the
  BAA date, and the issuer, ride on the plugin's `metadata` and are parsed
  through `apiKeyMetadataSchema` on every call; a row that no longer fits
  is refused whole.
- **Issuance, amended.** The script is `apps/web/scripts/partner-api-keys.ts`
  rather than one beside `issue-temp-password.ts` in `packages/db`, because
  minting goes through the plugin, which lives on the auth instance, and
  `packages/db` cannot import the server layer. It creates or finds the
  principal, mints the key with the named scopes and a 90-day expiry,
  prints it once, and records the issuer in the metadata. Rotation is
  issue-then-expire with a 24-hour overlap; revocation sets `enabled` to
  false and takes effect on the next request.
- **Transport and environment, unchanged.** `Authorization: Bearer <key>`
  over TLS, keys prefixed `fehr_<env>_` for a human reading one, the
  development environment first, a `live` key refused without the date
  the business associate agreement was signed.

## Amended 2026-09-22: the principal may sign in, to one page

The first amendment kept the principal without a session. The clinic then
asked for the partner's team to have a login that shows their integration
and nothing clinical, so:

- **The principal may hold a credential.** Issued the way a staff account's
  is (`issue-temp-password`), against a real address given at key issuance
  (`--email`). The account signs in, changes its temporary password, and
  lands on `/integration`.
- **One surface, one page.** `integration` is a fifth surface in
  `ROLE_ACCESS`, held by the `integration` role alone. It grants
  `/integration` and the `integration.mine` procedure: the account's own
  principal and the state of its keys (never a key), how to call the API,
  and a button to the reference at `/api/v1/docs`, which asks for the key
  and shows the operations it covers (ADR 38).
- **Nothing clinical, enforced three times.** `requireRole`, which every
  staff chain runs, demands one of the four staff surfaces, which the role
  lacks, so every staff procedure answers `FORBIDDEN`; the staff shell's
  layout redirects the role to `/integration` before any screen renders;
  and `/api-docs` requires the `staff` surface (ADR 35 as amended). The
  integration page has its own shell, with no navigation.
- **The audit trail names it.** A call from the account's session is
  recorded with `actorKind: integration` and the principal's id, the same
  actor its keys are recorded under.
- **Unchanged.** A key never becomes a session; the Users screen lists
  principals apart, read-only, and never assigns the role; the role
  switcher never offers it.
