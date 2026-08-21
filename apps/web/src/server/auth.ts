import {
  betterAuthSecretSchema,
  betterAuthUrlSchema,
  officeSchema,
  staffRoleSchema,
} from '@fastehr/contracts'
import { createAuthAdapter } from '@fastehr/db'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import type { Actor } from './context.ts'

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

export function getAuth(): ReturnType<typeof betterAuth> {
  if (instance !== undefined) return instance

  // Typed as the option interface rather than inferred: the instance type
  // stays `Auth<BetterAuthOptions>`, and session users are validated below
  // through contracts schemas instead of trusted through type inference.
  const options: BetterAuthOptions = {
    database: createAuthAdapter(),
    secret: requireAuthEnv('BETTER_AUTH_SECRET'),
    baseURL: requireAuthEnv('BETTER_AUTH_URL'),

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
    },

    session: {
      // Provisional until the session-policy question in
      // docs/auth-and-rbac-proposal.md is decided: 12 hours covers a clinic
      // shift without inheriting the library's 7-day default in front of PHI.
      // Cookie caching stays off — every check is a server-side lookup.
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
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

  instance = betterAuth(options)

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
