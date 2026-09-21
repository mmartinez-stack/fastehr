# Runbook: test the API of a deployed environment

How to reach a deployed FastEHR over HTTP without the browser: get a
session from Better Auth, then call tRPC procedures with it. Written against
the development environment (`https://dev.fastehr.diagnosticpartners.net`,
ADR 34) and verified there on 2026-09-20; every example below was run.

Signed in, `/api-docs` is Swagger UI over `/api/openapi.json`, a document
generated from the router on every request (ADR 35): every mounted
procedure with its method, input schema, and access level, and the
authentication endpoints. "Try it out" runs as you, with your role.

`scripts/api-smoke.sh` runs the whole read-only sequence in one go:

```bash
BASE_URL=https://dev.fastehr.diagnosticpartners.net \
EMAIL=you@diagnosticpartners.com PASSWORD='…' scripts/api-smoke.sh
```

## Credentials

There is no sign-up. An account is inserted by an admin and issued a
temporary password (`docs/runbooks/deploy-development-ec2.md`, step 11).
The first sign-in in the browser forces a password change at
`/change-password`; the API can do the same through `change-password`
below. Never put a password in a URL, a commit, or a chat where it is not
needed; the smoke script takes it from the environment for that reason.

## Two surfaces on one origin

| surface | path | protocol |
| --- | --- | --- |
| authentication | `/api/auth/*` | Better Auth's JSON endpoints; the session is a cookie |
| application | `/api/trpc/<router>.<procedure>` | tRPC 11 over HTTP with the superjson envelope (ADR 11) |

The session cookie is `HttpOnly` and `Secure`; keep it in a cookie jar
(`curl -c/-b`) and send it with every application call.

## Authentication

Better Auth applies an origin check to every POST. Send `Origin` with the
site's own origin and `content-type: application/json` on every POST, or the
answer is `403 MISSING_OR_NULL_ORIGIN` or `415`.

```bash
B=https://dev.fastehr.diagnosticpartners.net
J=$(mktemp)

# Sign in. The response repeats the user; the session lands in the jar.
curl -sS -c "$J" -H "Origin: $B" -H 'content-type: application/json' \
  -d '{"email":"you@diagnosticpartners.com","password":"…"}' "$B/api/auth/sign-in/email"

# Who am I. `user.role` is the single staff role; `user.mustChangePassword`
# is true while a temporary password is in force.
curl -sS -b "$J" "$B/api/auth/get-session"

# Change the password (required once after a temporary one). Other sessions
# of the account are revoked when the last field is true.
curl -sS -b "$J" -c "$J" -H "Origin: $B" -H 'content-type: application/json' \
  -d '{"currentPassword":"…","newPassword":"…","revokeOtherSessions":true}' "$B/api/auth/change-password"

# Sign out. The body must be JSON, even if empty.
curl -sS -b "$J" -c "$J" -H "Origin: $B" -H 'content-type: application/json' -d '{}' "$B/api/auth/sign-out"
```

A wrong password answers `401 INVALID_EMAIL_OR_PASSWORD`. Sessions last
twelve hours and are checked server-side on every call (no cookie caching),
so a sign-out or a revoked session takes effect on the next request.

## Calling a procedure

The input is wrapped in a superjson envelope, `{"json": <input>}`, which is
what lets dates and other non-JSON values cross the wire (ADR 11). Queries
are `GET` with the envelope URL-encoded in `input`; mutations are `POST`
with the envelope as the body. Results come back in the same envelope.

```bash
enc() { python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }

# A query without input.
curl -sS -b "$J" "$B/api/trpc/location.listActive"
# → {"result":{"data":{"json":[{"slug":"sylmar","name":"Sylmar",…},{"slug":"kanoga",…}]}}}

# A query with input.
curl -sS -b "$J" "$B/api/trpc/patient.search?input=$(enc '{"json":{"query":"smith"}}')"

# A mutation. Inputs are validated by the contract in @fastehr/contracts.
curl -sS -b "$J" -H 'content-type: application/json' \
  -d '{"json":{"firstName":"Prueba","lastName":"Apitest","phone":"5555550123","language":"spanish"}}' \
  "$B/api/trpc/intake.send"

# Several queries in one request: comma-separated paths, indexed inputs.
curl -sS -b "$J" "$B/api/trpc/health,location.listActive?batch=1&input=$(enc '{"0":{"json":null},"1":{"json":null}}')"
```

The browser client uses the batch form with streaming
(`httpBatchStreamLink`, ADR 17); the single form is easier to read by hand
and behaves the same.

## Errors

Every error is `{"error":{"json":{"message","code","data":{"code","httpStatus","path"}}}}`.
The codes to expect:

