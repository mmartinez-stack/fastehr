import { z } from 'zod'

/**
 * Environment contracts.
 *
 * These live here for the same reason the domain schemas do: ADR 5 makes
 * `contracts` the only package with a direct Zod dependency, so a package that
 * needs to validate its configuration takes the schema from here rather than
 * declaring Zod of its own. An environment variable is a shape agreement
 * between a deployment and the code — the same kind of thing this package
 * already exists to state.
 *
 * Nothing here reads `process.env`. These are schemas; the package that owns
 * the variable parses it, so a missing value fails in the package that needs
 * it, naming itself.
 */

/**
 * A PostgreSQL connection string.
 *
 * The protocol check is worth its two lines: the failure it prevents is a
 * connection string pointing at the wrong kind of database, which otherwise
 * surfaces as a driver-level parse error with no indication of which variable
 * was wrong.
 */
export const databaseUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'must be a postgresql:// connection string',
  )

/**
 * The Better Auth signing secret. Sessions and password-reset tokens are only
 * as strong as this value, so a length floor is the one property worth
 * enforcing here — emptiness or a short placeholder fails by name instead of
 * silently signing cookies with `"changeme"`.
 */
export const betterAuthSecretSchema = z
  .string()
  .min(32, 'must be at least 32 characters — generate with `openssl rand -base64 32`')

/** The absolute origin the auth server trusts for its own endpoints. */
export const betterAuthUrlSchema = z.url()

/**
 * The SMS transport (DIA-72). All three Twilio values or none: with them the
 * intake link is texted through Twilio; without them the server prints the
 * message to its log (the console transport), which is how development and
 * the credential-less dev environment run. A partial set is a configuration
 * mistake, refused by name rather than silently falling back to the console.
 */
export const smsEnvSchema = z
  .object({
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    /** E.164, the number the clinic texts from. */
    TWILIO_FROM_NUMBER: z.string().regex(/^\+\d{8,15}$/).optional(),
  })
  .refine(
    (env) => {
      const set = [env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM_NUMBER].filter(
        (value) => value !== undefined,
      ).length
      return set === 0 || set === 3
    },
    'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER must be set together or not at all',
  )
export type SmsEnv = z.infer<typeof smsEnvSchema>

/** Everything the server side of the workspace requires to run. */
export const serverEnvSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  BETTER_AUTH_SECRET: betterAuthSecretSchema,
  BETTER_AUTH_URL: betterAuthUrlSchema,
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

/**
 * The partner API kill switch (ADR 38). Unset or anything but `true`/`1`
 * means off: every `/api/v1/*` path answers 404, the spec and the docs
 * included. Keys are rows in each environment's database, so this is also
 * the statement that the surface stays dark until an operator turns it on
 * where the business associate agreement is signed.
 */
export const partnerApiEnabledSchema = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1')
