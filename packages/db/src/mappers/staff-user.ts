import { staffUserSchema, type StaffUser } from '@fastehr/contracts'
import type { User as UserRow } from '../generated/client/client.ts'

/**
 * Row → contract mapping for staff users, under the same two rules as the
 * patient mapper: every field listed explicitly, and the result parsed rather
 * than cast. What never appears here is as deliberate as what does —
 * `legacyId`, `legacyRoleRaw`, `emailVerified`, and `mustChangePassword` stay
 * inside this package; administration has no business with any of them.
 */
export function toStaffUser(row: UserRow, hasCredential: boolean): StaffUser {
  return staffUserSchema.parse({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    hasCredential,
    createdAt: row.createdAt.toISOString(),
  })
}
