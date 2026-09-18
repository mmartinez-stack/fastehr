import type { Db } from '@fastehr/db'
import type { ReviewNote, ReviewQueueItem, ReviewSampleRun } from '@fastehr/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createContext, type Actor } from '../context.ts'
import { runReviewSample } from '../review-sampling.ts'
import { appRouter } from './root.ts'

/**
 * The review procedures and the sampling run, with fake repositories. What
 * is pinned: the role gate (the queue is the medical director's; an admin,
 * a provider, and the front desk are refused), the run's window arithmetic
 * (starts where the last run ended, never re-samples), and the "five
 * percent, minimum one" through the real sampler.
 */

const ITEM: ReviewQueueItem = {
  visitId: '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d',
  patient: { id: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81', firstName: 'Ada', lastName: 'Lovelace', dateOfBirth: '1815-12-10' },
  dateOfService: '2026-08-20T18:00:00.000Z',
  office: 'Sylmar',
  signedByName: 'Dr Penn',
  signedAt: '2026-08-20T18:30:00.000Z',
  sampledAt: '2026-09-01T06:00:00.000Z',
}

const NOTE: ReviewNote = {
  ...ITEM,
  notes: 'Lost 4 lbs. Continue current dose.',
  reviewedById: null,
  reviewedByName: null,
  reviewComments: null,
  reviewedAt: null,
}

const RUN: ReviewSampleRun = {
  id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  ranAt: '2026-08-25T06:00:00.000Z',
  windowStart: '2026-08-18T06:00:00.000Z',
  windowEnd: '2026-08-25T06:00:00.000Z',
  eligibleCount: 40,
  sampledCount: 2,
  rate: 20,
}

const DIRECTOR: Actor = { id: 'dr-penn', roles: ['medical_director'], locations: ['sylmar'] }
const PROVIDER: Actor = { id: 'dr-other', roles: ['provider'], locations: ['sylmar'] }
const FRONTDESK: Actor = { id: 'desk-1', roles: ['frontdesk'], locations: ['sylmar'] }
const ADMIN: Actor = { id: 'admin-1', roles: ['admin'], locations: ['sylmar'] }

function fakeDb(overrides: Partial<Db['reviews']> = {}): Db {
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
      recordSample: async (input) => ({
        ...RUN,
        windowStart: input.windowStart.toISOString(),
        windowEnd: input.windowEnd.toISOString(),
        eligibleCount: input.eligibleCount,
        sampledCount: input.visitIds.length,
        rate: input.rate,
      }),
      listQueue: async () => [],
      findNote: async () => null,
      signOff: async () => null,
      ...overrides,
    },
    locations: {
      list: async () => [],
      listActive: async () => [],
    },
    queue: {
      arrive: async () => {
        throw new Error('not under test')
      },
      room: async () => null,
      remove: async () => null,
      startFromRecordWrite: async () => 0,
      listWaiting: async () => [],
    },
  }
}

