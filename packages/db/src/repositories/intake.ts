import {
  resolveLegacyOffice,
  type CreatePatientInput,
  type IntakeRequest,
  type IntakeSubmission,
  type LocationFilter,
  type Patient,
  type PatientLanguage,
} from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toIntakeRequest } from '../mappers/intake.ts'
import { toPatient } from '../mappers/patient.ts'

/**
 * Intake requests (DIA-72, ADR 29): the texted link, what came back, and its
 * acceptance into a patient record.
 *
 * Every state change is a conditional write — `updateMany` with the expected
 * status in the `where` — so two front-desk users accepting the same
 * submission, or a person submitting a link twice, resolve to one winner and
 * one `null`, decided by the database rather than by a check that raced.
 */
export interface IntakeRepository {
  create(input: {
    firstName: string
    lastName: string
    phone: string
    language: PatientLanguage | undefined
    /** SHA-256 of the token; the token itself is never stored. */
    tokenHash: string
    expiresAt: Date
    createdById: string
  }): Promise<IntakeRequest>
  findById(id: string): Promise<IntakeRequest | null>
  findByTokenHash(tokenHash: string): Promise<IntakeRequest | null>
  /**
   * Records the submission and the signed consent on a request still in
   * `sent`; null if it was not. The consent's time is the database write.
   */
  submit(input: {
    tokenHash: string
    submission: IntakeSubmission
    consent: { signature: string; version: string; language: PatientLanguage }
  }): Promise<IntakeRequest | null>
  /** A clinic's queue, or every clinic's: submitted, awaiting review, oldest first. */
  listPending(location: LocationFilter): Promise<IntakeRequest[]>
  /** Creates the patient and marks the request accepted, atomically; null if the request was not `submitted`. */
  accept(input: {
    id: string
    patient: CreatePatientInput
    reviewedById: string
  }): Promise<{ request: IntakeRequest; patient: Patient } | null>
  reject(input: { id: string; reviewedById: string }): Promise<IntakeRequest | null>
}

const RECORD_INCLUDE = {
  medications: { orderBy: { position: 'asc' as const } },
  conditions: { orderBy: { condition: 'asc' as const } },
}

export function createIntakeRepository(getClient: () => PrismaClient): IntakeRepository {
  return {
    async create(input) {
      const row = await getClient().intakeRequest.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          language: input.language ?? null,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdById: input.createdById,
        },
      })
      return toIntakeRequest(row)
    },

    async findById(id) {
      const row = await getClient().intakeRequest.findUnique({ where: { id } })
      return row === null ? null : toIntakeRequest(row)
    },

    async findByTokenHash(tokenHash) {
      const row = await getClient().intakeRequest.findUnique({ where: { tokenHash } })
      return row === null ? null : toIntakeRequest(row)
    },

    async submit(input) {
      const client = getClient()
      // One instant for both: the consent was signed by the act of submitting.
      const now = new Date()
      const { count } = await client.intakeRequest.updateMany({
        where: { tokenHash: input.tokenHash, status: 'sent' },
        data: {
          status: 'submitted',
          office: input.submission.office,
          locationId: resolveLegacyOffice(input.submission.office)?.locationSlug ?? null,
          submission: input.submission,
          submittedAt: now,
          consentSignature: input.consent.signature,
          consentSignedAt: now,
          consentVersion: input.consent.version,
          consentLanguage: input.consent.language,
        },
      })
      if (count === 0) return null
      const row = await client.intakeRequest.findUnique({ where: { tokenHash: input.tokenHash } })
      return row === null ? null : toIntakeRequest(row)
    },

    async listPending(location) {
      const rows = await getClient().intakeRequest.findMany({
        where: { status: 'submitted', ...(location === 'all' ? {} : { locationId: location }) },
        orderBy: { submittedAt: 'asc' },
      })
      return rows.map(toIntakeRequest)
    },

    async accept(input) {
      const client = getClient()
      // The patient row first, then the claim on the request. If another
      // reviewer already moved the status, the claim updates nothing and the
      // throw below rolls the patient row back with it — an accept that
      // loses must leave no record behind.
      class NotPending extends Error {}
      try {
        return await client.$transaction(async (tx) => {
          const { medications, conditions, ...scalars } = input.patient
          const patientRow = await tx.patient.create({
            data: {
              firstName: scalars.firstName,
              lastName: scalars.lastName,
              dateOfBirth: new Date(scalars.dateOfBirth),
              gender: scalars.gender,
              language: scalars.language ?? null,
              office: scalars.office ?? null,
              email: scalars.email ?? null,
              addressStreet: scalars.addressStreet,
              addressCity: scalars.addressCity,
              addressState: scalars.addressState,
              addressZip: scalars.addressZip,
              phone: scalars.phone,
              phoneFollowUpAllowed: scalars.phoneFollowUpAllowed,
              referralSource: scalars.referralSource ?? null,
              referredByPatientId: scalars.referredByPatientId ?? null,
              programType: scalars.programType ?? null,
              heightInches: scalars.heightInches,
              pcpName: scalars.pcpName ?? null,
              pcpAddress: scalars.pcpAddress ?? null,
              pcpPhone: scalars.pcpPhone ?? null,
              historyOther: scalars.historyOther ?? null,
              creditCardNumber: scalars.creditCardNumber ?? null,
              creditCardExpMonth: scalars.creditCardExpMonth ?? null,
              creditCardExpYear: scalars.creditCardExpYear ?? null,
              creditCardZip: scalars.creditCardZip ?? null,
              medications: {
                create: medications.map((row, position) => ({
                  name: row.name,
                  dose: row.dose ?? null,
                  frequency: row.frequency ?? null,
                  position,
                })),
              },
              conditions: {
                create: conditions.map((row) => ({
                  condition: row.condition,
                  onset: row.onset ?? null,
                  treatedBy: row.treatedBy ?? null,
                  medicated: row.medicated,
                  medications: row.medications ?? null,
                })),
              },
            },
            include: RECORD_INCLUDE,
          })

          const { count } = await tx.intakeRequest.updateMany({
            where: { id: input.id, status: 'submitted' },
            data: {
              status: 'accepted',
              patientId: patientRow.id,
              reviewedById: input.reviewedById,
              reviewedAt: new Date(),
            },
          })
          if (count === 0) throw new NotPending()

          const requestRow = await tx.intakeRequest.findUniqueOrThrow({ where: { id: input.id } })
          return { request: toIntakeRequest(requestRow), patient: toPatient(patientRow) }
        })
      } catch (error) {
        if (error instanceof NotPending) return null
        throw error
      }
    },

    async reject(input) {
      const client = getClient()
      const { count } = await client.intakeRequest.updateMany({
        where: { id: input.id, status: 'submitted' },
        data: { status: 'rejected', reviewedById: input.reviewedById, reviewedAt: new Date() },
      })
      if (count === 0) return null
      const row = await client.intakeRequest.findUnique({ where: { id: input.id } })
      return row === null ? null : toIntakeRequest(row)
    },
  }
}
