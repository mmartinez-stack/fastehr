import { z } from 'zod'
import { staffRoleSchema } from './staff-role.ts'

/**
 * Staff account administration — the contract behind the Users screen.
 *
 * `id` is a plain non-empty string, not a uuid: migrated accounts carry
 * uuids, but accounts Better Auth creates use its own id alphabet, and the
 * contract must accept both.
 */
export const staffUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  role: staffRoleSchema,
  isActive: z.boolean(),
  /**
   * Whether a sign-in credential exists. Surfaced so an admin can see who
   * still needs a temporary password issued — credentials are never created
   * from this screen (runbook: issue-temp-password).
   */
  hasCredential: z.boolean(),
  createdAt: z.iso.datetime(),
})

export type StaffUser = z.infer<typeof staffUserSchema>

/** Trimmed and lowercased before validation — the same normalization the migration applies. */
const normalizedEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())

export const createStaffUserInput = z.object({
  name: z.string().trim().min(1),
  email: normalizedEmail,
  role: staffRoleSchema,
})

export type CreateStaffUserInput = z.infer<typeof createStaffUserInput>

export const updateStaffUserInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  role: staffRoleSchema.optional(),
})

export type UpdateStaffUserInput = z.infer<typeof updateStaffUserInput>

export const setStaffUserActiveInput = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
})

export type SetStaffUserActiveInput = z.infer<typeof setStaffUserActiveInput>

/**
 * The Users screen search — the roster's single-input pattern (ADR 27)
 * applied to staff: the format decides the field. An `@` anywhere means
 * email, anything else is a name. Both match by substring, case-insensitive
 * (unlike the patient roster's exact legacy semantics — staff search has no
 * legacy behavior to preserve, and an admin scanning a 30-row list wants
 * "gar" to find Garcia).
 */
export const searchStaffUsersInput = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(150)
    .transform((value) =>
      value.includes('@')
        ? { kind: 'email' as const, email: value.toLowerCase() }
        : { kind: 'name' as const, name: value },
    ),
})

export type SearchStaffUsersInput = z.infer<typeof searchStaffUsersInput>
