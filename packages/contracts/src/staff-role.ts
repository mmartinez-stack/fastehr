import { z } from 'zod'

/**
 * The staff role vocabulary — the entire authorization model, for now.
 *
 * One coarse role per account, decided at the auth-foundation ticket
 * (docs/auth-and-rbac-proposal.md; migration mapping in the migration
 * runbook): legacy `admin` → `admin`, `doc` → `provider`, `clerk` and `csr` →
 * `frontdesk`. The per-role visibility rules from the Aug 17 notes attach to
 * this vocabulary later — deliberately nothing here but the enum, so there is
 * exactly one place for that work to grow from.
 *
 * The same three values exist as the `staff_role` PostgreSQL enum, so an
 * invalid role is refused by the database no matter which code path writes it.
 */
export const staffRoleSchema = z.enum(['admin', 'provider', 'frontdesk'])

export type StaffRole = z.infer<typeof staffRoleSchema>

export const STAFF_ROLES = staffRoleSchema.options
