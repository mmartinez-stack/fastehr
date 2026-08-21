import type { Db } from '@fastehr/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createContext, type Actor } from '../context.ts'
import { appRouter } from './root.ts'

/**
 * Procedures exercised with fake repositories: no database, no Prisma, no
 * environment, no HTTP.
 *
 * This is what the `db` parameter on `createContext` is for. The repositories
 * are an interface of contract types, so a fake is an object literal — there is
 * no client to mock, no query builder to stub, and nothing that knows what
 * PostgreSQL is. The database's own behaviour is covered where it belongs, in
 * `packages/db`'s integration suite.
 */

const ADA = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1815-12-10',
  email: null,
  phone: null,
}

const CLINICIAN: Actor = { id: 'user-1', roles: ['clinician'], offices: ['Downtown'] }

function fakeDb(overrides: Partial<Db['patients']> = {}): Db {
  return {
    patients: {
      findById: async () => null,
      listByLastName: async () => [],
      create: async () => {
        throw new Error('not under test')
      },
      ...overrides,
    },
    staffUsers: {
      list: async () => [],
      create: async () => {
        throw new Error('not under test')
      },
      update: async () => null,
      setActive: async () => null,
    },
  }
}

function callerWith(db: Db, actor: Actor | null = CLINICIAN) {
  return appRouter.createCaller(createContext({ actor, db }))
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('patient router', () => {
  it('returns what the repository returns', async () => {
    const caller = callerWith(fakeDb({ findById: async () => ADA }))

    expect(await caller.patient.byId({ id: ADA.id })).toEqual(ADA)
  })

  it('passes the requested id through', async () => {
    const findById = vi.fn(async () => null)
    const caller = callerWith(fakeDb({ findById }))

    await caller.patient.byId({ id: ADA.id })

    expect(findById).toHaveBeenCalledWith(ADA.id)
  })

  it('rejects an id that is not a uuid before reaching the repository', async () => {
    const findById = vi.fn(async () => null)
    const caller = callerWith(fakeDb({ findById }))

    await expect(caller.patient.byId({ id: 'not-a-uuid' })).rejects.toThrow()
    expect(findById).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller without touching the repository', async () => {
    // The property that matters most here: authorization runs before the query,
    // so a refused request never reads a record it was not entitled to.
    const findById = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ findById }), null)

    await expect(caller.patient.byId({ id: ADA.id })).rejects.toThrow('UNAUTHORIZED')
    expect(findById).not.toHaveBeenCalled()
  })

  it('lists through the repository', async () => {
    const caller = callerWith(fakeDb({ listByLastName: async () => [ADA] }))

    expect(await caller.patient.list()).toEqual([ADA])
  })

  it('creates through the repository with the normalized input', async () => {
    const create = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ create }))

    await caller.patient.create({
      firstName: '  Ada ',
      lastName: 'Lovelace',
      dateOfBirth: '1985-12-10',
      email: ' Ada@Example.COM ',
      phone: '(951) 555-0000',
    })

    // The repository sees what the contract emits, not what the wire carried.
    expect(create).toHaveBeenCalledWith({
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1985-12-10',
      email: 'ada@example.com',
      phone: '9515550000',
    })
  })

  it('rejects invalid input before reaching the repository', async () => {
    const create = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ create }))

    await expect(
      caller.patient.create({ firstName: '', lastName: 'Lovelace', dateOfBirth: '2999-01-01' }),
    ).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated create without touching the repository', async () => {
    const create = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ create }), null)

    await expect(
      caller.patient.create({ firstName: 'Ada', lastName: 'Lovelace', dateOfBirth: '1985-12-10' }),
    ).rejects.toThrow('UNAUTHORIZED')
    expect(create).not.toHaveBeenCalled()
  })
})
