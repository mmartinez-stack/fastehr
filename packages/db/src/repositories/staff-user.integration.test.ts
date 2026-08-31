import { beforeEach, describe, expect, it } from 'vitest'
import { getPrismaClient } from '../client.ts'
import { db, StaffUserEmailTakenError } from '../index.ts'

/**
 * The staff-user repository against real PostgreSQL. What only this level can
 * prove: the unique constraint surfaces as the domain error, deactivation
 * really deletes sessions, and the mapper's explicit field list keeps
 * `legacyId`/`mustChangePassword` from ever crossing the boundary.
 */

const prisma = getPrismaClient()

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" RESTART IDENTITY CASCADE')
})

async function seed(email: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const row = await prisma.user.create({
    data: {
      id: `fixture-${email}`,
      name: 'Fixture Person',
      email,
      role: 'frontdesk',
      ...overrides,
    },
  })
  return row.id
}

describe('staff-user repository', () => {
  it('lists contract shapes and nothing internal', async () => {
    await seed('a@example.com', { legacyId: 'abc123', mustChangePassword: true })

    const [user] = await db.staffUsers.list()
    expect(user).toBeDefined()
    expect(user?.email).toBe('a@example.com')
    expect(user).not.toHaveProperty('legacyId')
    expect(user).not.toHaveProperty('mustChangePassword')
    expect(user).not.toHaveProperty('emailVerified')
  })

  it('reports whether a credential exists', async () => {
    const withCred = await seed('with@example.com')
    await seed('without@example.com')
    await prisma.account.create({
      data: {
        id: 'acc-1',
        userId: withCred,
        accountId: withCred,
        providerId: 'credential',
        issuer: 'local:credential',
        password: 'not-a-real-hash',
        updatedAt: new Date(),
      },
    })

    const users = await db.staffUsers.list()
    expect(users.map((u) => [u.email, u.hasCredential])).toEqual([
      ['with@example.com', true],
      ['without@example.com', false],
    ])
  })

  it('searches by name or email substring, case-insensitively', async () => {
    await seed('maria.garcia@example.com', { name: 'Maria Garcia' })
    await seed('june.osei@example.com', { name: 'June Osei' })

    const byName = await db.staffUsers.search({ query: { kind: 'name', name: 'gar' } })
    expect(byName.map((u) => u.name)).toEqual(['Maria Garcia'])

    const byEmail = await db.staffUsers.search({ query: { kind: 'email', email: 'june.osei@' } })
    expect(byEmail.map((u) => u.email)).toEqual(['june.osei@example.com'])

    expect(await db.staffUsers.search({ query: { kind: 'name', name: 'nobody' } })).toEqual([])
  })

  it('filters by account state, alone or combined with a query', async () => {
    await seed('active@example.com', { name: 'Active Person' })
    await seed('disabled@example.com', { name: 'Disabled Person', isActive: false })

    expect(
      (await db.staffUsers.search({ status: 'disabled' })).map((u) => u.email),
    ).toEqual(['disabled@example.com'])
    expect(
      await db.staffUsers.search({ query: { kind: 'name', name: 'active person' }, status: 'disabled' }),
    ).toEqual([])
  })

  it('creates without any credential and surfaces a duplicate email by name', async () => {
    const created = await db.staffUsers.create({
      name: 'New Person',
      email: 'new@example.com',
      role: 'provider',
    })
    expect(created.hasCredential).toBe(false)
    expect(await prisma.account.count()).toBe(0)

    await expect(
      db.staffUsers.create({ name: 'Other', email: 'new@example.com', role: 'frontdesk' }),
    ).rejects.toBeInstanceOf(StaffUserEmailTakenError)
  })

  it('updates name and role', async () => {
    const id = await seed('edit@example.com')

    const updated = await db.staffUsers.update({ id, name: 'Renamed', role: 'admin' })
    expect(updated).toMatchObject({ name: 'Renamed', role: 'admin' })
    expect(await db.staffUsers.update({ id: 'ghost', name: 'X' })).toBeNull()
  })

  it('deactivation kills live sessions in the same transaction', async () => {
    const id = await seed('leaving@example.com')
    await prisma.session.create({
      data: {
        id: 'sess-1',
        token: 'token-1',
        userId: id,
        expiresAt: new Date(Date.now() + 3_600_000),
        updatedAt: new Date(),
      },
    })

    const updated = await db.staffUsers.setActive({ id, isActive: false })
    expect(updated?.isActive).toBe(false)
    expect(await prisma.session.count({ where: { userId: id } })).toBe(0)

    // Reactivation restores nothing — a new sign-in is required.
    const back = await db.staffUsers.setActive({ id, isActive: true })
    expect(back?.isActive).toBe(true)
    expect(await prisma.session.count({ where: { userId: id } })).toBe(0)
  })
})
