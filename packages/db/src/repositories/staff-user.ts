import { randomUUID } from 'node:crypto'
import type {
  CreateStaffUserInput,
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
 * Deliberately no `delete`: the legacy system hard-deleted 22 accounts and
 * left 38,047 clinical signatures pointing at nothing (entity inventory §1).
 * Deactivation is the only removal this repository offers.
 */
export interface StaffUserRepository {
  list(): Promise<StaffUser[]>
  /** The single-input search: substring on name or email, per the contract's dispatch. */
  search(input: SearchStaffUsersInput): Promise<StaffUser[]>
  create(input: CreateStaffUserInput): Promise<StaffUser>
  update(input: UpdateStaffUserInput): Promise<StaffUser | null>
  setActive(input: SetStaffUserActiveInput): Promise<StaffUser | null>
}

/** The one write failure an admin can cause from the form and must see by name. */
export class StaffUserEmailTakenError extends Error {
  constructor() {
    super('email already in use')
    this.name = 'StaffUserEmailTakenError'
  }
}

const CREDENTIAL_FILTER = { where: { providerId: 'credential' }, select: { id: true } } as const

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
        where:
          query.kind === 'email'
            ? { email: { contains: query.email, mode: 'insensitive' } }
            : { name: { contains: query.name, mode: 'insensitive' } },
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
  }
}
