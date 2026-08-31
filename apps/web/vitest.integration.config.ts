import { defineConfig } from 'vitest/config'

/**
 * Auth-flow integration tests: real PostgreSQL, real migrations, the real
 * Better Auth instance.
 *
 * `TEST_DATABASE_URL` is required and never falls back to `DATABASE_URL`,
 * for the same reason as packages/db: the suite writes and deletes rows, so
 * pointing it at a working database must take a deliberate act.
 */
const url = process.env.TEST_DATABASE_URL

if (url === undefined || url === '') {
  throw new Error(
    'TEST_DATABASE_URL is not set. These tests write to the database, so they ' +
      'refuse to fall back to DATABASE_URL. Point it at a scratch database:\n\n' +
      '  docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fastehr_test \\\n' +
      '    -p 55432:5432 postgres:17-alpine\n' +
      '  TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/fastehr_test \\\n' +
      '    pnpm --filter @fastehr/web test:integration\n',
  )
}

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    env: {
      DATABASE_URL: url,
      // The singleton auth instance reads these on first use. Test-only
      // values — the secret guards nothing but a scratch database.
      BETTER_AUTH_SECRET: 'integration-test-secret-0123456789abcdef',
      BETTER_AUTH_URL: 'http://localhost:3000',
      TZ: 'America/Los_Angeles',
    },
  },
})