function callerWith(db: Db, actor: Actor | null) {
  return appRouter.createCaller(createContext({ actor, db }))
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the review queue is the medical director’s', () => {
  it('serves the queue and a note to the medical director role', async () => {
    const db = fakeDb({ listQueue: async () => [ITEM], findNote: async () => NOTE })

    expect(await callerWith(db, DIRECTOR).review.queue()).toEqual([ITEM])
    expect(await callerWith(db, DIRECTOR).review.note({ visitId: ITEM.visitId })).toEqual(NOTE)
  })

  it('refuses admin, provider, and front desk with FORBIDDEN, before the repository', async () => {
    const listQueue = vi.fn(async () => [ITEM])
    const db = fakeDb({ listQueue })

    for (const actor of [ADMIN, PROVIDER, FRONTDESK]) {
      await expect(callerWith(db, actor).review.queue()).rejects.toMatchObject({ code: 'FORBIDDEN' })
      await expect(callerWith(db, actor).review.note({ visitId: ITEM.visitId })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    }
    await expect(callerWith(db, null).review.queue()).rejects.toThrow('UNAUTHORIZED')
    expect(listQueue).not.toHaveBeenCalled()
  })

  it('reports a note outside the queue as NOT_FOUND', async () => {
    await expect(callerWith(fakeDb(), DIRECTOR).review.note({ visitId: ITEM.visitId })).rejects.toThrow('NOT_FOUND')
  })

  it('signs off with the reviewer’s id and trimmed comments, blank comments absent', async () => {
    const signOff = vi.fn<Db['reviews']['signOff']>(async () => ({
      ...NOTE,
      reviewedById: DIRECTOR.id,
      reviewedByName: 'Dr Penn',
      reviewComments: 'Agree with plan.',
      reviewedAt: '2026-09-02T17:00:00.000Z',
    }))
    const caller = callerWith(fakeDb({ signOff }), DIRECTOR)

    const reviewed = await caller.review.signOff({ visitId: ITEM.visitId, comments: '  Agree with plan.  ' })
    expect(reviewed.reviewedById).toBe(DIRECTOR.id)
    expect(signOff).toHaveBeenCalledWith({ visitId: ITEM.visitId, reviewerId: DIRECTOR.id, comments: 'Agree with plan.' })

    await caller.review.signOff({ visitId: ITEM.visitId, comments: '   ' })
    expect(signOff).toHaveBeenLastCalledWith({ visitId: ITEM.visitId, reviewerId: DIRECTOR.id, comments: undefined })
  })

  it('refuses a second sign-off as PRECONDITION_FAILED', async () => {
    await expect(
      callerWith(fakeDb({ signOff: async () => null }), DIRECTOR).review.signOff({ visitId: ITEM.visitId }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })
})

describe('the sampling run', () => {
  const ids = Array.from({ length: 40 }, (_, i) => `visit-${i}`)

  it('starts where the last run ended, samples one in twenty, and records the run', async () => {
    const listEligible = vi.fn<Db['reviews']['listEligible']>(async () => ids)
    const recordSample = vi.fn<Db['reviews']['recordSample']>(async (input) => ({
      ...RUN,
      sampledCount: input.visitIds.length,
      eligibleCount: input.eligibleCount,
    }))
    const db = fakeDb({ lastRun: async () => RUN, listEligible, recordSample })
    const now = new Date('2026-09-01T06:00:00.000Z')

    const run = await runReviewSample(db, { triggeredById: null, now, random: () => 0.5 })

    expect(listEligible).toHaveBeenCalledWith({ from: new Date(RUN.windowEnd), to: now })
    const recorded = recordSample.mock.calls[0]?.[0]
    if (recorded === undefined) throw new Error('expected the run to be recorded')
    expect(recorded.visitIds).toHaveLength(2)
    expect(recorded.eligibleCount).toBe(40)
    expect(recorded.rate).toBe(20)
    expect(recorded.windowStart).toEqual(new Date(RUN.windowEnd))
    expect(recorded.windowEnd).toEqual(now)
    expect(recorded.triggeredById).toBeNull()
    expect(run.sampledCount).toBe(2)
  })

  it('looks back a week on the very first run, and samples at least one', async () => {
    const listEligible = vi.fn<Db['reviews']['listEligible']>(async () => ['only-one'])
    const recordSample = vi.fn<Db['reviews']['recordSample']>(async () => RUN)
    const now = new Date('2026-09-01T06:00:00.000Z')

    await runReviewSample(fakeDb({ listEligible, recordSample }), { triggeredById: null, now })

    expect(listEligible).toHaveBeenCalledWith({ from: new Date('2026-08-25T06:00:00.000Z'), to: now })
    expect(recordSample.mock.calls[0]?.[0]?.visitIds).toEqual(['only-one'])
  })

  it('records an empty run when nothing was signed, so the window still advances', async () => {
    const recordSample = vi.fn<Db['reviews']['recordSample']>(async () => ({ ...RUN, sampledCount: 0, eligibleCount: 0 }))

    const run = await runReviewSample(fakeDb({ recordSample }), { triggeredById: null })

    expect(recordSample.mock.calls[0]?.[0]?.visitIds).toEqual([])
    expect(run.sampledCount).toBe(0)
  })

  it('runs on demand for the staff surface, with the rate and window overridable', async () => {
    const recordSample = vi.fn<Db['reviews']['recordSample']>(async (input) => ({
      ...RUN,
      rate: input.rate,
      windowStart: input.windowStart.toISOString(),
    }))
    const listEligible = vi.fn<Db['reviews']['listEligible']>(async () => ids)
    const db = fakeDb({ lastRun: async () => RUN, listEligible, recordSample })

    const run = await callerWith(db, ADMIN).review.runSample({ rate: 10, windowStart: '2026-08-01' })

    expect(run.rate).toBe(10)
    expect(recordSample.mock.calls[0]?.[0]?.visitIds).toHaveLength(4)
    expect(recordSample.mock.calls[0]?.[0]?.windowStart).toEqual(new Date('2026-08-01'))
    expect(recordSample.mock.calls[0]?.[0]?.triggeredById).toBe(ADMIN.id)

    // The medical director has the administrator's access, so the run too.
    await expect(callerWith(db, DIRECTOR).review.runSample({})).resolves.toBeDefined()
    await expect(callerWith(db, PROVIDER).review.runSample({})).rejects.toThrow('FORBIDDEN')
  })
})
