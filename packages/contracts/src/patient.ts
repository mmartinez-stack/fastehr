import { z } from 'zod'

/**
 * Seed contract. Real schemas land with the domain tickets — this exists so the
 * package builds, type-checks, and can be imported across the workspace.
 */
export const patientIdSchema = z.uuid().brand<'PatientId'>()

export type PatientId = z.infer<typeof patientIdSchema>

export const patientSchema = z.object({
  id: patientIdSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.iso.date(),
})

export type Patient = z.infer<typeof patientSchema>
