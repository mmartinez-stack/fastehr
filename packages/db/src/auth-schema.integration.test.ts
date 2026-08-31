import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyPassword } from 'better-auth/crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getPrismaClient } from './client.ts'

/**
 * The auth schema and the two operator scripts, against real PostgreSQL.
 *
 * What only this level can prove: that the `staff_role` constraint lives in
 * the **database** rather than in TypeScript, that the migration script's
 * refusals actually refuse, and that the credential a temp-password issuance
 * writes is one Better Auth's own scrypt verifies. The scripts run as child
 * processes — the surface under test is the CLI an operator actually uses.
 *
 * Fixtures are invented; no real staff identity appears here.
 */

const prisma = getPrismaClient()
const scriptsDir = new URL('../scripts/', import.meta.url).pathname

function runScript(script: string, args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('node', [join(scriptsDir, script), ...args], {
      env: { ...process.env },
      encoding: 'utf8',
    })
    return { stdout, status: 0 }
  } catch (error) {
    const failure = error as { stdout?: string; status?: number }
    return { stdout: failure.stdout ?? '', status: failure.status ?? 1 }
  }
}

/** A legacy export line the way mongoexport writes one. */
function legacyLine(oid: string, email: string, group: string, isActive = true): string {
  return JSON.stringify({
    _id: { $oid: oid },
    email,
    firstName: 'Fixture',
    lastName: `User${oid.slice(-4)}`,
    group,
    isActive,
  })
}

const OID_A = '57ec0ac1e204c82ac7477b00'
const OID_B = '582c7efa2eee476b7c4331b1'
const OID_C = '5a3f9d2c8b1e4f6a7c9d0e02'
const OID_D = '5c1d8e3f9a2b4c6d8e0f1a03'
const OID_E = '5e2f9a4b8c3d5e7f9a1b2c04'

function writeFixture(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'fastehr-migrate-'))
  const path = join(dir, 'users.ndjson')
  writeFileSync(path, lines.join('\n') + '\n')
  return path
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE')
})

describe('staff_role database constraint', () => {
  it('rejects a role outside the enum written directly via SQL', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO users (id, name, email, role, "updatedAt") VALUES ('raw-1', 'Raw', 'raw@example.com', 'superuser', now())`,
      ),
    ).rejects.toThrow(/staff_role|invalid input value/)
  })

  it('accepts each enum value', async () => {
    for (const role of ['admin', 'provider', 'frontdesk']) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO users (id, name, email, role, "updatedAt") VALUES ('raw-${role}', 'Raw', '${role}@example.com', '${role}', now())`,
      )
    }
    expect(await prisma.user.count()).toBe(3)
  })
})

