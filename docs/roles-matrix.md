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

Four roles, one per account (`StaffRole` in `@fastehr/contracts`; a native PG
enum, so the database refuses anything else). The legacy `group` values map
in per the migration (docs/legacy-data-mapping.md § users); the fourth role
is assigned by hand (ADR 31):

| Role | Legacy value(s) | Who this is |
| --- | --- | --- |
| `admin` | `admin` | Practice administration: staff accounts, full clinical and clerical access. |
| `provider` | `doc` | Clinicians: the clinical record, charting, prescribing. |
| `frontdesk` | `clerk`, `csr` | Front desk and call center: scheduling, contact details, outreach. (`clerk`/`csr` merged deliberately; splitting them later is a schema migration, not taken yet.) |
| `medical_director` | none (assigned by an admin) | The administrator's access plus the sampled-note review queue. Dr. Penn. |

`npdoc` legacy accounts were refused by the migration rather than defaulted.

**The matrix is one table**, `ROLE_ACCESS` in `packages/contracts/src/staff-role.ts`,
over four surfaces: `clinical`, `clerical`, `staff`, `review`. The server
middleware (`requireSurface`), the page guard (`guardPage(surface)`), and
the client (`surfacesFor`) all read it; nothing compares role names, and an
unmapped role or surface is denied. `apps/web/src/server/access-matrix.test.ts`
calls every role against every surface and checks the answer against the table.

## Server-enforced matrix (the security boundary)

Every PHI procedure runs the chain **audit → authenticate → authorize**
(ADR 10). Authentication requires an **active** account whose password change
is not pending; deactivation kills live sessions immediately and session
resolution re-checks `isActive` on every call.

| Capability | Procedure kind (surface) | admin | medical_director | provider | frontdesk |
| --- | --- | :-: | :-: | :-: | :-: |
| Patient roster: recent, search, type-ahead, referred-by picker (`patient.recent/search/suggest/searchByName`; the phone column is nulled server-side for a provider) | `protectedProcedure` | ✅ | ✅ | ✅ (no phone) | ✅ |
| Patient record, **Medical** tab: header plus vitals, medications, primary care doctor, the history checklist, and the history text (`patient.byId`) | `protectedProcedure` | ✅ | ✅ | ✅ | ✅ |
| Patient record, **Patient Info** tab (`patient.demographics`) and **Billing** tab (`patient.billing`) reads | `clericalProcedure` (`clerical`) | ✅ | ✅ | ❌ | ✅ |
| Patient create (`patient.create`) | `clericalProcedure` (`clerical`) | ✅ | ✅ | ❌ | ✅ |
| Medical tab save: vitals, medications, checklist, primary care doctor, history text (`patient.updateClinical`) | `protectedProcedure` | ✅ | ✅ | ✅ | ✅ |
| Patient Info and Billing tab saves (`patient.updateDemographics/updateBilling`) | `clericalProcedure` (`clerical`) | ✅ | ✅ | ❌ | ✅ |
| Send an intake link, review a submission, accept or reject it (`intake.send/byId/accept/reject`) | `clericalProcedure` (`clerical`; byId also checks the request's office against the actor's) | ✅ | ✅ | ❌ | ✅ |
| An office's pending intakes (`intake.listPending`) | `clericalOfficeScopedProcedure` | own offices only | own offices only | ❌ | own offices only |
| Review queue, note, sign-off (`review.queue/note/signOff`) | `medicalDirectorProcedure` (`review`) | ❌ | ✅ | ❌ | ❌ |
| Run the note sampler on demand (`review.runSample`; the weekly job runs it with no session) | `adminProcedure` (`staff`) | ✅ | ✅ | ❌ | ❌ |
| Open and submit the self-service form (`intake.open/submit`) | `publicProcedure`, the single-use token is the credential (ADR 29) | the person with the link | the person with the link | the person with the link | the person with the link |
| Patient activate/deactivate (`patient.setStatus`; no screen calls it since DIA-50, the column is kept unexposed) | `protectedProcedure` | ✅ | ✅ | ✅ | ✅ |
| Staff accounts: list, search, create, edit, enable/disable, assign any role including `medical_director` (`staffUsers.*`) | `adminProcedure` (`staff`) | ✅ | ✅ | ❌ | ❌ |
| Staff account delete (`staffUsers.delete`; confirmed in UI, never self) | `adminProcedure` (`staff`) | ✅ | ✅ | ❌ | ❌ |
| Anything office-scoped (future queues etc.) | `officeScopedProcedure` | own offices only | own offices only | own offices only | own offices only |
| `/users` page render | `guardPage('staff')` | ✅ | ✅ | ❌ | ❌ |
| Issue a temporary password | not a procedure — the `issue-temp-password` runbook, CLI-only | operator with DB access | operator with DB access | ❌ | ❌ |

