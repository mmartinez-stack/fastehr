import type { PhiAuditEvent } from '@fastehr/contracts'
import type { AuditRepository, Db } from '@fastehr/db'

/**
 * A complete `Db` of stubs for tests that exercise the chain rather than a
 * repository: every method throws "not under test", except the audit sink,
 * which records what it was handed so a test can read the trail back.
 *
 * `Db` is an interface of contract types, so a fake is an object; there is
 * no client to mock. Router tests that need real behaviour from one
 * repository keep their own literal (see routers/patient.test.ts) and only
 * take `recordingAuditRepository` from here.
 */
export function stubRepository<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get(_target, property) {
      if (property === 'then') return undefined
      return async () => {
        throw new Error(`${name}.${String(property)} is not under test`)
      }
    },
  })
}

export type RecordingAuditRepository = AuditRepository & { readonly events: PhiAuditEvent[] }

/** An audit repository that keeps every event in memory. */
export function recordingAuditRepository(): RecordingAuditRepository {
  const events: PhiAuditEvent[] = []
  return {
    events,
    async record(event) {
      events.push(event)
    },
  }
}

export function fakeDb(overrides: Partial<Db> = {}): Db {
  return {
    patients: stubRepository('patients'),
    staffUsers: stubRepository('staffUsers'),
    intakes: stubRepository('intakes'),
    reviews: stubRepository('reviews'),
    locations: stubRepository('locations'),
    queue: stubRepository('queue'),
    audit: recordingAuditRepository(),
    ...overrides,
  }
}
