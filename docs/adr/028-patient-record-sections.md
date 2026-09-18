# ADR 28 — The patient record is served and written by section

**Status:** accepted, amended 2026-09-07 (three tabs; allergies out of scope), amended 2026-09-13 (the history text is writable)  
**Applies to:** `packages/contracts/src/patient.ts` · `packages/db/src/repositories/patient.ts` · `apps/web/src/server/routers/patient.ts` · `apps/web/src/server/procedures.ts` · `apps/web/src/features/patients/patient-form.tsx` · `apps/web/src/features/patients/patient-tabs.ts`

The Aug 31 stakeholder sync (DIA-52) split the patient record into tabs and
assigned them to roles: a provider sees the clinical side and never contact
details or billing; the front desk and admins see all of it. The ticket
asked for that to be enforced server-side, not only by hiding tabs.

**Amendment, 2026-09-07.** The record has exactly three tabs, the same on
the create, edit, and intake screens and for every role, in one fixed order:
**Medical** (first and default: vitals as feet plus inches, the medication
line items, the primary care doctor, the medical-history checklist),
**Patient Info** (the demographics and
contact fields), **Billing** (the card block with its banner). A role decides
only which of the three render — `patientTabsFor` in
`apps/web/src/features/patients/patient-tabs.ts`, derived from the same
surfaces the navigation uses — never the layout; a role with one tab still
gets a tab list. No field of one tab renders inside another; the chart
header carries the patient's name and date of birth and nothing else.

Medical history is a **checklist** of fourteen conditions, every item "No"
until answered, a "Yes" opening when, who treats it, and whether it is
medicated and with what. The clinic gave no list, so `PATIENT_CONDITIONS` is
a working one; the stored key is a plain string, so changing the list is a
contracts change, not a migration. Beneath the checklist is "History", one
free text box (`historyOther`; the Sep 7 sync asked for a text box and no
file upload). It is part of the clinical section's input on create, edit,
and intake, so a save of the Medical tab writes it; the legacy "medications
and pertinent history" text was migrated into the same column and reads as
the starting draft. (Until 2026-09-13 it was shown read-only.)
Allergies are **out of scope**: the allergy list an earlier cut built is
removed from the contract, the mapper, the repository, and the form, and its
table (`patient_allergies`) stays in the schema, dormant, since dropping it is
a migration this amendment does not need.

## Decision

**A section is the unit of authorization, and the API is shaped by sections.**

- One read schema per section in contracts (`patientHeaderSchema`,
  `patientClinicalSchema`, `patientDemographicsSchema`,
  `patientBillingSchema`), and one write input per section
  (`updatePatientClinicalInput`, `updatePatientDemographicsInput`,
  `updatePatientBillingInput`). `createPatientInput` is their union, because
  the create form submits every tab at once.
- The repository speaks the full entity and offers one update per section.
  There is no record-wide update any more.
- Procedures serve sections, and a section is a tab's data set:
  `patient.byId` returns the header plus the Medical tab to every role;
  `patient.demographics` (the Patient Info tab) and `patient.billing` are
  `clericalProcedure` (admin or front desk); `patient.updateClinical` is
  open to every role, the other two updates and `patient.create` are clerical.
  The roster procedures return a summary row with the phone nulled for a
  provider.
- **Redaction is a parse.** A procedure takes the repository's full record and
  runs it through the section's Zod object, which strips every key it does
  not declare. The client therefore cannot ask for more than its section: the
  shape leaving the server is the schema, not a `select` someone remembered
  to write.
- The client renders the tabs the session's role allows, saves through the
  section mutations that role may call, and validates locally with the same
  section schemas. The session's role reaches the client from the server
  (`sessionIdentity`), never from a switch the browser controls; the mockup's
  "Viewing as" switcher survives only for admins, whose server-side rights
  cover every section, so a preview cannot hit a refusal.

## Why sections rather than a per-field mask

A field-level mask ("hide these columns for role X") would keep one
record-wide procedure and one record-wide update, with a filter applied on the
way out and on the way in. It is less code. It was rejected because the
failure mode is silent: a new column is visible to everyone until someone
remembers to add it to the mask, and a review of the procedure shows nothing
wrong. With sections, a new column must be placed in a section schema to
leave the server at all, and the section it lands in decides who sees it.
Forgetting is a type error at the mapper, not a leak.

The other candidate, separate procedures per *sub-section* (vitals,
medications, and so on), was more granular than the decision behind it: the
sync described two halves, clinical and clerical, plus billing isolated for
its own reasons. Three read groups and three writes match that, and since the
amendment they are exactly the three tabs.

## Consequences

- `patient.byId` no longer returns phone, email, address, or card fields to
  anyone. Screens that need them (the edit page for clerical roles) fetch
  `demographics` and `billing` alongside.
- The roster shows a provider no phone column, and the row the server sends
  them carries `phone: null` — the column's absence is not a client choice.
- Creating a patient is a front-desk task. A provider's new-patient page says
  so; a provider's `patient.create` is refused and audited.
- The old combined "current medications and pertinent history" text stays
  in `historyOther` (a column rename, no data moved), shown read-only under
  the Medical tab's checklist. Healthy weight is gone: the column was
  dropped, and no schema, input, screen, or report reads it.
