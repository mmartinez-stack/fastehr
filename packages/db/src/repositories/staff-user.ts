import { randomUUID } from 'node:crypto'
import type {
  CreateStaffUserInput,
  DeleteStaffUserInput,
  SearchStaffUsersInput,
  SetStaffUserActiveInput,
  StaffUser,
  UpdateStaffUserInput,
} from '@fastehr/contracts'
import type { PrismaClient } from '../client.ts'
import { toStaffUser } from '../mappers/staff-user.ts'

/**
 * Staff account administration. Contract types only, as ADR 3 requires.
 *
 * `delete` is a hard delete, restored on request for legacy parity (the old
 * system had DELETE /users/:id, admin-only). The legacy lesson still stands:
 * that path orphaned 38,047 clinical signatures against 22 vanished accounts
 * (entity inventory §1). Sessions and credential accounts cascade at the FK;
 * a signed or reviewed visit does not — `visits.signedById` and
 * `visits.reviewedById` are ON DELETE RESTRICT, and this method refuses
 * first, by name, so the admin sees why. Deactivation
 * remains the everyday removal.
 */
export interface StaffUserRepository {
  list(): Promise<StaffUser[]>
  /** The single-input search: substring on name or email, per the contract's dispatch. */
  search(input: SearchStaffUsersInput): Promise<StaffUser[]>
  create(input: CreateStaffUserInput): Promise<StaffUser>
  update(input: UpdateStaffUserInput): Promise<StaffUser | null>
  setActive(input: SetStaffUserActiveInput): Promise<StaffUser | null>
  delete(input: DeleteStaffUserInput): Promise<StaffUser | null>
}

/** The one write failure an admin can cause from the form and must see by name. */
export class StaffUserEmailTakenError extends Error {
  constructor() {
    super('email already in use')
    this.name = 'StaffUserEmailTakenError'
  }
}

/**
 * The account has signed clinical records, so it cannot be deleted — only
 * deactivated. Named so the screen can say exactly that.
 */
export class StaffUserReferencedError extends Error {
  constructor() {
    super('account has signed clinical records')
    this.name = 'StaffUserReferencedError'
  }
}

const CREDENTIAL_FILTER ={ where: { providerId: 'credential' }, select: { id: true } } as const

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2002'
  )
}

export function createStaffUserRepository(getClient: () => PrismaClient): StaffUserRepository {
  return {
    async list() {
      const rows = await getClient().user.findMany({
        orderBy: [{ name: 'asc' }],
        include: { accounts: CREDENTIAL_FILTER },
      })
      return rows.map((row) => toStaffUser(row, row.accounts.length > 0))
    },

    async search(input) {
      const query = input.query
      const rows = await getClient().user.findMany({
        where: {
          ...(query === undefined
            ? {}
            : query.kind === 'email'
              ? { email: { contains: query.email, mode: 'insensitive' } }
              : { name: { contains: query.name, mode: 'insensitive' } }),
          ...(input.status === undefined ? {} : { isActive: input.status === 'active' }),
        },
        orderBy: [{ name: 'asc' }],
        include: { accounts: CREDENTIAL_FILTER },
      })
      return rows.map((row) => toStaffUser(row, row.accounts.length > 0))
    },

    async create(input) {
      try {
        const row = await getClient().user.create({
          data: {
            id: randomUUID(),
            name: input.name,
            email: input.email,
            role: input.role,
            medicalDirector: input.medicalDirector ?? false,
            // No credential is created here — issuance is the runbook's
            // explicit, out-of-band step, and the screen shows who is waiting.
          },
        })
        return toStaffUser(row, false)
      } catch (error) {
        if (isUniqueViolation(error)) throw new StaffUserEmailTakenError()
        throw error
      }
    },

    async update(input) {
      const client = getClient()
      const existing = await client.user.findUnique({ where: { id: input.id } })
      if (existing === null) return null

      const row = await client.user.update({
        where: { id: input.id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.medicalDirector === undefined ? {} : { medicalDirector: input.medicalDirector }),
        },
        include: { accounts: CREDENTIAL_FILTER },
      })
      return toStaffUser(row, row.accounts.length > 0)
    },

    async setActive(input) {
      const client = getClient()
      const existing = await client.user.findUnique({ where: { id: input.id } })
      if (existing === null) return null

      const [row] = await client.$transaction([
        client.user.update({
          where: { id: input.id },
          data: { isActive: input.isActive },
          include: { accounts: CREDENTIAL_FILTER },
        }),
        // Deactivation is immediate: live sessions die with it rather than
        // coasting until expiry. (Session resolution also re-checks isActive
        // on every call — this is belt on top of braces.)
        ...(input.isActive ? [] : [client.session.deleteMany({ where: { userId: input.id } })]),
      ])
      return toStaffUser(row, row.accounts.length > 0)
    },

    async delete(input) {
      const client = getClient()
      const existing = await client.user.findUnique({
        where: { id: input.id },
        include: { accounts: CREDENTIAL_FILTER },
      })
      if (existing === null) return null

      // A signature is a clinical record's attribution, and it outlives the
      // account. The FK would refuse the delete anyway (RESTRICT); checking
      // first turns a constraint violation into a named refusal.
      const referenced = await client.visit.count({
        where: { OR: [{ signedById: input.id }, { reviewedById: input.id }] },
      })
      if (referenced > 0) throw new StaffUserReferencedError()

      // Sessions and credential accounts go with the row — the FK is
      // ON DELETE CASCADE — so a deleted user cannot keep a live session.
      await client.user.delete({ where: { id: input.id } })
      return toStaffUser(existing, existing.accounts.length > 0)
    },
  }
}
