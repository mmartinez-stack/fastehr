import { z } from 'zod'

export { databaseUrlSchema, serverEnvSchema, type ServerEnv } from './env.ts'

/**
 * Seed contract. Real schemas arrive with the domain tickets — this exists so
 * the package is importable and its inferred types flow across the workspace.
 *
 * `contracts` is the only package with a direct Zod dependency (decision 5).
 */
export const patientSchema = z.object({
  id: z.uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.iso.date(),
})

export type Patient = z.infer<typeof patientSchema>
