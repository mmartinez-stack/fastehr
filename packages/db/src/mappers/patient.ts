import { patientSchema, type Patient } from '@fastehr/contracts'
import type { Patient as PatientRow } from '../generated/client/client.ts'

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
 * If a hot read path ever makes per-row parsing measurable, this function is
 * the single place that changes.
 */
export function toPatient(row: PatientRow): Patient {
  return patientSchema.parse({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    dateOfBirth: toCalendarDate(row.dateOfBirth),
    gender: row.gender,
    heightInches: row.heightInches,
    healthyWeight: row.healthyWeight,
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
    historyNotes: row.historyNotes,
    programType: row.programType,
    status: row.status,
    // `legacyId` stays behind on purpose (rule 1 above) — it is an import
    // bookkeeping column, not part of the patient the application sees.
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
