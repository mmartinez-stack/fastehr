# ADR 28 — The patient record is served and written by section

**Status:** accepted  
**Applies to:** `packages/contracts/src/patient.ts` · `packages/db/src/repositories/patient.ts` · `apps/web/src/server/routers/patient.ts` · `apps/web/src/server/procedures.ts` · `apps/web/src/features/patients/patient-form.tsx`

The Aug 31 stakeholder sync (DIA-52) split the patient record into tabs —
Demographics, Vitals, Medications, Medical history, Allergies, Primary care
doctor, Billing — and assigned them to roles: a provider sees the clinical
tabs and never Demographics or Billing; the front desk and admins see all of
them. The ticket asked for that to be enforced server-side, not only by
hiding tabs.

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
- Procedures serve sections: `patient.byId` returns the header plus the
  clinical half to every role; `patient.demographics` and `patient.billing`
  are `clericalProcedure` (admin or front desk); `patient.updateClinical` is
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

The other candidate, separate procedures per *tab* (seven of them), was more
granular than the decision behind it: the sync described two halves, clinical
and clerical, plus billing isolated for its own reasons. Three read groups
and three writes match that; seven would encode structure nobody asked for.

## Consequences

- `patient.byId` no longer returns phone, email, address, or card fields to
  anyone. Screens that need them (the edit page for clerical roles) fetch
  `demographics` and `billing` alongside.
- The roster shows a provider no phone column, and the row the server sends
  them carries `phone: null` — the column's absence is not a client choice.
- Creating a patient is a front-desk task. A provider's new-patient page says
  so; a provider's `patient.create` is refused and audited.
- The old combined "current medications and pertinent history" text is the
  "Other" field of Medical history (`historyOther`, a column rename, no data
  moved). Healthy weight is gone: no screen and no report read it.
- The medical-history checklist vocabulary (`PATIENT_CONDITIONS`) is a stub;
  the stored key is a plain string so replacing the list is a contracts
  change, not a migration.
