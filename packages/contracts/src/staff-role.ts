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
export const staffRoleSchema = z.enum(['admin', 'provider', 'frontdesk', 'medical_director', 'integration'])

export type StaffRole = z.infer<typeof staffRoleSchema>

export const STAFF_ROLES = staffRoleSchema.options

/**
 * `integration` is the principal behind a partner API key (ADR 36, as
 * amended): a `users` row so the audit trail names it, which may hold a
 * credential so the partner's team can sign in to one page, their own
 * integration, and nothing else. It is never assigned from the Users
 * screen and never offered by the role switcher; the human vocabulary
 * below is what those surfaces use.
 */
export const humanStaffRoleSchema = staffRoleSchema.exclude(['integration'])
export type HumanStaffRole = z.infer<typeof humanStaffRoleSchema>
export const HUMAN_STAFF_ROLES = humanStaffRoleSchema.options

/**
 * The surfaces a role can be granted, and the one matrix that grants them.
 *
 * Four surfaces rather than a permission per screen: the Aug 7 sync described
 * one division, the clinical record against the clerical record; `staff` is
 * clinic-wide reporting and the staff accounts, which sit in neither half;
 * `review` is the medical director's queue of sampled notes; `integration`
 * is the partner account's one page, its keys and the API reference, and
 * nothing clinical, because a key's reach is a scope on the key (ADR 38),
 * not a surface. The server
 * middleware and the client's navigation and tabs all read this table, so a
 * role's reach is decided in exactly one place. A role or surface the table
 * does not name is denied (`roleHasAccess`), never allowed by omission.
 */
export const ROLE_SURFACES = ['clinical', 'clerical', 'staff', 'review', 'integration'] as const
export type RoleSurface = (typeof ROLE_SURFACES)[number]

/**
 * The surfaces a person works in. `integration` is not one of them: it is
 * the single page a partner's account sees (its keys and the reference),
 * held by the `integration` role alone, and every staff chain refuses a
 * role that holds none of these four (ADR 36 as amended).
 */
export const STAFF_SURFACES = ['clinical', 'clerical', 'staff', 'review'] as const satisfies readonly RoleSurface[]

export const ROLE_ACCESS: Readonly<Record<StaffRole, Readonly<Record<RoleSurface, boolean>>>> = {
  provider: { clinical: true, clerical: false, staff: false, review: false, integration: false },
  frontdesk: { clinical: false, clerical: true, staff: false, review: false, integration: false },
  admin: { clinical: true, clerical: true, staff: true, review: false, integration: false },
  medical_director: { clinical: true, clerical: true, staff: true, review: true, integration: false },
  integration: { clinical: false, clerical: false, staff: false, review: false, integration: true },
}

/** Default deny: an unknown role, or an unknown surface, is `false`. */
export function roleHasAccess(role: string, surface: RoleSurface): boolean {
  const access = (ROLE_ACCESS as Readonly<Record<string, Readonly<Record<RoleSurface, boolean>> | undefined>>)[role]
  return access?.[surface] === true
}
