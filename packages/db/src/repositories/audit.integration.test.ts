import { beforeEach, describe, expect, it } from 'vitest'
import { getPrismaClient } from '../client.ts'
import { db } from '../index.ts'

/**
 * The audit trail against real PostgreSQL (ADR 37): a row lands with the
 * enum values, and the table refuses to be rewritten.
 *
 * There is no TRUNCATE in `beforeEach` on purpose: the trigger under test
 * refuses it. Each case writes rows with its own request id and reads
 * only those back.
 */
const prisma = getPrismaClient()

let requestId: string

beforeEach(() => {
  requestId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
})

describe('audit repository', () => {
  it('appends one row per event', async () => {
    await db.audit.record({
      transport: 'rest',
      actorKind: 'integration',
      actorId: 'client-1',
      apiKeyId: 'ABCDEFGH',
      action: 'patients.verify',
      method: 'POST',
      routeTemplate: '/patients/{patientId}/verify',
      outcome: 'denied',
      code: 'verification_failed',
      httpStatus: 403,
      patientId: '3f1a7a1e-8c9b-4d2a-9f10-6b2c5d4e7a81',
      requestId,
      ipAddress: '203.0.113.5',
      userAgent: 'x'.repeat(400),
      durationMs: 12,
    })

    const rows = await prisma.phiAuditEvent.findMany({ where: { requestId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      transport: 'rest',
      actorKind: 'integration',
      actorId: 'client-1',
      apiKeyId: 'ABCDEFGH',
      outcome: 'denied',
      code: 'verification_failed',
      httpStatus: 403,
      routeTemplate: '/patients/{patientId}/verify',
    })
    // The user agent is cut to the contract's cap, not refused.
    expect(rows[0]?.userAgent).toHaveLength(256)
    expect(rows[0]?.occurredAt).toBeInstanceOf(Date)
  })

  it('refuses a shape the contract does not describe', async () => {
    await expect(
      db.audit.record({
        transport: 'trpc',
        actorKind: 'staff',
        actorId: 'user-1',
        action: 'patient.byId',
        // @ts-expect-error the outcome vocabulary is closed
        outcome: 'maybe',
        durationMs: 1,
      }),
    ).rejects.toThrow()
  })

  it('is append-only: update, delete, and truncate are refused by the database', async () => {
    await db.audit.record({
      transport: 'trpc',
      actorKind: 'staff',
      actorId: 'user-1',
      action: 'patient.byId',
      method: 'query',
      outcome: 'allowed',
      requestId,
      durationMs: 1,
    })

    await expect(prisma.phiAuditEvent.updateMany({ where: { requestId }, data: { code: 'edited' } })).rejects.toThrow(
      /append-only/,
    )
    await expect(prisma.phiAuditEvent.deleteMany({ where: { requestId } })).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "phi_audit_events"')).rejects.toThrow(/append-only/)

    const rows = await prisma.phiAuditEvent.findMany({ where: { requestId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.code).toBeNull()
  })
})
