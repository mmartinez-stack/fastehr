import {
  betterAuthSecretSchema,
  betterAuthUrlSchema,
  isLegacyCredential,
  officeSchema,
  staffRoleSchema,
} from '@fastehr/contracts'
import { createAuthAdapter } from '@fastehr/db'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import type { Actor } from './context.ts'
import { verifyLegacyPassword } from './legacy-password.ts'

/**
 * The Better Auth instance and the session → `Actor` resolution.
 *
 * Framework-agnostic on purpose: everything here speaks standard `Headers`,
 * so the layer stays mountable outside Next (ADR 9). The HTTP mount point is
 * `app/api/auth/[...all]/route.ts`, outside the fence, same as the tRPC route.
 *
 * Construction is lazy for the same reason `getPrismaClient` is: `next build`
 * and CI import this module without BETTER_AUTH_SECRET or a database, and
 * neither may fail. A missing variable fails at the first real auth call,
 * naming itself.
 */

function requireAuthEnv(name: 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL'): string {
  const schema = name === 'BETTER_AUTH_SECRET' ? betterAuthSecretSchema : betterAuthUrlSchema
  const parsed = schema.safeParse(process.env[name])

  if (!parsed.success) {
    const reason = process.env[name] === undefined ? 'is not set' : parsed.error.issues[0]?.message
    throw new Error(`${name} ${reason}. See .env.example; it is required by the auth server.`)
  }

  return parsed.data
}

let instance: ReturnType<typeof betterAuth> | undefined

/**
 * The full auth configuration, pure of environment reads so tests can
 * construct real instances against variant environments (an https base URL
 * for the Secure-cookie assertions). Typed as the option interface rather
 * than inferred: the instance type stays `Auth<BetterAuthOptions>`, and
 * session users are validated in `actorFromHeaders` through contracts
 * schemas instead of trusted through type inference.
 */
export function createAuthOptions(env: { secret: string; baseURL: string }): BetterAuthOptions {
  return {
    database: createAuthAdapter(),
    secret: env.secret,
    baseURL: env.baseURL,

    // ADR 7 is a stated position, not an accident of a vendor default — off,
    // explicitly, even though off is already the default.
    telemetry: { enabled: false },

    emailAndPassword: {
      enabled: true,
      // A clinic staff directory: accounts arrive by migration or by an
      // admin, never by public registration (auth-foundation decision §11.2).
      disableSignUp: true,
      // No mail transport exists in this environment; credential issuance is
      // the admin temp-password path, not a reset email (decision §11.1/§11.3).
      requireEmailVerification: false,
      /**
       * Two stored-hash formats coexist during migration (ADR 26): Better
       * Auth's own scrypt, and `legacy-pbkdf2-sha1$…` written by
       * migrate-users.ts so staff keep the passwords they already have. The
       * format prefix decides the verifier; hashing is always scrypt, so
       * every password *written* here — sign-up is off, so that means
       * change-password and temp-credential issuance — is a modern one.
       */
      password: {
        hash: (password) => hashPassword(password),
        verify: async ({ hash, password }) =>
          isLegacyCredential(hash)
            ? verifyLegacyPassword(hash, password)
            : verifyPassword({ hash, password }),
      },
    },

    session: {
      // Provisional until the session-policy question in
      // docs/auth-and-rbac-proposal.md is decided: 12 hours covers a clinic
      // shift without inheriting the library's 7-day default in front of PHI.
      // Cookie caching stays off — every check is a server-side lookup.
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
    },

    hooks: {
      /**
       * Two credential-lifecycle transitions, both server-side only:
       *
       * - Sign-in retires a migrated legacy hash by re-hashing to scrypt
       *   (ADR 26).
       * - Change/reset-password exits the temp-credential state. Issuance
       *   (packages/db/scripts/issue-temp-password.ts) sets
       *   `mustChangePassword`; proving a new password here clears it, and
       *   guards refuse the account for everything else in between.
       */
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.context.returned instanceof APIError) return

        /**
         * Legacy-hash retirement (ADR 26). A successful sign-in is the one
         * moment the plaintext is legitimately in hand next to its stored
         * hash — if that hash is still the migrated PBKDF2 one, re-hash with
         * scrypt now. Every legacy credential therefore survives exactly
         * until its owner's first login, and a failure here only postpones
         * the upgrade to the next one.
         */
        if (ctx.path === '/sign-in/email') {
          const body = ctx.body as { email?: unknown; password?: unknown }
          if (typeof body.email !== 'string' || typeof body.password !== 'string') return

          const found = await ctx.context.internalAdapter.findUserByEmail(body.email)
          if (found === null) return

          const account = await ctx.context.internalAdapter.findCredentialAccount(found.user.id)
          if (account?.password == null || !isLegacyCredential(account.password)) return

          await ctx.context.internalAdapter.updatePassword(found.user.id, await hashPassword(body.password))
          return
        }

        if (ctx.path !== '/change-password' && ctx.path !== '/reset-password') return

        const sessionUserId = ctx.context.session?.user.id
        if (sessionUserId === undefined) return

        await ctx.context.internalAdapter.updateUser(sessionUserId, { mustChangePassword: false })
      }),
    },

    user: {
      /**
       * `input: false` on every field is the property Phase 7 tests assert:
       * none of these can arrive in a client payload — role can never be set,
       * let alone elevated, from a request body.
       */
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'frontdesk', input: false },
        legacyId: { type: 'string', required: false, input: false },
        legacyRoleRaw: { type: 'string', required: false, input: false },
        isActive: { type: 'boolean', required: false, defaultValue: true, input: false },
        mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
  }
}

export function getAuth(): ReturnType<typeof betterAuth> {
  if (instance !== undefined) return instance

  instance = betterAuth(
    createAuthOptions({
      secret: requireAuthEnv('BETTER_AUTH_SECRET'),
      baseURL: requireAuthEnv('BETTER_AUTH_URL'),
    }),
  )

  return instance
}

/**
 * The single place a session becomes an `Actor` — the seam
 * `src/trpc/actor.ts` used to stub. Both hosts (the tRPC route handler and
 * the RSC caller) share it, so "who is this" has one implementation.
 *
 * Fail closed at every step: no session, an inactive account, or a role the
 * contract does not recognise all resolve to `null`, and `null` is a refusal
 * everywhere downstream.
 *
 * `offices` is every site for now: the legacy system had no per-site
 * scoping, and location modelling is its own branch. The set still belongs to
 * the actor and is resolved here, server-side, so ADR 22's rule — never from
 * a request — holds unchanged when the real per-site sets arrive.
 */
export async function actorFromHeaders(headers: Headers): Promise<Actor | null> {
  const result = await getAuth().api.getSession({ headers })
  if (result === null) return null

  const user = result.user as Record<string, unknown> & { id: string }

  if (user.isActive !== true) return null

  const role = staffRoleSchema.safeParse(user.role)
  if (!role.success) return null

  return {
    id: user.id,
    roles: [role.data],
    offices: officeSchema.options,
    mustChangePassword: user.mustChangePassword === true,
  }
}
