import type { Db } from '@fastehr/db'
import { StaffUserEmailTakenError } from '@fastehr/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createContext, type Actor } from '../context.ts'
import { appRouter } from './root.ts'

/**
 * The staff-user procedures with fake repositories — the admin gate, the
 * input normalization, and the error translation, with no database anywhere.
 */

const JUNE: ReturnType<Db['staffUsers']['list']> extends Promise<Array<infer U>> ? U : never = {
  id: 'staff-1',
  name: 'June Osborne',
  email: 'june@example.com',
  role: 'frontdesk',
  isActive: true,
  hasCredential: false,
  createdAt: '2020-01-15T00:00:00.000Z',
}

const ADMIN: Actor = { id: 'admin-1', roles: ['admin'], offices: ['Downtown'] }
const PROVIDER: Actor = { id: 'prov-1', roles: ['provider'], offices: ['Downtown'] }

function fakeDb(overrides: Partial<Db['staffUsers']> = {}): Db {
  return {
    patients: {
      findById: async () => null,
      listByLastName: async () => [],
      listRecent: async () => [],
      search: async () => [],
      searchByName: async () => [],
      create: async () => {
        throw new Error('not under test')
      },
      update: async () => {
        throw new Error('not under test')
      },
      setStatus: async () => {
        throw new Error('not under test')
      },
    },
    staffUsers: {
      list: async () => [JUNE],
      create: async () => JUNE,
      update: async () => JUNE,
      setActive: async () => JUNE,
      ...overrides,
    },
  }
}

function callerWith(db: Db, actor: Actor | null = ADMIN) {
  return appRouter.createCaller(createContext({ actor, db }))
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('staff-user router authorization', () => {
  it('refuses every procedure to a non-admin, before the repository is touched', async () => {
    const list = vi.fn(async () => [JUNE])
    const caller = callerWith(fakeDb({ list }), PROVIDER)

    await expect(caller.staffUsers.list()).rejects.toThrow('FORBIDDEN')
    await expect(
      caller.staffUsers.create({ name: 'X', email: 'x@example.com', role: 'frontdesk' }),
    ).rejects.toThrow('FORBIDDEN')
    await expect(caller.staffUsers.setActive({ id: 'staff-1', isActive: false })).rejects.toThrow(
      'FORBIDDEN',
    )
    expect(list).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller', async () => {
    const caller = callerWith(fakeDb(), null)
    await expect(caller.staffUsers.list()).rejects.toThrow('UNAUTHORIZED')
  })

  it('admits an admin', async () => {
    const caller = callerWith(fakeDb())
    expect(await caller.staffUsers.list()).toEqual([JUNE])
  })
})

describe('create', () => {
  it('normalizes the email before it reaches the repository', async () => {
    const create = vi.fn(async () => JUNE)
    const caller = callerWith(fakeDb({ create }))

    await caller.staffUsers.create({ name: 'June', email: '  June@Example.COM ', role: 'frontdesk' })

    expect(create).toHaveBeenCalledWith({ name: 'June', email: 'june@example.com', role: 'frontdesk' })
  })

  it('rejects a role outside the vocabulary before the repository', async () => {
    const create = vi.fn(async () => JUNE)
    const caller = callerWith(fakeDb({ create }))

    await expect(
      caller.staffUsers.create({
        name: 'X',
        email: 'x@example.com',
        role: 'superuser' as never,
      }),
    ).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })

  it('translates a duplicate email into CONFLICT', async () => {
    const caller = callerWith(
      fakeDb({
        create: async () => {
          throw new StaffUserEmailTakenError()
        },
      }),
    )

    await expect(
      caller.staffUsers.create({ name: 'X', email: 'june@example.com', role: 'frontdesk' }),
    ).rejects.toThrow('email already in use')
  })
})

describe('setActive', () => {
  it('refuses to let an admin deactivate their own account', async () => {
    const setActive = vi.fn(async () => JUNE)
    const caller = callerWith(fakeDb({ setActive }))

    await expect(caller.staffUsers.setActive({ id: ADMIN.id, isActive: false })).rejects.toThrow(
      'cannot deactivate your own account',
    )
    expect(setActive).not.toHaveBeenCalled()
  })

  it('lets an admin reactivate themself — only deactivation is guarded', async () => {
    const caller = callerWith(fakeDb())
    await expect(caller.staffUsers.setActive({ id: ADMIN.id, isActive: true })).resolves.toEqual(JUNE)
  })

  it('surfaces an unknown id as NOT_FOUND', async () => {
    const caller = callerWith(fakeDb({ setActive: async () => null }))
    await expect(caller.staffUsers.setActive({ id: 'ghost', isActive: false })).rejects.toThrow(
      'NOT_FOUND',
    )
  })
})
