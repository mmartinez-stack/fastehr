/**
 * Architectural boundary for `packages/core`.
 *
 * `core` holds domain logic and use cases and must stay framework-free: no
 * Next.js, no React, and no ORM or database driver. Persistence is reached only
 * through ports that `core` itself declares and that `packages/db` implements.
 *
 * `scripts/check-boundaries.mjs` enforces the same rule at the manifest level,
 * so a forbidden dependency fails even if a file is never linted.
 */

/** Module specifiers `packages/core` may never import. */
export const forbiddenModules = [
  // Framework
  'next',
  'next/*',
  'react',
  'react/*',
  'react-dom',
  'react-dom/*',
  'server-only',
  'client-only',
  // Persistence / ORM / drivers
  '@prisma/client',
  '@prisma/*',
  'prisma',
  'drizzle-orm',
  'drizzle-orm/*',
  'kysely',
  'typeorm',
  'sequelize',
  'mongoose',
  'pg',
  'pg-*',
  'postgres',
  'mysql2',
  'better-sqlite3',
  '@neondatabase/*',
  // The workspace persistence package itself
  '@fastehr/db',
  '@fastehr/db/*',
  // UI
  '@fastehr/ui',
  '@fastehr/ui/*',
]

const message =
  'packages/core must stay framework-free: no Next.js, React, ORM, database driver, or @fastehr/db import. ' +
  'Define a port in core and implement it in packages/db instead.'

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: forbiddenModules, message }],
        },
      ],
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },
]
