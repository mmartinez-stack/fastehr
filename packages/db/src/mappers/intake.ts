import { intakeRequestSchema, type IntakeRequest } from '@fastehr/contracts'
import type { IntakeRequest as IntakeRequestRow } from '../generated/client/client.ts'

/**
 * Row → contract mapping for `IntakeRequest`, on the same two rules as the
 * patient mapper: every field listed, the result parsed. Two columns stay
 * behind on purpose: `tokenHash` (a database read must not yield a working
 * link) and the reviewer bookkeeping.
 *
 * `submission` is a JSON column; parsing it through the contract on every
 * read is what turns a stale or hand-edited blob into a named failure at the
 * boundary instead of an accept that writes a malformed patient.
 */
export function toIntakeRequest(row: IntakeRequestRow): IntakeRequest {
  return intakeRequestSchema.parse({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    language: row.language,
    status: row.status,
    office: row.office,
    locationId: row.locationId,
    expiresAt: row.expiresAt.toISOString(),
    submittedAt: row.submittedAt === null ? null : row.submittedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    patientId: row.patientId,
    submission: row.submission,
    consent:
      row.consentSignature === null ||
      row.consentSignedAt === null ||
      row.consentVersion === null ||
      row.consentLanguage === null
        ? null
        : {
            signature: row.consentSignature,
            signedAt: row.consentSignedAt.toISOString(),
            version: row.consentVersion,
            language: row.consentLanguage,
          },
  })
}
