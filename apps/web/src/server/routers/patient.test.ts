import type { Db } from '@fastehr/db'
import type { Patient } from '@fastehr/contracts'
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
 *
 * What this file is mostly about since DIA-52: the section split (ADR 28).
 * The repository hands back the whole record; the procedures decide which
 * part of it each role gets, and that decision is what these tests pin.
 */

/** A full stored record, as the repository returns it. */
const ADA: Patient = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1815-12-10',
  gender: 'female',
  language: 'english',
  office: 'Sylmar',
  email: 'ada@example.com',
  phone: '9515550000',
  phoneFollowUpAllowed: true,
  addressStreet: '10 Analytical Way',
  addressCity: 'Pasadena',
  addressState: 'CA',
  addressZip: '91101',
  referralSource: null,
  referredByPatientId: null,
  programType: null,
  heightInches: 64.5,
  medications: [{ name: 'Metformin', dose: '500 mg', frequency: 'twice daily' }],
  historyOther: 'None pertinent.',
  pcpName: 'Dr. Jones',
  pcpAddress: null,
  pcpPhone: null,
  status: 'active',
  lastVisitAt: null,
  creditCardNumber: '4111111111111111',
  creditCardExpMonth: '12',
  creditCardExpYear: '2030',
  creditCardZip: '90210',
}

/** What every role gets from `byId`: the header and the clinical half. */
const ADA_CHART = {
  id: ADA.id,
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1815-12-10',
  office: 'Sylmar',
  lastVisitAt: null,
  heightInches: 64.5,
  medications: ADA.medications,
  historyOther: 'None pertinent.',
  pcpName: 'Dr. Jones',
  pcpAddress: null,
  pcpPhone: null,
}

const ADA_SUMMARY = {
  id: ADA.id,
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1815-12-10',
  office: 'Sylmar',
  lastVisitAt: null,
  phone: '9515550000',
}

/** A full sectioned submission, as the wire carries it (pre-normalization). */
const SUBMITTED = {
  firstName: '  Ada ',
  lastName: 'Lovelace',
  gender: 'female' as const,
  dateOfBirth: '1985-12-10',
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
  programType: '',
  heightFeet: '5',
  heightInchesPart: '4',
  medications: [{ name: 'Metformin', dose: '', frequency: '' }],
  pcpName: '',
  pcpAddress: '',
  pcpPhone: '',
  creditCardNumber: '',
  creditCardExpiry: '',
  creditCardZip: '',
}

/** What the contract emits for SUBMITTED — what a repository must receive. */
const NORMALIZED = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female',
  dateOfBirth: '1985-12-10',
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
  programType: undefined,
  heightInches: 64,
  medications: [{ name: 'Metformin', dose: undefined, frequency: undefined }],
  pcpName: undefined,
  pcpAddress: undefined,
  pcpPhone: undefined,
  creditCardNumber: undefined,
  creditCardExpMonth: undefined,
  creditCardExpYear: undefined,
  creditCardZip: undefined,
}

const PROVIDER: Actor = { id: 'user-1', roles: ['provider'], offices: ['Sylmar'] }
const FRONTDESK: Actor = { id: 'user-2', roles: ['frontdesk'], offices: ['Sylmar'] }
const ADMIN: Actor = { id: 'user-3', roles: ['admin'], offices: ['Sylmar'] }

function fakeDb(overrides: Partial<Db['patients']> = {}): Db {
  return {
    patients: {
      findById: async () => null,
      listRecent: async () => [],
      search: async () => [],
      suggest: async () => [],
      searchByName: async () => [],
      create: async () => {
        throw new Error('not under test')
      },
      updateDemographics: async () => {
        throw new Error('not under test')
      },
      updateClinical: async () => {
        throw new Error('not under test')
      },
      updateBilling: async () => {
        throw new Error('not under test')
      },
      setStatus: async () => {
        throw new Error('not under test')
      },
      ...overrides,
    },
    staffUsers: {
      list: async () => [],
      search: async () => [],
      create: async () => {
        throw new Error('not under test')
      },
      update: async () => null,
      setActive: async () => null,
      delete: async () => null,
    },
    intakes: {
      create: async () => {
        throw new Error('not under test')
      },
      findById: async () => null,
      findByTokenHash: async () => null,
      submit: async () => null,
      listPending: async () => [],
      accept: async () => null,
      reject: async () => null,
    },
    reviews: {
      lastRun: async () => null,
      listEligible: async () => [],
      recordSample: async () => {
        throw new Error('not under test')
      },
      listQueue: async () => [],
      findNote: async () => null,
      signOff: async () => null,
    },
  }
}

