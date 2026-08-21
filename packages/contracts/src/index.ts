import { z } from 'zod'

export {
  databaseUrlSchema,
  betterAuthSecretSchema,
  betterAuthUrlSchema,
  serverEnvSchema,
  type ServerEnv,
} from './env.ts'
export { staffRoleSchema, STAFF_ROLES, type StaffRole } from './staff-role.ts'
export {
  staffUserSchema,
  createStaffUserInput,
  updateStaffUserInput,
  setStaffUserActiveInput,
  type StaffUser,
  type CreateStaffUserInput,
  type UpdateStaffUserInput,
  type SetStaffUserActiveInput,
} from './staff-user.ts'
export { describeValidationFailure, type ValidationFailure } from './errors.ts'
export { officeSchema, officeScopedInput, type Office } from './office.ts'

/**
 * Seed contract. Real schemas arrive with the domain tickets — this exists so
 * the package is importable and its inferred types flow across the workspace.
 *
 * `contracts` is the only package with a direct Zod dependency (ADR 5).
 */
export const patientSchema = z.object({
  id: z.uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.iso.date(),
})

export type Patient = z.infer<typeof patientSchema>
