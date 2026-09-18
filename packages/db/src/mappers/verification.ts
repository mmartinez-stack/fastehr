import { patientVerificationSchema, type PatientVerification } from '@fastehr/contracts'
import type { PatientVerification as PatientVerificationRow } from '../generated/client/client.ts'

/**
 * Row → contract mapping for `PatientVerification`. `tokenHash` stays
 * behind, as the intake mapper leaves its token hash behind (ADR 29): a
 * read of the table must not produce anything a call could present.
 */
export function toPatientVerification(row: PatientVerificationRow): PatientVerification {
  return patientVerificationSchema.parse({
    id: row.id,
    apiClientId: row.apiClientId,
    patientId: row.patientId,
    method: row.method,
    expiresAt: row.expiresAt.toISOString(),
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt === null ? null : row.lastUsedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  })
}
