import { createHash } from 'node:crypto'
import type {
  ApiClient,
  Location,
  PatientLookupRow,
  PatientVerification,
  WaitQueueRow,
} from '@fastehr/contracts'
import { formatApiKey } from '@fastehr/contracts'
import type { ApiClientRepository, Db, LocationRepository, PatientRepository, QueueRepository, VerificationRepository } from '@fastehr/db'
import { handlePartnerRequest, type PartnerHostOptions } from '../partner/handle.ts'
import { createRateLimiter } from '../partner/rate-limit.ts'
import { fakeDb, recordingAuditRepository, stubRepository, type RecordingAuditRepository } from './fake-db.ts'

/**
 * Fakes for the partner chain: a key the fake client repository accepts,
 * in-memory verifications and attempts, a few invented patients, and a
 * request builder. No database, no environment, no Next.
 */

export const TEST_SECRET = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
export const TEST_KEY_ID = 'TESTKEY1'
export const OTHER_KEY_ID = 'OTHERKEY'

export const ADA: PatientLookupRow = {
  patientId: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1985-12-10',
  phone: '9515550000',
  locationId: 'sylmar',
}
export const GRACE: PatientLookupRow = {
  patientId: '5c2b8d3f-1a4e-4f6b-8c7d-9e0f1a2b3c4d',
  firstName: 'Grace',
  lastName: 'Hopper',
  dateOfBirth: '1985-12-10',
  phone: null,
  locationId: 'kanoga',
}

export const NOW = new Date('2026-09-17T12:00:00.000Z')

export function testClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    id: 'client-1',
    name: 'Voice assistant',
    vendor: null,
    environment: 'dev',
    keyId: TEST_KEY_ID,
    scopes: ['patients:lookup', 'patients:verify', 'queue:read'],
    allowedIps: [],
    locationIds: [],
    status: 'active',
    expiresAt: '2027-01-01T00:00:00.000Z',
    lastUsedAt: null,
    baaSignedAt: null,
    issuedBy: 'ops@example.com',
    createdAt: '2026-09-01T00:00:00.000Z',
    revokedAt: null,
    ...overrides,
  }
}

