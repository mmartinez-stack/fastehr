# FastEHR Partner API

Server-to-server access for an approved partner (ADR 36, ADR 38). The
clinic's full reference is the OpenAPI document in this directory,
`openapi.json`. A partner reads theirs at `/api/v1/docs` on any environment
where the API is enabled: the page asks for the key and shows exactly the
operations that key covers, nothing else; without a key it shows how to
authenticate and the error format. The same cut is served as JSON at
`/api/v1/openapi.json` when the key is presented as a Bearer token.
Regenerate the committed copy after any contract change:

```bash
pnpm --filter @fastehr/contracts openapi:write
```

## Your account

If the clinic issued your team a login, sign in at `/login`. The account
sees one page, `/integration`: your integration's name, the state of each
key (start, scopes, expiry, last use; never the key itself), the calling
conventions, and a button to the reference. Nothing else in the
application is reachable from it.

## Trying it

`scripts/partner-api-smoke.sh` runs every rule below against an environment
with one key: the document cut to the key, each accepted and refused
lookup shape, a failed and a successful verification, the queue count, and
the refusals for no key and a wrong key.

```bash
BASE_URL=https://dev.fastehr.diagnosticpartners.net KEY='fehr_dev_…' \
DOB=1985-12-10 PHONE=9515550101 LAST_NAME=Lovelace scripts/partner-api-smoke.sh
```

## Calling the API

- Base URL: `https://<host>/api/v1`. TLS only, terminated at the clinic's proxy, with HSTS.
- Authentication: `Authorization: Bearer <key>`. A key starts with
  `fehr_live_` or `fehr_dev_`, is issued by the clinic, shown once, and never
  sent by email. Keys expire (ninety days by default); rotation hands you a
  new key while the old one keeps working for 24 hours.
- Scopes: each operation names the scope the key must carry (`x-scope` in
  the document). Today: `patients:lookup`, `patients:verify`, `queue:read`.
- Bodies are JSON (`Content-Type: application/json`), at most 16 KiB.
- Every response carries `X-Request-Id`. Quote it in any support request.
- Responses are never cacheable. There is no CORS: call from a server.

## The two identity operations

1. `POST /patients/lookup` with the caller's date of birth plus a phone
   and/or a last name (a first name narrows a last name), or a `patientId`
   you already hold. Up to five candidates come back with names, the last
   four digits of the phone on file, and the clinic. **No date of birth is
   ever returned.** More than five matches answers an empty list with
   `truncated: true`: ask for another identifier and look up again. The
   assistant must not speak a name or digits to the caller until verify has
   succeeded.
2. `POST /patients/{patientId}/verify` with the date of birth and the phone.
   Success returns `verificationToken` and `expiresAt` (fifteen minutes).
   Send the token in `X-Patient-Verification` on every patient-specific
   operation. Failure is `403 verification_failed` whichever factor was
   wrong; five failures lock the patient for thirty minutes
   (`429 verification_locked`, `Retry-After`).

`GET /queue/count` answers how many patients are waiting per clinic. It is
exact once the front desk records arrivals on the queue screen; until that
screen is live the count is zero.

## Errors

Every error is `{ "error": { "code", "requestId", "validation"? } }`. Codes,
not messages; `validation` maps field paths to issue codes. Statuses:
400 `invalid_input`, 401 `unauthenticated` (any key problem), 403
`forbidden` (scope), `verification_required`, `verification_failed`, 404
`not_found`, 405, 409, 413, 415, 429 `rate_limited` and
`verification_locked` (both with `Retry-After`), 500 `internal_error`.

## Limits

Per key: 120 requests a minute overall, 30 a minute on lookup and verify,
and 5 lookups per ten minutes for the same identifiers. Honour `Retry-After`.

## Go-live checklist (the clinic ticks this before a `live` key exists)

Authentication
- [ ] Key issued by `partner-api-keys issue --environment live` with `--baa-signed`, an expiry, and the vendor's egress addresses in `--allow-ip`.
- [ ] The same addresses are in the 443 security-group rule.
- [ ] `PARTNER_API_ENABLED=true` set only on the environment whose BAA is signed.
- [ ] `partner-api-keys list` reviewed; no dev key on the live database.

Proxy (Caddy, `deploy/instance/Caddyfile`)
- [ ] TLS 1.2+ only, HSTS, a request body cap, an upstream timeout.
- [ ] `X-Forwarded-For` overwritten with the peer address, never appended.
- [ ] No access log (ADR 29), so `Authorization` and `X-Patient-Verification` are never written by the proxy.

Application
- [ ] `phi_audit_events` receiving rows for `/api/v1` calls, denials included; `UPDATE` on the table refused.
- [ ] `/api/v1/docs` loads with no request to another origin.
- [ ] Prisma is constructed without `log`; `DEBUG=prisma*` is not set on the host.

Agreement and records
- [ ] BAA signed: permitted uses are the listed operations; no secondary use of call content; vendor retention and deletion of recordings and transcripts; breach notification window; subcontractors named; return or destroy at termination; keys held in a secrets manager; the vendor never texts patients.
- [ ] `data-flow.md` in this directory reviewed and current.
- [ ] Incident procedure rehearsed once: `revoke`, then the kill switch, then the audit query (runbook §13).
- [ ] Quarterly key review scheduled.
