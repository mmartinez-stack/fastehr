import { ROLE_ACCESS, ROLE_SURFACES, STAFF_ROLES, type RoleSurface } from '@fastehr/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createContext } from './context.ts'
import { fakeDb } from './test-support/fake-db.ts'
import {
  adminProcedure,
  clericalProcedure,
  medicalDirectorProcedure,
  protectedProcedure,
} from './procedures.ts'
import { router } from './trpc.ts'

/**
 * The access matrix at the API layer: one probe procedure per surface that
 * has a procedure kind, every role called against every one, the outcome
 * compared with `ROLE_ACCESS`. A change to the matrix in contracts changes
 * the expectation and the behaviour together; a procedure kind wired to the
 * wrong surface fails here.
 *
 * `clinical` has no procedure kind of its own: the Medical tab is open to
 * every role (ADR 28, the Aug 31 decision that nothing clinical is withheld
 * from the front desk), so `protectedProcedure` admits the whole vocabulary
 * and the `clinical` surface only shapes the client (the Queues entry, the
 * chart's clinical cards). That asymmetry is pinned below rather than hidden.
 */

const probe = router({
  any: protectedProcedure.query(() => 'ok'),
  clerical: clericalProcedure.query(() => 'ok'),
  staff: adminProcedure.query(() => 'ok'),
  review: medicalDirectorProcedure.query(() => 'ok'),
})

const ENFORCED = ['clerical', 'staff', 'review'] as const satisfies readonly RoleSurface[]

function call(procedure: keyof typeof probe._def.procedures, roles: readonly string[]) {
  const caller = probe.createCaller(createContext({ actor: { id: 'probe', roles, locations: ['sylmar'] }, db: fakeDb() }))
  return caller[procedure]()
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the access matrix, enforced', () => {
  for (const role of STAFF_ROLES) {
    it(`${role} reaches the any-role chain`, async () => {
      await expect(call('any', [role])).resolves.toBe('ok')
    })
    for (const surface of ENFORCED) {
      const allowed = ROLE_ACCESS[role][surface]
      it(`${role} is ${allowed ? 'allowed' : 'refused'} on ${surface}`, async () => {
        if (allowed) await expect(call(surface, [role])).resolves.toBe('ok')
        else await expect(call(surface, [role])).rejects.toMatchObject({ code: 'FORBIDDEN' })
      })
    }
  }

  it('covers every surface the matrix names, or says why not', () => {
    expect([...ENFORCED, 'clinical'].sort()).toEqual([...ROLE_SURFACES].sort())
  })

  it('refuses a role outside the vocabulary on every enforced surface', async () => {
    for (const surface of ENFORCED) {
      await expect(call(surface, ['superuser'])).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
  })
})
