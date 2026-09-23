import type { Integration } from '@fastehr/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createContext, type Actor } from '../context.ts'
import { fakeDb, stubRepository } from '../test-support/fake-db.ts'
import { appRouter } from './root.ts'
import type { IntegrationRepository } from '@fastehr/db'

/**
 * The partner account's own procedure (ADR 36 as amended): the integration
 * role reads its own principal and nothing else; every staff role is
 * refused, an anonymous call is refused, and the audit row names the
 * integration as the actor.
 */
const MINE: Integration = {
  id: 'integration-1',
  name: 'Voice assistant',
  isActive: true,
  hasCredential: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  keys: [],
}

function integrations(): IntegrationRepository {
  return {
    ...stubRepository<IntegrationRepository>('integrations'),
    async find(id) {
      return id === MINE.id ? MINE : null
    },
  }
}

function callerFor(actor: Actor | null) {
  const db = fakeDb({ integrations: integrations() })
  return { caller: appRouter.createCaller(createContext({ actor, db })), db }
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('integration.mine', () => {
  it('answers the integration role with its own principal, audited as an integration', async () => {
    const { caller, db } = callerFor({ id: 'integration-1', roles: ['integration'], locations: [] })
    await expect(caller.integration.mine()).resolves.toEqual(MINE)
    const events = (db.audit as unknown as { events: Array<Record<string, unknown>> }).events
    expect(events[0]).toMatchObject({ actorKind: 'integration', actorId: 'integration-1', action: 'integration.mine', outcome: 'allowed' })
  })

  it('refuses every staff role and an anonymous call', async () => {
    for (const role of ['admin', 'medical_director', 'provider', 'frontdesk']) {
      const { caller } = callerFor({ id: 'person', roles: [role], locations: ['sylmar'] })
      await expect(caller.integration.mine(), role).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
    const { caller } = callerFor(null)
    await expect(caller.integration.mine()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('keeps the integration role out of a staff procedure', async () => {
    const { caller } = callerFor({ id: 'integration-1', roles: ['integration'], locations: [] })
    await expect(caller.patient.recent()).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
