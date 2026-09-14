import type { Db } from '@fastehr/db'
import { INTAKE_CONSENT_VERSION, type IntakeRequest, type IntakeSubmission, type Patient } from '@fastehr/contracts'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createContext, type Actor } from '../context.ts'
import type { SmsOutcome, SmsTransport } from '../sms.ts'
import { appRouter } from './root.ts'

/**
 * The intake procedures with fake repositories and a fake SMS transport: no
 * database, no Twilio, no environment. What is pinned here is the token
 * discipline (ADR 29) — the text carries the token, the repository gets its
 * hash, and the public procedures accept exactly one use before expiry —
 * and the role split around the queue.
 */

const SUBMISSION: IntakeSubmission = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female',
  dateOfBirth: '1985-12-10',
  language: 'english',
  office: 'PennProgram',
  addressStreet: '10 Analytical Way',
  addressCity: 'Pasadena',
  addressState: 'CA',
  addressZip: '91101',
  phone: '9515550000',
  phoneFollowUpAllowed: true,
  preferredContactTime: 'morning',
  heightInches: 64,
  medications: [],
  conditions: [],
}

const REQUEST: IntakeRequest = {
  id: '5d3f2a1c-7b8e-4f90-a1b2-c3d4e5f60718',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: '9515550000',
  language: 'english',
  status: 'sent',
  office: null,
  locationId: null,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  submittedAt: null,
  createdAt: new Date().toISOString(),
  patientId: null,
  submission: null,
  consent: null,
}

const SUBMITTED: IntakeRequest = {
  ...REQUEST,
  status: 'submitted',
  office: 'PennProgram',
  locationId: 'kanoga',
  submittedAt: new Date().toISOString(),
  submission: SUBMISSION,
  consent: {
    signature: 'Ada Lovelace',
    signedAt: new Date().toISOString(),
    version: INTAKE_CONSENT_VERSION,
    language: 'english',
  },
}

const PATIENT: Patient = {
  id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1985-12-10',
  gender: 'female',
  language: 'english',
  office: 'PennProgram',
  email: null,
  phone: '9515550000',
  phoneFollowUpAllowed: true,
  addressStreet: '10 Analytical Way',
  addressCity: 'Pasadena',
  addressState: 'CA',
  addressZip: '91101',
  referralSource: null,
  referredByPatientId: null,
  programType: null,
  heightInches: 64,
  medications: [],
  conditions: [],
  historyOther: null,
  pcpName: null,
  pcpAddress: null,
  pcpPhone: null,
  status: 'active',
  lastVisitAt: null,
  creditCardNumber: null,
  creditCardExpMonth: null,
  creditCardExpYear: null,
  creditCardZip: null,
}

/** What the person's phone submits: the raw form plus the token. */
const FORM = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female' as const,
  dateOfBirth: '1985-12-10',
  language: 'english',
  office: 'PennProgram' as const,
  email: '',
  addressStreet: '10 Analytical Way',
  addressCity: 'Pasadena',
  addressState: 'ca',
  addressZip: '91101',
  phone: '(951) 555-0000',
  phoneFollowUpAllowed: true,
  preferredContactTime: 'morning' as const,
  referralSource: '',
  referredByPatientId: '',
  programType: '',
  heightFeet: '5',
  heightInchesPart: '4',
  medications: [],
  conditions: [],
  pcpName: '',
  pcpAddress: '',
  pcpPhone: '',
  consentAcknowledged: true as const,
  consentVersion: INTAKE_CONSENT_VERSION,
  consentSignature: 'Ada Lovelace',
}

const FRONTDESK: Actor = { id: 'user-2', roles: ['frontdesk'], locations: ['sylmar', 'kanoga'] }
const PROVIDER: Actor = { id: 'user-1', roles: ['provider'], locations: ['sylmar', 'kanoga'] }
const ELSEWHERE: Actor = { id: 'user-4', roles: ['frontdesk'], locations: ['sylmar'] }

function fakeDb(overrides: Partial<Db['intakes']> = {}): Db {
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
      updateDemographics: async () => null,
      updateClinical: async () => null,
      updateBilling: async () => null,
      setStatus: async () => {
        throw new Error('not under test')
      },
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
      create: async () => REQUEST,
      findById: async () => null,
      findByTokenHash: async () => null,
      submit: async () => null,
      listPending: async () => [],
      accept: async () => null,
      reject: async () => null,
      ...overrides,
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
    locations: {
      list: async () => [],
      listActive: async () => [],
    },
  }
}

/** A transport that records what it was given and answers as told: a carrier, or the console. */
function fakeSms(outcome: SmsOutcome = 'delivered'): SmsTransport & { sent: { to: string; body: string }[] } {
  const sent: { to: string; body: string }[] = []
  return {
    sent,
    async send(message) {
      sent.push(message)
      return outcome
    },
  }
}

