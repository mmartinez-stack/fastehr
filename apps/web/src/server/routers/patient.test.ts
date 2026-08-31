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
  gender: null,
  heightInches: null,
  healthyWeight: null,
  language: null,
  office: null,
  email: null,
  phone: null,
  phoneFollowUpAllowed: true,
  addressStreet: null,
  addressCity: null,
  addressState: null,
  addressZip: null,
  referralSource: null,
  referredByPatientId: null,
  historyNotes: null,
  programType: null,
  status: 'active' as const,
}

/** A full legacy-form submission, as the wire carries it (pre-normalization). */
const SUBMITTED = {
  firstName: '  Ada ',
  lastName: 'Lovelace',
  gender: 'female' as const,
  heightInches: '64',
  dateOfBirth: '1985-12-10',
  healthyWeight: '',
  language: '',
  office: 'Sylmar',
  email: ' Ada@Example.COM ',
  addressStreet: '10 Analytical Way',
  addressCity: 'Pasadena',
  addressState: 'ca',
  addressZip: '91101',
  phone: '(951) 555-0000',
  phoneFollowUpAllowed: true,
  referralSource: '',
  referredByPatientId: '',
  historyNotes: '',
  programType: '',
}

/** What the contract emits for SUBMITTED — what a repository must receive. */
const NORMALIZED = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female',
  heightInches: 64,
  dateOfBirth: '1985-12-10',
  healthyWeight: undefined,
  language: undefined,
  office: 'Sylmar',
  email: 'ada@example.com',
  addressStreet: '10 Analytical Way',
  addressCity: 'Pasadena',
  addressState: 'CA',
  addressZip: '91101',
  phone: '9515550000',
  phoneFollowUpAllowed: true,
  referralSource: undefined,
  referredByPatientId: undefined,
  historyNotes: undefined,
  programType: undefined,
}

const CLINICIAN: Actor = { id: 'user-1', roles: ['clinician'], offices: ['Downtown'] }

function fakeDb(overrides: Partial<Db['patients']> = {}): Db {
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

  it('lists recent through the repository', async () => {
    const caller = callerWith(fakeDb({ listRecent: async () => [ADA] }))

    expect(await caller.patient.recent()).toEqual([ADA])
  })

  it('searches with normalized filters', async () => {
    const search = vi.fn(async () => [ADA])
    const caller = callerWith(fakeDb({ search }))

    await caller.patient.search({ lastName: ' Lovelace ', phone: '(951) 555-0000', firstName: '', dateOfBirth: '' })

    expect(search).toHaveBeenCalledWith({
      firstName: undefined,
      lastName: 'Lovelace',
      dateOfBirth: undefined,
      phone: '9515550000',
    })
  })

  it('rejects a one-character name filter before reaching the repository', async () => {
    const search = vi.fn(async () => [])
    const caller = callerWith(fakeDb({ search }))

    await expect(caller.patient.search({ lastName: 'L' })).rejects.toThrow()
    expect(search).not.toHaveBeenCalled()
  })

  it('searches by name for the referred-by picker', async () => {
    const searchByName = vi.fn(async () => [ADA])
    const caller = callerWith(fakeDb({ searchByName }))

    expect(await caller.patient.searchByName({ name: 'Love' })).toEqual([ADA])
    expect(searchByName).toHaveBeenCalledWith({ name: 'Love' })
  })

  it('creates through the repository with the normalized input', async () => {
    const create = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ create }))

    await caller.patient.create(SUBMITTED)

    // The repository sees what the contract emits, not what the wire carried.
    expect(create).toHaveBeenCalledWith(NORMALIZED)
  })

  it('rejects invalid input before reaching the repository', async () => {
    const create = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ create }))

    await expect(
      caller.patient.create({ ...SUBMITTED, firstName: '', dateOfBirth: '2999-01-01' }),
    ).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated create without touching the repository', async () => {
    const create = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ create }), null)

    await expect(caller.patient.create(SUBMITTED)).rejects.toThrow('UNAUTHORIZED')
    expect(create).not.toHaveBeenCalled()
  })

  it('updates through the repository with the normalized input and id', async () => {
    const update = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ update }))

    await caller.patient.update({ ...SUBMITTED, id: ADA.id })

    expect(update).toHaveBeenCalledWith({ ...NORMALIZED, id: ADA.id })
  })

  it('sets status through the repository', async () => {
    const setStatus = vi.fn(async () => ({ ...ADA, status: 'inactive' as const }))
    const caller = callerWith(fakeDb({ setStatus }))

    expect((await caller.patient.setStatus({ id: ADA.id, status: 'inactive' })).status).toBe('inactive')
    expect(setStatus).toHaveBeenCalledWith({ id: ADA.id, status: 'inactive' })
  })

  it('rejects a status outside the vocabulary before reaching the repository', async () => {
    const setStatus = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ setStatus }))

    // @ts-expect-error — the wire can carry anything; the contract refuses it.
    await expect(caller.patient.setStatus({ id: ADA.id, status: 'archived' })).rejects.toThrow()
    expect(setStatus).not.toHaveBeenCalled()
  })
})
