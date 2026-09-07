import {
  patientSchema,
  patientSummarySchema,
  type Patient,
  type PatientSummary,
} from '@fastehr/contracts'
import type { Patient as PatientRow, PatientMedication as MedicationRow } from '../generated/client/client.ts'

/**
 * Row → contract mapping for `Patient`.
 *
 * This is the boundary ADR 3 is about: persistence shapes stop here, and
 * everything downstream sees contract types only. Two rules:
 *
 * 1. **Every field is listed explicitly.** No spreading a row into a contract.
 *    A column added to the schema and forgotten here is a type error, not a
 *    silently-passed-through value — and a column that must NOT leave the
 *    database (an internal flag, a legacy id) simply never appears.
 * 2. **The result is parsed, not cast.** TypeScript checks the shape at compile
 *    time; `parse` checks what it cannot see — that a `String` column really
 *    holds a uuid, that a date is real. Drift between schema.prisma and
 *    contracts fails loudly, at the row, with the field named.
 *
 * Two mappers since DIA-52: the full record carries its medication list (one
 * read, with the relation included), while a roster row is the scalar row
 * alone — a hundred search results do not fetch a hundred medication lists.
 * The `patient_conditions` and `patient_allergies` tables are dormant (the
 * history section is out of scope) and are not read here.
 *
 * If a hot read path ever makes per-row parsing measurable, this function is
 * the single place that changes.
 */

/** A patient row with its medication list, as `findById` reads it. */
export type PatientRecordRow = PatientRow & {
  medications: MedicationRow[]
}

export function toPatient(row: PatientRecordRow): Patient {
  return patientSchema.parse({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: toCalendarDate(row.dateOfBirth),
    gender: row.gender,
    language: row.language,
    office: row.office,
    email: row.email,
    phone: row.phone,
    phoneFollowUpAllowed: row.phoneFollowUpAllowed,
    addressStreet: row.addressStreet,
    addressCity: row.addressCity,
    addressState: row.addressState,
    addressZip: row.addressZip,
    referralSource: row.referralSource,
    referredByPatientId: row.referredByPatientId,
    programType: row.programType,
    heightInches: row.heightInches,
    // Child rows arrive in `position` order (the repository asks for it);
    // the contract carries the order, not the position numbers.
    medications: row.medications.map((medication) => ({
      name: medication.name,
      dose: medication.dose,
      frequency: medication.frequency,
    })),
    historyOther: row.historyOther,
    pcpName: row.pcpName,
    pcpAddress: row.pcpAddress,
    pcpPhone: row.pcpPhone,
    status: row.status,
    // A timestamp, not a calendar date: the roster's over-a-year flag and
    // sort read it as an instant, so the ISO form goes across whole.
    lastVisitAt: row.lastVisitAt === null ? null : row.lastVisitAt.toISOString(),
    creditCardNumber: row.creditCardNumber,
    creditCardExpMonth: row.creditCardExpMonth,
    creditCardExpYear: row.creditCardExpYear,
    creditCardZip: row.creditCardZip,
    // `legacyId` stays behind on purpose (rule 1 above) — it is an import
    // bookkeeping column, not part of the patient the application sees.
  })
}

/** The roster row: identity, office, last visit, and the phone the front desk dials. */
export function toPatientSummary(row: PatientRow): PatientSummary {
  return patientSummarySchema.parse({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: toCalendarDate(row.dateOfBirth),
    office: row.office,
    lastVisitAt: row.lastVisitAt === null ? null : row.lastVisitAt.toISOString(),
    phone: row.phone,
  })
}

/**
 * `@db.Date` columns come back as a JS `Date` at UTC midnight. Taking the date
 * part of the ISO string is therefore exact — and it is why the conversion must
 * not go through local time, which would shift the day for anyone west of UTC
 * and turn a date of birth into the day before.
 */
function toCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}
