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
| Patient roster, search, detail (`patient.byId/list/recent/search/searchByName`) | `protectedProcedure` | ✅ | ✅ | ✅ |
| Patient create / update (`patient.create/update`) | `protectedProcedure` | ✅ | ✅ | ✅ |
| Patient activate/deactivate (`patient.setStatus`) | `protectedProcedure` | ✅ | ✅ | ✅ |
| Staff accounts: list, search, create, edit, enable/disable (`staffUsers.*`) | `adminProcedure` | ✅ | ❌ | ❌ |
| Anything office-scoped (future queues etc.) | `officeScopedProcedure` | own offices only | own offices only | own offices only |
| `/users` page render | `guardPage('admin')` | ✅ | ❌ | ❌ |
| Issue a temporary password | not a procedure — the `issue-temp-password` runbook, CLI-only | operator with DB access | ❌ | ❌ |

Notes that carry weight:

- **Patient reads and writes are deliberately role-flat today.** Every active
  staff member can read and edit patient records; nothing clinical is withheld
  from `frontdesk` server-side yet. The clinical/clerical split visible in the
  UI (below) is **not enforced**. When a per-role restriction is decided, it
  lands as a procedure kind here first, and this table changes in the same
  commit.
- **Office scoping is orthogonal to role** (ADR 22): the permitted set is part
  of the actor's identity, checked server-side; an admin is not exempt.
- **No role can delete** a patient or a staff account — deactivation only, by
  design, at the repository layer.
- An admin cannot deactivate their own account (`staffUsers.setActive` refuses
  it), so a clinic cannot end up admin-less by one misclick.
- Refused attempts are audited: the audit middleware is outermost precisely so
  a `FORBIDDEN` probe leaves a trace (ADR 10).

## Client surfaces (presentation, not enforcement)

The mockup-era `role-provider.tsx` still drives which *views* render, through
three coarse surfaces. Until each screen is wired to the real session role,
this is a demonstration device — its own header comment says so.

| Surface | What it shows | admin | provider | frontdesk |
| --- | --- | :-: | :-: | :-: |
| `clinical` | Charting, visit records, weight history, prescribing | ✅ | ✅ | ❌ |
| `clerical` | Contact details, consent, scheduling, billing, outreach (incl. the roster's phone column) | ✅ | ❌ | ✅ |
| `staff` | Staff accounts, clinic-wide reporting | ✅ | ❌ | ❌ |

## Where the pieces live

| Concern | File |
| --- | --- |
| Role vocabulary | `packages/contracts/src/staff-role.ts` |
| Procedure kinds (`protected` / `admin` / `officeScoped`) | `apps/web/src/server/procedures.ts` |
| Session + role page guards | `apps/web/src/server/guards.ts`, `apps/web/src/lib/guard-page.ts` |
| Audit chain ordering | ADR 10 |
| Office scoping | ADR 22 |
| Mockup surfaces | `apps/web/src/components/role-provider.tsx` |
| Legacy role migration | `packages/db/scripts/migrate-users.ts`, docs/legacy-data-mapping.md § users |
