# The provider's record view: what it still needs from the data layer

The Sep 7 sync reviewed the provider's clinical view at `/patients/[id]`
and settled its layout: patient information top right with the weight bar
chart fixed beneath it, visit records centre and left, height and weight and
medication squeezed into compact columns, height read as "5 ft 4 in", a free
text box for the medical history (no file upload), and nothing
administrative or dispensing-related on the provider's screen. The view is
reworked on the mockup fixtures. This note lists what has to land in the
schema before it can read real data, kept to the minimum the screen shows.

## What the screen reads today, and where it comes from

| On the screen | Source now | Real source | Migration |
| --- | --- | --- | --- |
| Name, DOB, age, height, office, program, last visit | fixtures | `patient.byId` (header + clinical), already wired for the edit screen | none |
| Medical history free text | fixtures | `patients.historyOther`, the Medical tab's "History" box, writable since 2026-09-13 | none |
| Current medication | fixtures | `patient_medications` (the Medical tab's list) | none |
| Weight per visit, the chart, start/current/lost, BMI | fixtures | not imported: the legacy `visits.weight`, `visits.bmi`, `visits.bloodPressure` were deferred as "charting detail" (docs/legacy-data-mapping.md § visits) | **1. visit vitals** |
| Visit note body, signature, date, office | fixtures | `visits` (imported) | none |
| Medication per visit | fixtures | not imported: the legacy `visits.medications` map (228,754 real slots over 31 drug keys) | **2. visit medications**, only if the visit list keeps the column |
| Provider per visit | fixtures | `visits.providerId` (ADR 33) for new visits; the signer's name for imported ones | none |
| Visit type (consultation, injection, pills) | fixtures | nothing: the type belongs to the appointment (DIA-48) | later, with scheduling |

## Migration 1: visit vitals (needed)

One migration, four nullable columns on `visits`, imported from the legacy
export, which already carries them:

| Column | Type | Legacy source | Note |
| --- | --- | --- | --- |
| `weightLbs` | `Decimal(6,2)` | `weight` (int or double) | 186,708 of 197,441 visits carry one; 17 fall outside 50 to 1000 and import as NULL, reported |
| `bmi` | `Decimal(5,2)` | `bmi` | Stored, not derived: the legacy value was computed against the height at the time, and the patient's height today is not that height. Derive for new visits from the patient's height, store the result |
| `systolic` | `Int` | `bloodPressure.systolic` | 59,764 present; the same sanity range as the discovery doc (50 to 300) |
| `diastolic` | `Int` | `bloodPressure.diastolic` | 20 to 200 |

Contract: `visitVitalsSchema` and a `visit.listForPatient` procedure
returning date, vitals, note, signature, and status, oldest first for the
chart. The chart and the vitals strip read it; nothing else changes. The
sanity ranges are import-time filters and contract refinements, not CHECK
constraints, because the values reach the table only through the
repository and the import (ADR 25).

## Migration 2: visit medications (optional)

The visit list shows a medication column and the legacy record dispensed
per visit. If the clinic wants it on the provider's view, it is a
`visit_medications` child table: `visitId`, `key` (the 31 legacy map keys),
`amount`, `dosage`, `productId`, imported from the map with the empty slots
dropped. It also feeds inventory deduction (DIA-63) and the treatment
catalog (DIA-62), which is the better reason to do it, and the reason to do
it there rather than here. Without it the column shows the patient's current
medication list on every row, which is honest but not per visit.

## Not a migration

- **Height as text.** `formatHeight` in `apps/web/src/features/patients/height.ts`
  reads the stored inches as "5 ft 4 in". No column changes.
- **The history box.** `historyOther` is a clinical input now; no column changed.
- **The tabs.** Styled once against the slot attributes in `globals.css`;
  the primitive is untouched (ADR 20).
- **The refill request and the sign-off.** Dispensing and charting are
  their own modules (DIA-53, DIA-49's write path); the buttons on the
  mockup stay mockup until then.
