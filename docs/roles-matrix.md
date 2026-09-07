# Roles matrix

What each staff role may do — as **enforced today**, not as aspired to. Two
layers appear below and they are not equals: the server layer (tRPC middleware
and page guards) is the security boundary; the client layer (nav items, the
mockup's surface flags) is presentation that only stops honest users asking
for what they cannot have. A row in the client table with no backing row in
the server table protects nothing.

Keep this file honest: a change to `procedures.ts`, `guards.ts`, a router's
procedure kinds, or `guardPage` call sites is a change to this document, in
the same commit.

## The role vocabulary

Three roles, one per account (`StaffRole` in `@fastehr/contracts`; a native PG
enum, so the database refuses anything else). The legacy `group` values map in
per the migration (docs/legacy-data-mapping.md § users):

| Role | Legacy value(s) | Who this is |
| --- | --- | --- |
| `admin` | `admin` | Practice administration: staff accounts, full clinical and clerical access. |
| `provider` | `doc` | Clinicians: the clinical record, charting, prescribing. |
| `frontdesk` | `clerk`, `csr` | Front desk and call center: scheduling, contact details, outreach. (`clerk`/`csr` merged deliberately; splitting them later is a schema migration, not taken yet.) |

`npdoc` legacy accounts were refused by the migration rather than defaulted.

## Server-enforced matrix (the security boundary)

Every PHI procedure runs the chain **audit → authenticate → authorize**
(ADR 10). Authentication requires an **active** account whose password change
is not pending; deactivation kills live sessions immediately and session
resolution re-checks `isActive` on every call.

| Capability | Procedure kind | admin | provider | frontdesk |
| --- | --- | :-: | :-: | :-: |
| Patient roster: recent, search, type-ahead, referred-by picker (`patient.recent/search/suggest/searchByName`; the phone column is nulled server-side for a provider) | `protectedProcedure` | ✅ | ✅ (no phone) | ✅ |
| Patient chart: header plus the clinical half (`patient.byId`) | `protectedProcedure` | ✅ | ✅ | ✅ |
| Patient demographics and billing reads (`patient.demographics/billing`) | `clericalProcedure` | ✅ | ❌ | ✅ |
| Patient create (`patient.create`) | `clericalProcedure` | ✅ | ❌ | ✅ |
| Clinical section save: vitals, medications, history, allergies, primary care doctor (`patient.updateClinical`) | `protectedProcedure` | ✅ | ✅ | ✅ |
| Demographics and billing saves (`patient.updateDemographics/updateBilling`) | `clericalProcedure` | ✅ | ❌ | ✅ |
| Patient activate/deactivate (`patient.setStatus`; no screen calls it since DIA-50, the column is kept unexposed) | `protectedProcedure` | ✅ | ✅ | ✅ |
| Staff accounts: list, search, create, edit, enable/disable (`staffUsers.*`) | `adminProcedure` | ✅ | ❌ | ❌ |
| Staff account delete (`staffUsers.delete`; confirmed in UI, never self) | `adminProcedure` | ✅ | ❌ | ❌ |
| Anything office-scoped (future queues etc.) | `officeScopedProcedure` | own offices only | own offices only | own offices only |
| `/users` page render | `guardPage('admin')` | ✅ | ❌ | ❌ |
| Issue a temporary password | not a procedure — the `issue-temp-password` runbook, CLI-only | operator with DB access | ❌ | ❌ |

Notes that carry weight:

- **The patient record is enforced by section (ADR 28).** A provider reads
  and writes the clinical half only; the demographics and billing sections
  are refused server-side, and the roster row they receive carries no phone.
  Nothing clinical is withheld from `frontdesk`: the front desk and admins see
  every section, as the Aug 31 sync decided.
- **Office scoping is orthogonal to role** (ADR 22): the permitted set is part
  of the actor's identity, checked server-side; an admin is not exempt.
- **No role can delete a patient** — deactivation only, matching the legacy
  system, whose patient DELETE route was retired ("patients can no longer be
  deleted"). Staff accounts *can* be hard-deleted by an admin (legacy parity:
  `DELETE /users/:id` was admin-only there too), behind an explicit
  confirmation dialog; sessions and the credential go with the row. The legacy
  lesson — 38,047 orphaned clinical signatures — is closed at both layers:
  `visits.signedById` is `ON DELETE RESTRICT`, and `staffUsers.delete` refuses
  an account that signed any visit by name (`PRECONDITION_FAILED`), pointing
  the admin at Disable instead.
- An admin cannot deactivate **or delete** their own account
  (`staffUsers.setActive` and `staffUsers.delete` both refuse it), so a clinic
  cannot end up admin-less by one misclick.
- Refused attempts are audited: the audit middleware is outermost precisely so
  a `FORBIDDEN` probe leaves a trace (ADR 10).

## Client surfaces (presentation, not enforcement)

`role-provider.tsx` renders from the **session's** role, supplied by the app
layout from the server (ADR 28), through three coarse surfaces. Admins may
preview another role's view from the header switcher; no other role can.

| Surface | What it shows | admin | provider | frontdesk |
| --- | --- | :-: | :-: | :-: |
| `clinical` | Charting, visit records, weight history, prescribing | ✅ | ✅ | ❌ |
| `clerical` | Contact details, consent, scheduling, billing, outreach (incl. the roster's phone column) | ✅ | ❌ | ✅ |
| `staff` | Staff accounts, clinic-wide reporting | ✅ | ❌ | ❌ |

## Where the pieces live

| Concern | File |
| --- | --- |
| Role vocabulary | `packages/contracts/src/staff-role.ts` |
| Procedure kinds (`protected` / `clerical` / `admin` / `officeScoped`) | `apps/web/src/server/procedures.ts` |
| Record sections | ADR 28 |
| Session + role page guards | `apps/web/src/server/guards.ts`, `apps/web/src/lib/guard-page.ts` |
| Audit chain ordering | ADR 10 |
| Office scoping | ADR 22 |
| Mockup surfaces | `apps/web/src/components/role-provider.tsx` |
| Legacy role migration | `packages/db/scripts/migrate-users.ts`, docs/legacy-data-mapping.md § users |
