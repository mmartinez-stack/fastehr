import type { PatientVerification, PatientVerificationMethod } from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toPatientVerification } from '../mappers/verification.ts'

/**
 * Patient verification tokens and the attempt counter behind the lockout
 * (ADR 38).
 *
 * The token itself is minted and hashed in the server layer; only the hash
 * arrives here, and only the hash is looked up, as with the intake token
 * (ADR 29). Attempts are rows rather than counters so the lockout survives
 * a restart and so an investigation can see the pattern that tripped it.
 */
export interface VerificationRepository {
  create(input: {
    integrationId: string
    patientId: string
    /** SHA-256 of the token; the token itself is never stored. */
    tokenHash: string
    method: PatientVerificationMethod
    expiresAt: Date
    requestId: string | null
    ipAddress: string | null
  }): Promise<PatientVerification>
  findByTokenHash(tokenHash: string): Promise<PatientVerification | null>
  markUsed(id: string, at: Date): Promise<void>
  recordAttempt(input: {
    integrationId: string
    patientId: string
    succeeded: boolean
    ipAddress: string | null
  }): Promise<void>
  /** Failed attempts since `since`, for one patient of the integration or for the whole integration. */
  countFailedAttempts(input: { integrationId: string; patientId?: string; since: Date }): Promise<number>
  /** The most recent successful attempt for the patient, after which earlier failures no longer count. */
  lastSuccessAt(input: { integrationId: string; patientId: string }): Promise<Date | null>
}

export function createVerificationRepository(getClient: () => PrismaClient): VerificationRepository {
  return {
    async create(input) {
      const row = await getClient().patientVerification.create({
        data: {
          integrationId: input.integrationId,
          patientId: input.patientId,
          tokenHash: input.tokenHash,
          method: input.method,
          expiresAt: input.expiresAt,
          requestId: input.requestId,
          ipAddress: input.ipAddress,
        },
      })
      return toPatientVerification(row)
    },

    async findByTokenHash(tokenHash) {
      const row = await getClient().patientVerification.findUnique({ where: { tokenHash } })
      return row === null ? null : toPatientVerification(row)
    },

    async markUsed(id, at) {
      await getClient().patientVerification.updateMany({
        where: { id },
        data: { useCount: { increment: 1 }, lastUsedAt: at },
      })
    },

    async recordAttempt(input) {
      await getClient().patientVerificationAttempt.create({
        data: {
          integrationId: input.integrationId,
          patientId: input.patientId,
          succeeded: input.succeeded,
          ipAddress: input.ipAddress,
        },
      })
    },

    async countFailedAttempts({ integrationId, patientId, since }) {
      return getClient().patientVerificationAttempt.count({
        where: {
          integrationId,
          ...(patientId === undefined ? {} : { patientId }),
          succeeded: false,
          occurredAt: { gte: since },
        },
      })
    },

    async lastSuccessAt({ integrationId, patientId }) {
      const row = await getClient().patientVerificationAttempt.findFirst({
        where: { integrationId, patientId, succeeded: true },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      })
      return row?.occurredAt ?? null
    },
  }
}