function callerWith(db: Db, actor: Actor | null, sms: SmsTransport = fakeSms()) {
  return appRouter.createCaller(
    createContext({ actor, db, sms, appBaseUrl: () => 'https://dev.example.com/' }),
  )
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('intake.send', () => {
  it('texts a link whose token hashes to what the repository stored, and never returns the token', async () => {
    const create = vi.fn<Db['intakes']['create']>(async () => REQUEST)
    const sms = fakeSms()
    const caller = callerWith(fakeDb({ create }), FRONTDESK, sms)

    const result = await caller.intake.send({
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '(951) 555-0000',
      language: 'spanish',
    })

    expect(result).toEqual({ request: REQUEST, link: null })
    expect(sms.sent).toHaveLength(1)
    const [message] = sms.sent
    expect(message?.to).toBe('9515550000')
    expect(message?.body).toContain('Hola Ada')
    expect(message?.body).toContain('48 horas')
    const link = /https:\/\/dev\.example\.com\/intake\/([A-Za-z0-9_-]+)/.exec(message?.body ?? '')
    expect(link).not.toBeNull()
    const token = link?.[1] ?? ''
    expect(token.length).toBeGreaterThanOrEqual(40)

    const stored = create.mock.calls[0]?.[0]
    if (stored === undefined) throw new Error('expected the repository to be called')
    expect(stored.tokenHash).toBe(sha256(token))
    expect(stored.createdById).toBe(FRONTDESK.id)
    // Forty-eight hours, give or take the test's own runtime.
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(47.9 * 3_600_000)
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThan(48.1 * 3_600_000)
    expect(JSON.stringify(result)).not.toContain(token)
  })

  it('hands the link back only when the message was logged rather than delivered', async () => {
    const sms = fakeSms('logged')
    const caller = callerWith(fakeDb(), FRONTDESK, sms)

    const result = await caller.intake.send({ firstName: 'Ada', lastName: 'Lovelace', phone: '9515550000' })

    expect(result.link).toMatch(/^https:\/\/dev\.example\.com\/intake\/[A-Za-z0-9_-]{40,}$/)
    expect(sms.sent[0]?.body).toContain(result.link)
    expect(sms.sent[0]?.body).toContain('48 hours')
  })

  it('is clerical: a provider cannot send, and nothing is texted', async () => {
    const sms = fakeSms()
    const caller = callerWith(fakeDb(), PROVIDER, sms)

    await expect(
      caller.intake.send({ firstName: 'Ada', lastName: 'Lovelace', phone: '9515550000' }),
    ).rejects.toThrow('FORBIDDEN')
    expect(sms.sent).toHaveLength(0)
  })
})

describe('intake.open and intake.submit (public, token-bound)', () => {
  const token = 'a'.repeat(43)

  it('opens a sent, unexpired request by its token hash and returns only the invite', async () => {
    const findByTokenHash = vi.fn(async () => REQUEST)
    const caller = callerWith(fakeDb({ findByTokenHash }), null)

    const invite = await caller.intake.open({ token })

    expect(findByTokenHash).toHaveBeenCalledWith(sha256(token))
    expect(invite).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      language: 'english',
      expiresAt: REQUEST.expiresAt,
      locations: [],
    })
    expect(invite).not.toHaveProperty('phone')
    expect(invite).not.toHaveProperty('id')
  })

  it('refuses an unknown, used, or expired token identically', async () => {
    await expect(callerWith(fakeDb(), null).intake.open({ token })).rejects.toThrow('NOT_FOUND')
    await expect(
      callerWith(fakeDb({ findByTokenHash: async () => SUBMITTED }), null).intake.open({ token }),
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      callerWith(
        fakeDb({
          findByTokenHash: async () => ({ ...REQUEST, expiresAt: new Date(Date.now() - 1000).toISOString() }),
        }),
        null,
      ).intake.open({ token }),
    ).rejects.toThrow('NOT_FOUND')
    await expect(callerWith(fakeDb(), null).intake.open({ token: 'short' })).rejects.toThrow()
  })

  it('submits the normalized form against the token hash, once', async () => {
    const submit = vi.fn(async () => SUBMITTED)
    const caller = callerWith(fakeDb({ findByTokenHash: async () => REQUEST, submit }), null)

    expect(await caller.intake.submit({ ...FORM, token })).toEqual({ status: 'submitted' })
    expect(submit).toHaveBeenCalledWith({
      tokenHash: sha256(token),
      submission: SUBMISSION,
      consent: { signature: 'Ada Lovelace', version: INTAKE_CONSENT_VERSION, language: 'english' },
    })
    // The token never reaches the repository as itself.
    expect(JSON.stringify(submit.mock.calls)).not.toContain(token)

    // A second submit that raced past the status check finds the row moved.
    const second = callerWith(fakeDb({ findByTokenHash: async () => REQUEST, submit: async () => null }), null)
    await expect(second.intake.submit({ ...FORM, token })).rejects.toThrow('NOT_FOUND')
  })

  it('requires the office, and validates the rest as the staff form would', async () => {
    const submit = vi.fn(async () => SUBMITTED)
    const caller = callerWith(fakeDb({ findByTokenHash: async () => REQUEST, submit }), null)

    await expect(caller.intake.submit({ ...FORM, token, office: '' as 'Sylmar' })).rejects.toThrow()
    await expect(caller.intake.submit({ ...FORM, token, phone: '555' })).rejects.toThrow()
    expect(submit).not.toHaveBeenCalled()
  })

  it('requires the consent: acknowledged, current, and signed with the person’s name', async () => {
    const submit = vi.fn<Db['intakes']['submit']>(async () => SUBMITTED)
    const caller = callerWith(fakeDb({ findByTokenHash: async () => REQUEST, submit }), null)

    await expect(caller.intake.submit({ ...FORM, token, consentAcknowledged: false as true })).rejects.toThrow()
    await expect(caller.intake.submit({ ...FORM, token, consentSignature: 'A. Lovelace' })).rejects.toThrow()
    await expect(
      caller.intake.submit({ ...FORM, token, consentVersion: 'older' as typeof INTAKE_CONSENT_VERSION }),
    ).rejects.toThrow()
    expect(submit).not.toHaveBeenCalled()

    // The consent is recorded in the language the form was filled in.
    await caller.intake.submit({ ...FORM, token, language: 'spanish' })
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ consent: { language: 'spanish' } })
  })
})