Notes that carry weight:

- **The patient record is enforced by tab (ADR 28 as amended).** Three tabs,
  Medical, Patient Info, Billing, each served by its own procedure. A
  provider reads and writes the Medical tab only; the Patient Info and
  Billing procedures refuse them server-side (`FORBIDDEN`, audited), and the
  roster row they receive carries no phone. Which tabs a role renders is
  decided once, in `apps/web/src/features/patients/patient-tabs.ts`, from the
  same surfaces as the navigation; the layout is the same for every role.
  Nothing clinical is withheld from `frontdesk`: the front desk and admins see
  every tab, as the Aug 31 sync decided, and admins open on Medical.
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

## Integrations (partner keys, ADR 36 and ADR 38)

A partner key belongs to a fifth role, `integration`: a `users` row whose
`ROLE_ACCESS` row is `false` on every staff surface and `true` on one of
its own, `integration`, which grants a single page (`/integration`: the
account's keys and the door to `/api/v1/docs`) and a single procedure
(`integration.mine`). The Users screen lists these principals apart and
never assigns the role, the role switcher never offers it, `requireRole`
refuses it on every staff chain (no staff surface), and the staff shell
redirects it to its page. `/api/v1` resolves no session, and `/api/trpc`
accepts no key.
A key's permissions are **scopes** on the key row, checked by the partner
chain against the operation registry in `packages/contracts/src/partner-api/operations.ts`,
default deny. Patient-specific operations additionally require a
verification token minted by the verify operation for that patient and that
integration. A key may be restricted to some clinics; then it is a boundary,
not a filter (unlike a staff actor's, ADR 22).

| Operation | Scope | Verification token |
| --- | --- | :-: |
| `POST /api/v1/patients/lookup` | `patients:lookup` | no |
| `POST /api/v1/patients/{patientId}/verify` | `patients:verify` | no (issues one) |
| `GET /api/v1/queue/count` | `queue:read` | no |
| Planned: medications read, refill create, task create, appointments read and create, interaction writeback | `medications:read`, `refills:write`, `tasks:write`, `appointments:read`, `appointments:write`, `interactions:write` | yes, where a patient is named |

Every call, refused or not, writes a `phi_audit_events` row (ADR 37).
`apps/web/src/server/partner/scope-matrix.test.ts` runs every operation
against every single-scope key.

## Client surfaces (presentation, not enforcement)

`role-provider.tsx` renders from the **session's** role, supplied by the app
layout from the server (ADR 28), through the same four surfaces of
`ROLE_ACCESS`. Roles with `staff` (admin, medical director) may preview
another role's view from the header switcher; no other role can. The review
queue card additionally checks the session's own role, so a preview never
triggers a refused call.

| Surface | What it shows | admin | medical_director | provider | frontdesk |
| --- | --- | :-: | :-: | :-: | :-: |
| `clinical` | Charting, the Queues page, the Medical tab | ✅ | ✅ | ✅ | ❌ |
| `clerical` | Contact details, consent, scheduling, billing, outreach (incl. the roster's phone column) | ✅ | ✅ | ❌ | ✅ |
| `staff` | Staff accounts, clinic-wide reporting, the sampling run | ✅ | ✅ | ❌ | ❌ |
| `review` | The Medical Director Review Queue card on `/queues`, the note sign-off | ❌ | ✅ | ❌ | ❌ |

## Where the pieces live

| Concern | File |
| --- | --- |
| Role vocabulary and the access matrix (`ROLE_ACCESS`) | `packages/contracts/src/staff-role.ts`, ADR 31 |
| Procedure kinds (`protected` / `clerical` / `admin` / `officeScoped` / `clericalOfficeScoped`) | `apps/web/src/server/procedures.ts` |
| Intake tokens and queue | ADR 29 |
| Review sampling | ADR 30 |
| The medical director role and the queue card | ADR 31, `apps/web/src/features/review/medical-director-queue.tsx` |
| Record sections and tabs | ADR 28, `apps/web/src/features/patients/patient-tabs.ts` |
| Session + surface page guards | `apps/web/src/server/guards.ts`, `apps/web/src/lib/guard-page.ts` |
| Audit chain ordering | ADR 10 |
| Partner keys, scopes, verification tokens | ADR 38, `apps/web/src/server/partner/`, `docs/partner-api/` |
| The audit trail: event shape, the append-only table, the two sinks | ADR 37, `packages/contracts/src/audit.ts`, `apps/web/src/server/audit-log.ts` |
| Office scoping | ADR 22 |
| Mockup surfaces | `apps/web/src/components/role-provider.tsx` |
| Legacy role migration | `packages/db/scripts/migrate-users.ts`, docs/legacy-data-mapping.md § users |
