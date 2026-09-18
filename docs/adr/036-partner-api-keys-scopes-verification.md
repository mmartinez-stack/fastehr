# ADR 36 — The partner API: scoped keys, a verification token, one chain, one registry

**Status:** accepted 2026-09-17 (the vendor's Patient Lookup and Patient Verification, plus the queue count)  
**Applies to:** `packages/contracts/src/partner-api/` · `packages/contracts/src/env.ts` · `packages/db/prisma/migrations/20260917130000_partner_api_clients` · `packages/db/src/repositories/api-client.ts` · `packages/db/src/repositories/verification.ts` · `packages/db/scripts/partner-api-keys.ts` · `apps/web/src/server/partner/` · `apps/web/src/app/api/v1/[[...path]]/route.ts` · `apps/web/next.config.mjs` · `docs/partner-api/`

An external vendor (an AI phone assistant, a business associate under HIPAA)
needs to reach patient records from its own servers: find the caller's
record, prove the caller is that patient, and later read medications, file
refill requests and tasks, book appointments, and write the call back. The
staff application has no machine-facing surface: every read goes through
tRPC behind a Better Auth session, whose actor is a person with a role.
Giving the vendor a staff account would put a machine behind the wrong
identity, the wrong permissions, and the wrong audit line.

## Decisions

1. **A REST surface under `/api/v1`, mounted like the other two.** One Next
   route file, `app/api/v1/[[...path]]/route.ts`, hands the `Request` to
   `handlePartnerRequest` in `src/server/partner/` and does nothing else,
   so the layer stays mountable outside Next (ADR 9) and inside the lint
   fences, which key on `src/server/**`. It never resolves a staff session,
   and a partner key means nothing on `/api/trpc`. Not a sixth package
   (ADR 8): there is one consumer.
2. **Scoped API keys, hash-only.** A key is `fehr_<env>_<keyId>_<secret>`:
   the id in clear and indexed so a request is matched without a secret
   touching an index, the secret 32 random bytes whose SHA-256 is all that
   is stored (ADR 29's rule), compared in constant time inside the
   repository. A key carries scopes, an expiry (required, ninety days by
   default, a year at most), an optional source-address allowlist, and an
   optional clinic restriction. Keys are issued only from an operator CLI
   that prints the key once; a `live` key is refused without the date the
   business associate agreement was signed. Every way authentication can
   fail answers one `401 unauthenticated`. A static key is acceptable for
   one partner over TLS with these controls; mTLS at the proxy, or OAuth2
   client credentials, is the hardening for a second partner.
3. **Verification issues a token, and lookup never returns a factor.** The
   caller proves identity with the date of birth and the phone on file, both
   exact; on a match the API mints a token bound to that client and that
   patient, honoured for fifteen minutes, presented in
   `X-Patient-Verification` on every patient-specific call. Only its hash is
   stored. The lookup response carries names, the last four digits of the
   phone, the clinic, and the id, and **no date of birth in any form**:
   otherwise a caller holding a name and a phone could collect the date of
   birth from lookup and pass verify without the patient proving anything.
   The date of birth is required *input* to lookup for the same reason.
   Failed verifications are counted in the database and lock the patient
   (five in the window) or pause the client (fifty); one code for a wrong
   factor, an unknown id, a patient without a phone, or a patient outside
   the key's clinics.
4. **One chain, in ADR 10's order.** Audit outermost, then authenticate,
   authorize (scope), rate limit, verification, validate, handle, and shape
   the output through the operation's strict schema so nothing the contract
   does not describe leaves. Every refusal writes a row through the same
   sink the tRPC chain uses (ADR 35), with the route template and never the
   URL, and the patient as the subject when the route names one.
5. **One registry.** `PARTNER_OPERATIONS` in contracts is read by the
   router, the chain, the OpenAPI builder, the scope-matrix test, and the
   handler table, whose mapped type makes an operation without a handler a
   typecheck failure. The scope-to-endpoint matrix is the `scope` field of
   each entry, not a second table. The OpenAPI 3.1 document is generated
   from the Zod schemas natively (Zod 4 emits JSON Schema 2020-12), lives in
   contracts because only contracts may import Zod (ADR 5), is committed at
   `docs/partner-api/openapi.json` with a drift test, and is served at
   `/api/v1/openapi.json`. The docs page serves Swagger UI from this origin
   (assets copied at build time), so no third-party script runs here.
6. **Errors are codes (ADR 12), and coarse where a distinction would inform a
   probe.** The envelope is `{ error: { code, requestId, validation? } }`;
   validation is field paths and issue codes. `forbidden` (a scope the key
   lacks) is safe to distinguish; the authentication and verification
   failures are not, and are not.
7. **Transport rules the app can enforce, and the ones the proxy must.** Every
   response is `Cache-Control: no-store`, `nosniff`, `no-referrer`, a
   `default-src 'none'` policy, a server-generated `X-Request-Id`, and never
   a CORS header. Bodies are JSON only and capped at 16 KiB. TLS is the
   proxy's and is not re-checked in the app: `next start` stamps
   `x-forwarded-proto: http` on every request itself, so such a check
   refuses a correct deployment as readily as a wrong one. The client address is
   the proxy's `X-Forwarded-For`, which the proxy must overwrite rather than
   append (the runbook says so), and the proxy's access log must not keep
   `Authorization` or `X-Patient-Verification`.
8. **A kill switch, and nothing else in the environment.** `PARTNER_API_ENABLED`
   unset means every `/api/v1` path is 404, documents included. Keys are
   rows, so an environment has only the keys issued in it, and no key
   material is ever configured.
9. **Rate limits in memory, lockouts in the database.** Token buckets per
   client, per client on the identity operations, per identifier set, and
   per address on failed authentication keep a broken integration from
   becoming load; they reset on deploy. The verification lockouts are rows
   and survive anything.

## What was given up

- The in-memory limiter is per container. The deployment is one container
  today; a second one shares the database and therefore the lockouts, and
  would need a shared store only for the buckets.
- Accent-insensitive name matching: Postgres `unaccent` is not installed, so
  "Muñoz" and "Munoz" are different last names to lookup. A caller who is
  not found by name is found by phone.
- A zip code as an alternative second factor, and a texted one-time code as a
  third factor for medication reads, are designed for but not built;
  `method` on the verification row leaves room.
- A staff-facing viewer for the audit trail and the partner clients; until it
  exists the runbook documents the query and the CLI's `list`.

## Residual risk, stated

A stolen key with no address allowlist can, until revoked, look patients up
at thirty calls a minute using name-and-date-of-birth or phone-and-date-of-
birth pairs the thief already holds, and learn only names, the last four
digits of the phone, and the clinic; it cannot read a record without also
holding the patient's phone and date of birth, and five wrong answers lock
the patient. Revocation is immediate and needs no restart. This is the
trade for a credential a phone vendor can hold, and it is why the allowlist
and the ninety-day expiry are the defaults.