| HTTP | `data.code` | when |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | no session, or an expired one |
| 403 | `FORBIDDEN` | a session whose role lacks the procedure's surface |
| 404 | `NOT_FOUND` | unknown procedure path; also an unknown, used, or expired intake token, on purpose (ADR 29) |
| 400 | `BAD_REQUEST` | input rejected by the contract |
| 412 | `PRECONDITION_FAILED` | a state transition that does not apply, e.g. rejecting an intake that was never submitted |

A validation failure carries **codes, never messages** (ADR 12), so nothing
typed by a user can reach a log through an error:

```json
{"error":{"json":{"message":"Invalid input","code":-32600,"data":{"code":"BAD_REQUEST","httpStatus":400,
  "path":"patient.searchByName","validation":{"fieldErrors":{"name":["too_small"]},"formErrors":[]}}}}}
```

Stacks are stripped from every error in every environment.

## Procedures and who may call them

Access is by role surface (`ROLE_ACCESS` in contracts, ADR 31): `admin` and
`medical_director` hold every surface, `medical_director` alone holds
`review`, `frontdesk` holds `clerical`, `provider` holds neither. The audit
middleware records every call, refused ones included (ADR 10).

| procedure | kind | needs |
| --- | --- | --- |
| `health` | query | nothing |
| `patientDisplayName` | query | a session |
| `location.list`, `location.listActive` | query | a session |
| `patient.byId`, `patient.recent`, `patient.search`, `patient.suggest`, `patient.searchByName` | query | a session |
| `patient.updateClinical`, `patient.setStatus` | mutation | a session |
| `patient.demographics`, `patient.billing` | query | clerical |
| `patient.create`, `patient.updateDemographics`, `patient.updateBilling` | mutation | clerical |
| `intake.open` | query | nothing: the token is the credential |
| `intake.submit` | mutation | nothing: the token is the credential |
| `intake.send`, `intake.accept`, `intake.reject` | mutation | clerical |
| `intake.byId` | query | clerical |
| `intake.listPending` | query | clerical, and `{"location": "<slug>" \| "all"}` within the actor's locations |
| `staffUsers.list`, `staffUsers.search` | query | staff (admin) |
| `staffUsers.create`, `staffUsers.update`, `staffUsers.setActive`, `staffUsers.delete` | mutation | staff (admin) |
| `review.queue`, `review.note` | query | review (medical director) |
| `review.signOff` | mutation | review (medical director) |
| `review.runSample` | mutation | staff (admin) |

Input shapes are the exported schemas in `packages/contracts/src/`
(`searchPatientsInput`, `sendPatientIntakeInput`, `locationFilteredInput`,
and so on); the type surface a client compiles against is
`apps/web/src/lib/api-types.ts`.

## A full sequence, and what it proved on 2026-09-20

1. `health` answers without a session; `patient.recent` and
   `staffUsers.list` answer `401` without one.
2. Sign-in with the temporary password succeeds and `get-session` shows
   `mustChangePassword: true`; `change-password` clears it; the old password
   is then refused with `401`.
3. With an `admin` session: `location.listActive` returns the two active
   clinics, `patient.search`, `patient.recent`, `staffUsers.list`, and
   `intake.listPending` answer `200`, `review.queue` answers `403`
   (admin lacks the review surface, as designed), and a two-item batch works.
4. `patient.searchByName` with a one-letter name answers `400` with
   `fieldErrors.name: ["too_small"]` and no message text.
5. `intake.send` with an invented person creates a request and, with no
   Twilio configured, returns the link instead of texting it; `intake.open`
   with that token returns the person's name, language, and the clinics;
   a made-up token answers `404`; `intake.reject` on a request that was
   never submitted answers `412`. The row was deleted afterwards.
6. `sign-out` answers `{"success": true}` and the next call answers `401`.

## Known gap found by this test

**A temporary password is enough to call the API.** The page guards
(`apps/web/src/server/guards.ts`) refuse an account whose password change
is pending with `PASSWORD_CHANGE_REQUIRED`, but the tRPC middleware
(`apps/web/src/server/middleware/auth.ts`) checks only for a session and a
role: step 3 above succeeded for `location.listActive` before the password
was changed. Someone handed a temporary password can therefore read through
`/api/trpc` what the UI would not show them until they chose a password of
their own. The fix is one check in `requireAuth` and `requireSurface`
(refuse with `FORBIDDEN` while `actor.mustChangePassword` is true, except
for whatever the change-password page itself needs), with a procedure test
for each. Tracked as a follow-up in `deploy/README.md`.

## Where to look when something fails

- The web container's stdout, including the `[phi-audit]` line per call,
  is CloudWatch Logs, group `/fastehr/development/web`, stream `web`.
- Caddy's own messages (certificate issuance, upstream errors) are stream
  `caddy`. There is no access log, on purpose (ADR 29).
- A `502` from Caddy means the web container is down or restarting:
  `docker compose ps` in `/opt/fastehr` from an SSM session.