describe('migrate-users script', () => {
  it('is a dry run unless --apply is passed', async () => {
    const input = writeFixture([legacyLine(OID_A, 'a@example.com', 'admin')])
    const { status } = runScript('migrate-users.ts', ['--input', input])
    expect(status).toBe(0)
    expect(await prisma.user.count()).toBe(0)
  })

  it('maps the four legacy groups onto the three roles and preserves provenance', async () => {
    const input = writeFixture([
      legacyLine(OID_A, 'Admin@Example.com', 'admin'),
      legacyLine(OID_B, 'doc@example.com', 'doc'),
      legacyLine(OID_C, 'clerk@example.com', 'clerk', false),
      legacyLine(OID_D, 'csr@example.com', 'csr'),
    ])
    const { status } = runScript('migrate-users.ts', ['--input', input, '--apply'])
    expect(status).toBe(0)

    const users = await prisma.user.findMany({ orderBy: { email: 'asc' } })
    expect(users.map((u) => [u.email, u.role, u.legacyRoleRaw, u.isActive])).toEqual([
      ['admin@example.com', 'admin', 'admin', true], // normalized to lowercase
      ['clerk@example.com', 'frontdesk', 'clerk', false], // inactive stays disabled
      ['csr@example.com', 'frontdesk', 'csr', true],
      ['doc@example.com', 'provider', 'doc', true],
    ])
    // createdAt comes from the ObjectId timestamp, not from migration time.
    const admin = users.find((u) => u.legacyId === OID_A)
    expect(admin?.createdAt.getUTCFullYear()).toBe(2016)
    // No credential arrives with a migrated user.
    expect(await prisma.account.count()).toBe(0)
  })

  it('hard-fails unmapped roles per record and never defaults', async () => {
    const input = writeFixture([
      legacyLine(OID_A, 'fine@example.com', 'doc'),
      legacyLine(OID_B, 'nurse@example.com', 'nurse'),
    ])
    runScript('migrate-users.ts', ['--input', input, '--apply'])

    expect(await prisma.user.count()).toBe(1)
    const report = JSON.parse(readFileSync(`${input}.report.json`, 'utf8')) as {
      skipped: Array<{ reason: string }>
    }
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]?.reason).toMatch(/unmapped legacy role "nurse"/)
  })

  it('reports normalized email collisions and writes neither record', async () => {
    const input = writeFixture([
      legacyLine(OID_A, 'Same@Example.com', 'admin'),
      legacyLine(OID_B, 'same@example.com', 'doc'),
      legacyLine(OID_C, 'other@example.com', 'clerk'),
    ])
    runScript('migrate-users.ts', ['--input', input, '--apply'])

    expect(await prisma.user.count()).toBe(1)
    const report = JSON.parse(readFileSync(`${input}.report.json`, 'utf8')) as {
      emailCollisions: string[]
    }
    expect(report.emailCollisions).toEqual(['same@example.com'])
  })

  it('is idempotent: a second apply changes nothing', async () => {
    const input = writeFixture([
      legacyLine(OID_A, 'a@example.com', 'admin'),
      legacyLine(OID_B, 'b@example.com', 'doc'),
    ])
    runScript('migrate-users.ts', ['--input', input, '--apply'])
    const before = await prisma.user.findMany({ orderBy: { email: 'asc' } })

    runScript('migrate-users.ts', ['--input', input, '--apply'])
    const after = await prisma.user.findMany({ orderBy: { email: 'asc' } })

    expect(after.map((u) => ({ ...u, updatedAt: null }))).toEqual(
      before.map((u) => ({ ...u, updatedAt: null })),
    )
    expect(after).toHaveLength(2)
  })

  it('refuses to adopt an existing user whose email matches but legacyId does not', async () => {
    await prisma.user.create({
      data: { id: 'manual-1', name: 'Manual', email: 'a@example.com', role: 'admin' },
    })
    const input = writeFixture([legacyLine(OID_A, 'a@example.com', 'admin')])
    runScript('migrate-users.ts', ['--input', input, '--apply'])

    expect(await prisma.user.count()).toBe(1)
    const survivor = await prisma.user.findUnique({ where: { email: 'a@example.com' } })
    expect(survivor?.id).toBe('manual-1')
    expect(survivor?.legacyId).toBeNull()
  })
})

describe('issue-temp-password script', () => {
  it('writes a credential Better Auth verifies and flags the forced change', async () => {
    const input = writeFixture([legacyLine(OID_E, 'issue@example.com', 'doc')])
    runScript('migrate-users.ts', ['--input', input, '--apply'])

    const { stdout, status } = runScript('issue-temp-password.ts', ['--email', 'issue@example.com'])
    expect(status).toBe(0)

    const password = stdout.match(/issue@example\.com\s+(\S+)/)?.[1]
    expect(password).toBeDefined()

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'issue@example.com' } })
    expect(user.mustChangePassword).toBe(true)

    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } })
    expect(account.providerId).toBe('credential')
    expect(account.issuer).toBe('local:credential')
    expect(account.accountId).toBe(user.id)
    expect(account.password).not.toContain(password as string) // stored hashed, never plaintext
    expect(await verifyPassword({ hash: account.password ?? '', password: password as string })).toBe(true)
  })

  it('refuses deactivated accounts without an explicit override', async () => {
    const input = writeFixture([legacyLine(OID_E, 'gone@example.com', 'doc', false)])
    runScript('migrate-users.ts', ['--input', input, '--apply'])

    const { status } = runScript('issue-temp-password.ts', ['--email', 'gone@example.com'])
    expect(status).toBe(1)
    expect(await prisma.account.count()).toBe(0)
  })
})
