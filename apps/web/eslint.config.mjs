import next from '@fastehr/config/eslint/next'

/**
 * `src/server/**` must stay mountable outside Next.js — see ADR 9. Request
 * state enters only through `createContext`, which
 * `app/api/trpc/[trpc]/route.ts` builds; that route handler is deliberately
 * outside this glob and remains free to use Next APIs.
 */
const serverLayerBoundary = {
  files: ['src/server/**/*.ts', 'src/server/**/*.tsx'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['next', 'next/*', 'server-only', 'client-only'],
            message:
              'src/server/** must not import Next.js. Request state enters through createContext, built in app/api/trpc/[trpc]/route.ts.',
          },
        ],
      },
    ],
  },
}

/**
 * The inverse fence: only `src/server/**` may reach the database.
 *
 * Authentication, RBAC, and the PHI audit trail are tRPC middleware, so they
 * run for procedure calls and nothing else. A Server Component that imported
 * `@fastehr/db` directly would read patient data with no actor, no permission
 * check, and no audit record — and it would look completely ordinary in review.
 * This is the rule that makes the middleware chain mandatory rather than
 * merely available.
 *
 * The second group blocks the relative-path route out of the app
 * (`../../../packages/db/...`), which the package specifier alone does not
 * cover. The eslint rule is the fast, legible half; if a further guarantee is
 * ever wanted, the durable half is `@fastehr/db` moving out of the app's
 * dependencies entirely, once `src/server` is its own package.
 *
 * Data reaches components through procedures. See ADR 9, and Next's own Data
 * Access Layer guidance, which this mirrors.
 */
const dataAccessBoundary = {
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  ignores: ['src/server/**'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@fastehr/db', '@fastehr/db/*', '**/packages/db/**'],
            message:
              'Only src/server/** may reach the database. Everywhere else, read through a tRPC procedure so auth, RBAC, and the PHI audit trail run.',
          },
        ],
      },
    ],
  },
}

const config = [...next, serverLayerBoundary, dataAccessBoundary]

export default config
