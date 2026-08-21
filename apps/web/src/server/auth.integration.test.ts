import { randomUUID } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { beforeAll, describe, expect, it } from 'vitest'
import { actorFromHeaders, createAuthOptions, getAuth } from './auth.ts'
import { GuardDenied, requireRole, requireSession } from './guards.ts'

/**
 * The auth flows against real PostgreSQL, through the real Better Auth
 * instance — the same singleton production code uses, configured by
 * vitest.integration.config.ts.
 *
 * Users are seeded through Better Auth's own `$context.internalAdapter`
 * (sign-up is disabled — that is one of the properties under test), with a
 * fresh random email per run so the suite never depends on cleanup order.
 * Fixtures are invented; no real staff identity appears here.
 */

const PASSWORD = 'a-sufficiently-long-fixture-password'
const run = randomUUID().slice(0, 8)

type SeededUser = { id: string; email: string }

async function seedUser(
  label: string,
  role: 'admin' | 'provider' | 'frontdesk',
  overrides: { isActive?: boolean; mustChangePassword?: boolean } = {},
): Promise<SeededUser> {
  const ctx = await getAuth().$context
  const email = `${label}-${run}@example.com`
  const user = await ctx.internalAdapter.createUser({
    email,
    name: `Fixture ${label}`,
    emailVerified: false,
    role,
    isActive: overrides.isActive ?? true,
    mustChangePassword: overrides.mustChangePassword ?? false,
  }, { method: 'test-fixture' })
  await ctx.internalAdapter.createAccount({
    userId: user.id,
    providerId: 'credential',
    issuer: 'local:credential',
    accountId: user.id,
    password: await ctx.password.hash(PASSWORD),
  })
  return { id: user.id, email }
}

/** Sign in over the real HTTP surface and return the session cookie header. */
async function signInCookie(email: string, password = PASSWORD): Promise<string> {
  const response = await getAuth().handler(
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password }),
    }),
  )
  expect(response.status).toBe(200)
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

function headersWithCookie(cookie: string): Headers {
  return new Headers({ cookie })
}

let admin: SeededUser
let provider: SeededUser
let frontdesk: SeededUser

beforeAll(async () => {
  admin = await seedUser('admin', 'admin')
  provider = await seedUser('provider', 'provider')
  frontdesk = await seedUser('frontdesk', 'frontdesk')
})

describe('sign-in', () => {
  it('valid credentials produce a server-verifiable session', async () => {
    const cookie = await signInCookie(admin.email)
    const session = await getAuth().api.getSession({ headers: headersWithCookie(cookie) })
    expect(session?.user.id).toBe(admin.id)
  })

  it('does not distinguish a wrong password from an unknown user', async () => {
    const messages: string[] = []
    for (const attempt of [
      { email: admin.email, password: 'wrong-password-entirely' },
      { email: `no-such-user-${run}@example.com`, password: 'wrong-password-entirely' },
    ]) {
      const error = await getAuth()
        .api.signInEmail({ body: attempt })
        .then(() => null)
        .catch((thrown: unknown) => thrown)
      expect(error).toBeInstanceOf(APIError)
      messages.push((error as APIError).message)
    }
    expect(messages[0]).toBe(messages[1])
  })

  it('sets an HttpOnly, SameSite cookie — and Secure under an https origin', async () => {
    const response = await getAuth().handler(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: admin.email, password: PASSWORD }),
      }),
    )
    const cookie = response.headers.getSetCookie().find((c) => c.includes('session_token'))
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)

    // The production posture, proven on a real instance built from the same
    // options with an https base URL.
    const secureAuth = betterAuth(
      createAuthOptions({
        secret: 'integration-test-secret-0123456789abcdef',
        baseURL: 'https://clinic.example.com',
      }),
    )
    const secureResponse = await secureAuth.handler(
      new Request('https://clinic.example.com/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://clinic.example.com' },
        body: JSON.stringify({ email: admin.email, password: PASSWORD }),
      }),
    )
    expect(secureResponse.status).toBe(200)
    const secureCookie = secureResponse.headers
      .getSetCookie()
      .find((c) => c.includes('session_token'))
    expect(secureCookie).toMatch(/;\s*Secure/i)
  })
})