describe('the pending queue', () => {
  it('lists a clinic the actor holds, or all clinics, for clerical roles only', async () => {
    const listPending = vi.fn(async () => [SUBMITTED])
    const db = fakeDb({ listPending })

    expect(await callerWith(db, FRONTDESK).intake.listPending({ location: 'kanoga' })).toEqual([SUBMITTED])
    expect(listPending).toHaveBeenCalledWith('kanoga')
    expect(await callerWith(db, ELSEWHERE).intake.listPending({ location: 'all' })).toEqual([SUBMITTED])
    expect(listPending).toHaveBeenLastCalledWith('all')

    await expect(callerWith(db, PROVIDER).intake.listPending({ location: 'kanoga' })).rejects.toThrow('FORBIDDEN')
    await expect(callerWith(db, ELSEWHERE).intake.listPending({ location: 'kanoga' })).rejects.toThrow('FORBIDDEN')
    // @ts-expect-error — the contract is a union of slugs; this is the runtime guard.
    await expect(callerWith(db, FRONTDESK).intake.listPending({ location: 'fresno' })).rejects.toThrow()
  })

  it('serves a request by id within the actor’s clinics', async () => {
    const db = fakeDb({ findById: async () => SUBMITTED })

    expect(await callerWith(db, FRONTDESK).intake.byId({ id: SUBMITTED.id })).toEqual(SUBMITTED)
    await expect(callerWith(db, ELSEWHERE).intake.byId({ id: SUBMITTED.id })).rejects.toThrow('FORBIDDEN')
    await expect(callerWith(db, PROVIDER).intake.byId({ id: SUBMITTED.id })).rejects.toThrow('FORBIDDEN')
    await expect(callerWith(fakeDb(), FRONTDESK).intake.byId({ id: SUBMITTED.id })).rejects.toThrow('NOT_FOUND')
  })

  it('accepts the reviewed form into a patient record and returns the chart', async () => {
    const accept = vi.fn<Db['intakes']['accept']>(async () => ({
      request: { ...SUBMITTED, status: 'accepted' as const },
      patient: PATIENT,
    }))
    const caller = callerWith(fakeDb({ accept }), FRONTDESK)

    const chart = await caller.intake.accept({ ...FORM, id: SUBMITTED.id, lastName: 'Lovelace-King' })

    expect(chart).toMatchObject({ id: PATIENT.id, firstName: 'Ada' })
    expect(chart).not.toHaveProperty('phone')
    const call = accept.mock.calls[0]?.[0]
    if (call === undefined) throw new Error('expected the repository to be called')
    expect(call.id).toBe(SUBMITTED.id)
    expect(call.patient.lastName).toBe('Lovelace-King') // the reviewer's edit wins
    expect(call.patient.creditCardNumber).toBeUndefined()
    expect(call.reviewedById).toBe(FRONTDESK.id)
  })

  it('refuses accept and reject on a request that is no longer pending', async () => {
    const caller = callerWith(fakeDb({ accept: async () => null, reject: async () => null }), FRONTDESK)

    await expect(caller.intake.accept({ ...FORM, id: SUBMITTED.id })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    await expect(caller.intake.reject({ id: SUBMITTED.id })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })

  it('rejects for clerical roles only', async () => {
    const reject = vi.fn(async () => ({ ...SUBMITTED, status: 'rejected' as const }))
    const db = fakeDb({ reject })

    expect((await callerWith(db, FRONTDESK).intake.reject({ id: SUBMITTED.id })).status).toBe('rejected')
    expect(reject).toHaveBeenCalledWith({ id: SUBMITTED.id, reviewedById: FRONTDESK.id })
    await expect(callerWith(db, PROVIDER).intake.reject({ id: SUBMITTED.id })).rejects.toThrow('FORBIDDEN')
  })
})
