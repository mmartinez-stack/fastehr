import { z } from 'zod'

/**
 * The staff role vocabulary and what each role may reach.
 *
 * One coarse role per account, decided at the auth-foundation ticket
 * (docs/auth-and-rbac-proposal.md; migration mapping in the migration
 * runbook): legacy `admin` → `admin`, `doc` → `provider`, `clerk` and `csr` →
 * `frontdesk`. `medical_director` (ADR 31) is assigned by hand: the
 * administrator's access plus the note review queue. Dr. Penn is the first.
 *
 * The same values exist as the `staff_role` PostgreSQL enum, so an invalid
 * role is refused by the database no matter which code path writes it.
 */
export const staffRoleSchema = z.enum(['admin', 'provider', 'frontdesk', 'medical_director'])

export type StaffRole = z.infer<typeof staffRoleSchema>

export const STAFF_ROLES = staffRoleSchema.options

/**
 * The surfaces a role can be granted, and the one matrix that grants them.
 *
 * Four surfaces rather than a permission per screen: the Aug 7 sync described
 * one division, the clinical record against the clerical record; `staff` is
 * clinic-wide reporting and the staff accounts, which sit in neither half;
 * `review` is the medical director's queue of sampled notes. The server
 * middleware and the client's navigation and tabs all read this table, so a
 * role's reach is decided in exactly one place. A role or surface the table
 * does not name is denied (`roleHasAccess`), never allowed by omission.
 */
export const ROLE_SURFACES = ['clinical', 'clerical', 'staff', 'review'] as const
export type RoleSurface = (typeof ROLE_SURFACES)[number]

export const ROLE_ACCESS: Readonly<Record<StaffRole, Readonly<Record<RoleSurface, boolean>>>> = {
  provider: { clinical: true, clerical: false, staff: false, review: false },
  frontdesk: { clinical: false, clerical: true, staff: false, review: false },
  admin: { clinical: true, clerical: true, staff: true, review: false },
  medical_director: { clinical: true, clerical: true, staff: true, review: true },
}

/** Default deny: an unknown role, or an unknown surface, is `false`. */
export function roleHasAccess(role: string, surface: RoleSurface): boolean {
  const access = (ROLE_ACCESS as Readonly<Record<string, Readonly<Record<RoleSurface, boolean>> | undefined>>)[role]
  return access?.[surface] === true
}