function callerWith(db: Db, actor: Actor | null = PROVIDER) {
  return appRouter.createCaller(createContext({ actor, db }))
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('patient router: reads by section (ADR 28)', () => {
  it('byId returns the chart — header and the Medical tab — to every role', async () => {
    const db = fakeDb({ findById: async () => ADA })

    for (const actor of [PROVIDER, FRONTDESK, ADMIN]) {
      const chart = await callerWith(db, actor).patient.byId({ id: ADA.id })
      expect(chart).toEqual(ADA_CHART)
      // The Patient Info and Billing columns never ride along, whoever asks.
      expect(chart).not.toHaveProperty('phone')
      expect(chart).not.toHaveProperty('email')
      expect(chart).not.toHaveProperty('creditCardNumber')
      expect(chart).not.toHaveProperty('healthyWeight')
    }
  })

  it('serves every tab to an admin, each from its own procedure', async () => {
    const db = fakeDb({ findById: async () => ADA })
    const caller = callerWith(db, ADMIN)

    expect(await caller.patient.byId({ id: ADA.id })).toEqual(ADA_CHART)
    expect(await caller.patient.demographics({ id: ADA.id })).toMatchObject({ phone: '9515550000' })
    expect(await caller.patient.billing({ id: ADA.id })).toEqual({
      creditCardNumber: '4111111111111111',
      creditCardExpMonth: '12',
      creditCardExpYear: '2030',
      creditCardZip: '90210',
    })
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

  it('serves demographics and billing to the clerical roles only', async () => {
    const findById = vi.fn(async () => ADA)
    const db = fakeDb({ findById })

    expect(await callerWith(db, FRONTDESK).patient.demographics({ id: ADA.id })).toEqual({
      gender: 'female',
      language: 'english',
      office: 'Sylmar',
      email: 'ada@example.com',
      phone: '9515550000',
      phoneFollowUpAllowed: true,
      addressStreet: '10 Analytical Way',
      addressCity: 'Pasadena',
      addressState: 'CA',
      addressZip: '91101',
      referralSource: null,
      referredByPatientId: null,
      programType: null,
    })
    expect(await callerWith(db, ADMIN).patient.billing({ id: ADA.id })).toEqual({
      creditCardNumber: '4111111111111111',
      creditCardExpMonth: '12',
      creditCardExpYear: '2030',
      creditCardZip: '90210',
    })

    // A provider is refused before the repository is read: the record never
    // leaves the database for a caller who may not see it. FORBIDDEN is what
    // the HTTP layer sends as 403.
    findById.mockClear()
    await expect(callerWith(db, PROVIDER).patient.demographics({ id: ADA.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(callerWith(db, PROVIDER).patient.billing({ id: ADA.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(findById).not.toHaveBeenCalled()
  })

  it('redacts the roster phone for a provider, server-side', async () => {
    const db = fakeDb({
      listRecent: async () => [ADA_SUMMARY],
      search: async () => [ADA_SUMMARY],
      suggest: async () => [ADA_SUMMARY],
      searchByName: async () => [ADA_SUMMARY],
    })

    expect(await callerWith(db, FRONTDESK).patient.recent()).toEqual([ADA_SUMMARY])
    expect(await callerWith(db, PROVIDER).patient.recent()).toEqual([{ ...ADA_SUMMARY, phone: null }])
    expect(await callerWith(db, PROVIDER).patient.search({ query: 'lo' })).toEqual([{ ...ADA_SUMMARY, phone: null }])
    expect(await callerWith(db, PROVIDER).patient.suggest({ query: 'lo' })).toEqual([{ ...ADA_SUMMARY, phone: null }])
    expect(await callerWith(db, PROVIDER).patient.searchByName({ name: 'Love' })).toEqual([
      { ...ADA_SUMMARY, phone: null },
    ])
  })

  it('has no unfiltered list — only the capped recent view and searches', () => {
    const paths = Object.keys(appRouter._def.procedures)
    expect(paths).toContain('patient.recent')
    expect(paths).not.toContain('patient.list')
  })

  it('searches with the query interpreted by format', async () => {
    const search = vi.fn(async () => [ADA_SUMMARY])
    const caller = callerWith(fakeDb({ search }))

    await caller.patient.search({ query: '(951) 555-0000' })

    expect(search).toHaveBeenCalledWith({ query: { kind: 'phone', phone: '9515550000' } })
  })

  it('refuses an empty or uninterpretable search before reaching the repository', async () => {
    const search = vi.fn(async () => [ADA_SUMMARY])
    const caller = callerWith(fakeDb({ search }))

    await expect(caller.patient.search({ query: '', dateOfBirth: '', serviceDate: '' })).rejects.toThrow()
    await expect(caller.patient.search({ query: '951555' })).rejects.toThrow()
    expect(search).not.toHaveBeenCalled()
  })
})

describe('patient router: writes by section (ADR 28)', () => {
  it('creates through the repository with the normalized input, for the clerical roles', async () => {
    const create = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ create }), FRONTDESK)

    // The chart comes back — a created record's clerical half is not echoed.
    expect(await caller.patient.create(SUBMITTED)).toEqual(ADA_CHART)
    // The repository sees what the contract emits, not what the wire carried.
    expect(create).toHaveBeenCalledWith(NORMALIZED)
  })

  it('refuses a provider creating a record, before the repository', async () => {
    const create = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ create }), PROVIDER)

    await expect(caller.patient.create(SUBMITTED)).rejects.toThrow('FORBIDDEN')
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects invalid input before reaching the repository', async () => {
    const create = vi.fn(async () => ADA)
    const caller = callerWith(fakeDb({ create }), FRONTDESK)

    await expect(
      caller.patient.create({ ...SUBMITTED, firstName: '', dateOfBirth: '2999-01-01' }),
    ).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
  })

  it('lets every role save the clinical section, with feet and inches composed', async () => {
    const updateClinical = vi.fn(async () => ADA)

    for (const actor of [PROVIDER, FRONTDESK, ADMIN]) {
      const caller = callerWith(fakeDb({ updateClinical }), actor)
      expect(await caller.patient.updateClinical({ ...SUBMITTED, id: ADA.id })).toEqual(ADA_CHART)
    }
    expect(updateClinical).toHaveBeenLastCalledWith({
      id: ADA.id,
      heightInches: 64,
      medications: NORMALIZED.medications,
      pcpName: undefined,
      pcpAddress: undefined,
      pcpPhone: undefined,
    })
  })

  it('strips the history text from a clinical save — it is read-only', async () => {
    const updateClinical = vi.fn<Db['patients']['updateClinical']>(async () => ADA)
    const caller = callerWith(fakeDb({ updateClinical }), PROVIDER)

    // The wire can carry anything; the contract decides what reaches the repository.
    const tampered = { ...SUBMITTED, id: ADA.id, historyOther: 'rewritten' } as typeof SUBMITTED & { id: string }
    await caller.patient.updateClinical(tampered)

    expect(updateClinical.mock.calls[0]?.[0]).not.toHaveProperty('historyOther')
  })

  it('keeps demographics and billing writes clerical', async () => {
    const updateDemographics = vi.fn(async () => ADA)
    const updateBilling = vi.fn(async () => ADA)
    const db = fakeDb({ updateDemographics, updateBilling })

    await expect(
      callerWith(db, PROVIDER).patient.updateDemographics({ ...SUBMITTED, id: ADA.id }),
    ).rejects.toThrow('FORBIDDEN')
    await expect(callerWith(db, PROVIDER).patient.updateBilling({ ...SUBMITTED, id: ADA.id })).rejects.toThrow(
      'FORBIDDEN',
    )
    expect(updateDemographics).not.toHaveBeenCalled()
    expect(updateBilling).not.toHaveBeenCalled()

    expect(await callerWith(db, FRONTDESK).patient.updateDemographics({ ...SUBMITTED, id: ADA.id })).toEqual(
      ADA_CHART,
    )
    // Only the section's own fields reach the repository.
    expect(updateDemographics).toHaveBeenCalledWith({
      id: ADA.id,
      firstName: 'Ada',
      lastName: 'Lovelace',
      gender: 'female',
      dateOfBirth: '1985-12-10',
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
      programType: undefined,
    })
    expect(await callerWith(db, ADMIN).patient.updateBilling({ ...SUBMITTED, id: ADA.id })).toEqual(ADA_CHART)
  })

  it('surfaces an unknown record as NOT_FOUND on every section update', async () => {
    const db = fakeDb({
      updateDemographics: async () => null,
      updateClinical: async () => null,
      updateBilling: async () => null,
    })
    const caller = callerWith(db, ADMIN)

    await expect(caller.patient.updateClinical({ ...SUBMITTED, id: ADA.id })).rejects.toThrow('NOT_FOUND')
    await expect(caller.patient.updateDemographics({ ...SUBMITTED, id: ADA.id })).rejects.toThrow('NOT_FOUND')
    await expect(caller.patient.updateBilling({ ...SUBMITTED, id: ADA.id })).rejects.toThrow('NOT_FOUND')
  })

  it('sets status through the repository', async () => {
    const setStatus = vi.fn(async () => ({ ...ADA, status: 'inactive' as const }))
    const caller = callerWith(fakeDb({ setStatus }))

    expect(await caller.patient.setStatus({ id: ADA.id, status: 'inactive' })).toEqual(ADA_CHART)
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