export function testKey(keyId: string = TEST_KEY_ID, secret: string = TEST_SECRET): string {
  return formatApiKey({ environment: 'dev', keyId, secret })
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/** Accepts exactly the clients given, by key id and the test secret. */
export function fakeApiClients(clients: readonly ApiClient[] = [testClient()]): ApiClientRepository {
  return {
    ...stubRepository<ApiClientRepository>('apiClients'),
    async findByCredential({ keyId, secretHash }) {
      const client = clients.find((candidate) => candidate.keyId === keyId && candidate.status === 'active')
      return client !== undefined && secretHash === hash(TEST_SECRET) ? client : null
    },
    async touchLastUsed() {},
  }
}

export interface FakeVerifications extends VerificationRepository {
  readonly rows: Array<PatientVerification & { tokenHash: string }>
  readonly attempts: Array<{ apiClientId: string; patientId: string; succeeded: boolean; at: Date }>
}

export function fakeVerifications(clock: () => Date = () => NOW): FakeVerifications {
  const rows: FakeVerifications['rows'] = []
  const attempts: FakeVerifications['attempts'] = []
  return {
    rows,
    attempts,
    async create(input) {
      const row = {
        id: `verification-${rows.length + 1}`,
        apiClientId: input.apiClientId,
        patientId: input.patientId,
        method: input.method,
        expiresAt: input.expiresAt.toISOString(),
        useCount: 0,
        lastUsedAt: null,
        createdAt: clock().toISOString(),
        tokenHash: input.tokenHash,
      }
      rows.push(row)
      const { tokenHash: _hash, ...contract } = row
      return contract
    },
    async findByTokenHash(tokenHash) {
      const row = rows.find((candidate) => candidate.tokenHash === tokenHash)
      if (row === undefined) return null
      const { tokenHash: _hash, ...contract } = row
      return contract
    },
    async markUsed(id, at) {
      const row = rows.find((candidate) => candidate.id === id)
      if (row !== undefined) {
        row.useCount += 1
        row.lastUsedAt = at.toISOString()
      }
    },
    async recordAttempt(input) {
      attempts.push({ ...input, at: clock() })
    },
    async countFailedAttempts({ apiClientId, patientId, since }) {
      return attempts.filter(
        (attempt) =>
          attempt.apiClientId === apiClientId &&
          !attempt.succeeded &&
          (patientId === undefined || attempt.patientId === patientId) &&
          attempt.at.getTime() >= since.getTime(),
      ).length
    },
    async lastSuccessAt({ apiClientId, patientId }) {
      const successes = attempts.filter((a) => a.apiClientId === apiClientId && a.patientId === patientId && a.succeeded)
      return successes.at(-1)?.at ?? null
    },
  }
}

/** Exact, case-insensitive matching over a fixed list, the way the repository matches. */
export function fakePatients(rows: readonly PatientLookupRow[] = [ADA, GRACE]): PatientRepository {
  return {
    ...stubRepository<PatientRepository>('patients'),
    async lookup(criteria) {
      const same = (a: string | undefined, b: string) => a === undefined || a.toLowerCase() === b.toLowerCase()
      return rows
        .filter(
          (row) =>
            (criteria.patientId === undefined || criteria.patientId === row.patientId) &&
            (criteria.dateOfBirth === undefined || criteria.dateOfBirth === row.dateOfBirth) &&
            (criteria.phone === undefined || criteria.phone === row.phone) &&
            same(criteria.lastName, row.lastName) &&
            same(criteria.firstName, row.firstName) &&
            (criteria.locationIds.length === 0 || (row.locationId !== null && criteria.locationIds.includes(row.locationId))),
        )
        .slice(0, criteria.limit)
    },
  }
}

const ACTIVE_LOCATIONS: Location[] = [
  { slug: 'sylmar', name: 'Sylmar', legacyName: 'Sylmar', active: true, sortOrder: 1 },
  { slug: 'kanoga', name: 'Kanoga', legacyName: 'PennProgram', active: true, sortOrder: 2 },
]

export function fakeLocations(): LocationRepository {
  return { list: async () => ACTIVE_LOCATIONS, listActive: async () => ACTIVE_LOCATIONS }
}

export function fakeQueue(waiting: readonly WaitQueueRow[] = []): QueueRepository {
  return {
    ...stubRepository<QueueRepository>('queue'),
    async listWaiting(location) {
      return waiting.filter((row) => location === 'all' || row.locationId === location)
    },
  }
}

export interface PartnerHarness {
  db: Db
  audit: RecordingAuditRepository
  verifications: FakeVerifications
  options: PartnerHostOptions
  /** Sends a request through the whole chain. */
  send(input: {
    method?: string
    path: string
    key?: string | null
    body?: unknown
    headers?: Record<string, string>
    rawBody?: string
    contentType?: string
  }): Promise<{ status: number; body: unknown; headers: Headers }>
}

export function partnerHarness(overrides: {
  clients?: readonly ApiClient[]
  patients?: readonly PatientLookupRow[]
  waiting?: readonly WaitQueueRow[]
  now?: () => Date
  enabled?: boolean
  env?: Record<string, string | undefined>
  ip?: string | null
} = {}): PartnerHarness {
  const now = overrides.now ?? (() => NOW)
  const audit = recordingAuditRepository()
  const verifications = fakeVerifications(now)
  const db = fakeDb({
    audit,
    apiClients: fakeApiClients(overrides.clients),
    verifications,
    patients: fakePatients(overrides.patients),
    locations: fakeLocations(),
    queue: fakeQueue(overrides.waiting),
  })
  const options: PartnerHostOptions = {
    db,
    now,
    rateLimiter: createRateLimiter(),
    enabled: overrides.enabled ?? true,
    env: overrides.env ?? {},
  }

  return {
    db,
    audit,
    verifications,
    options,
    async send({ method, path, key = testKey(), body, headers = {}, rawBody, contentType }) {
      const requestHeaders: Record<string, string> = { ...headers }
      if (key !== null) requestHeaders.authorization = `Bearer ${key}`
      if (overrides.ip !== null) requestHeaders['x-forwarded-for'] = overrides.ip ?? '203.0.113.5'
      const hasBody = body !== undefined || rawBody !== undefined
      if (hasBody) requestHeaders['content-type'] = contentType ?? 'application/json'
      const response = await handlePartnerRequest(
        new Request(`http://test.invalid/api/v1${path}`, {
          method: method ?? (hasBody ? 'POST' : 'GET'),
          headers: requestHeaders,
          body: hasBody ? (rawBody ?? JSON.stringify(body)) : undefined,
        }),
        options,
      )
      const text = await response.text()
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        // not JSON (the docs page)
      }
      return { status: response.status, body: parsed, headers: response.headers }
    },
  }
}

export const LOOKUP_BODY = { dateOfBirth: '1985-12-10', phone: '(951) 555-0000' }
export const VERIFY_BODY = { dateOfBirth: '1985-12-10', phone: '9515550000' }