describe('sign-out', () => {
  it('invalidates the session server-side, not just in the browser', async () => {
    const cookie = await signInCookie(provider.email)
    expect(await getAuth().api.getSession({ headers: headersWithCookie(cookie) })).not.toBeNull()

    await getAuth().api.signOut({ headers: headersWithCookie(cookie) })

    // The same token, replayed the way a stolen cookie would be.
    expect(await getAuth().api.getSession({ headers: headersWithCookie(cookie) })).toBeNull()
  })
})

describe('role cannot arrive from a client payload', () => {
  it('rejects sign-up entirely, role smuggled or not', async () => {
    const email = `intruder-${run}@example.com`
    const response = await getAuth().handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password: PASSWORD, name: 'Intruder', role: 'admin' }),
      }),
    )
    expect(response.status).toBe(400)

    // And no account exists to sign in with.
    const error = await getAuth()
      .api.signInEmail({ body: { email, password: PASSWORD } })
      .then(() => null)
      .catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(APIError)
  })

  it('ignores a role field on update-user — the stored value is unchanged', async () => {
    const cookie = await signInCookie(frontdesk.email)

    const response = await getAuth().handler(
      new Request('http://localhost:3000/api/auth/update-user', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          cookie,
        },
        body: JSON.stringify({ name: 'Renamed Fixture', role: 'admin' }),
      }),
    )
    // Whether the endpoint strips the field or refuses the request, the
    // database value must not move.
    expect([200, 400]).toContain(response.status)

    const actor = await actorFromHeaders(headersWithCookie(cookie))
    expect(actor?.roles).toEqual(['frontdesk'])
  })
})

describe('guards', () => {
  it('requireRole admits the named role and refuses the others', async () => {
    const adminHeaders = headersWithCookie(await signInCookie(admin.email))
    const providerHeaders = headersWithCookie(await signInCookie(provider.email))
    const frontdeskHeaders = headersWithCookie(await signInCookie(frontdesk.email))

    await expect(requireRole(adminHeaders, 'admin')).resolves.toMatchObject({ id: admin.id })
    await expect(requireRole(providerHeaders, 'admin')).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(requireRole(frontdeskHeaders, 'admin')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('fails closed on missing and on malformed sessions', async () => {
    await expect(requireSession(new Headers())).rejects.toBeInstanceOf(GuardDenied)
    await expect(requireRole(new Headers(), 'admin')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    await expect(
      requireSession(new Headers({ cookie: 'better-auth.session_token=forged-garbage' })),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('refuses a deactivated account even with a live session cookie', async () => {
    const inactive = await seedUser('inactive', 'provider')
    const cookie = await signInCookie(inactive.email)
    expect(await actorFromHeaders(headersWithCookie(cookie))).not.toBeNull()

    const ctx = await getAuth().$context
    await ctx.internalAdapter.updateUser(inactive.id, { isActive: false })

    expect(await actorFromHeaders(headersWithCookie(cookie))).toBeNull()
    await expect(requireSession(headersWithCookie(cookie))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
  })
})

describe('temporary credentials', () => {
  it('a pending password change blocks every guard except its own flow, and changing clears it', async () => {
    const pending = await seedUser('pending', 'frontdesk', { mustChangePassword: true })
    const cookie = await signInCookie(pending.email)
    const headers = headersWithCookie(cookie)

    await expect(requireSession(headers)).rejects.toMatchObject({
      code: 'PASSWORD_CHANGE_REQUIRED',
    })
    await expect(requireRole(headers, 'frontdesk')).rejects.toMatchObject({
      code: 'PASSWORD_CHANGE_REQUIRED',
    })
    await expect(
      requireSession(headers, { allowPendingPasswordChange: true }),
    ).resolves.toMatchObject({ id: pending.id })

    const response = await getAuth().handler(
      new Request('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          cookie,
        },
        body: JSON.stringify({
          currentPassword: PASSWORD,
          newPassword: 'a-brand-new-chosen-password',
          revokeOtherSessions: false,
        }),
      }),
    )
    expect(response.status).toBe(200)

    await expect(requireSession(headers)).resolves.toMatchObject({ id: pending.id })
  })
})
