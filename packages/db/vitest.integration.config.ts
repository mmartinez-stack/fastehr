import { defineConfig } from 'vitest/config'

/**
 * Integration tests: real PostgreSQL, real migrations, real driver.
 *
 * **`TEST_DATABASE_URL` is required and is never allowed to default to
 * `DATABASE_URL`.** These tests truncate tables between cases, so a default
 * would eventually run them against whatever database a developer happened to
 * have configured — which is to say, their working data. Naming a separate
 * variable makes destroying the wrong database take a deliberate act.
 */
const url = process.env.TEST_DATABASE_URL

if (url === undefined || url === '') {
  throw new Error(
    'TEST_DATABASE_URL is not set. These tests create and truncate tables, so they ' +
      'refuse to fall back to DATABASE_URL. Point it at a scratch database:\n\n' +
      '  docker run -d --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fastehr_test \\\n' +
      '    -p 55432:5432 postgres:17-alpine\n' +
      '  TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/fastehr_test \\\n' +
      '    pnpm --filter @fastehr/db test:integration\n',
  )
}

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // One database, shared by every file: run them in sequence so truncation in
    // one file cannot land in the middle of another.
    fileParallelism: false,
    env: {
      // The package reads DATABASE_URL; the scratch URL is what it gets.
      DATABASE_URL: url,
      // Deliberately a zone west of UTC. `@db.Date` columns come back as a JS
      // Date at UTC midnight, and reading them through local time shifts the
      // calendar day — turning a date of birth into the day before. Running the
      // suite here means that bug fails a test rather than depending on where
      // CI happens to be.
      TZ: 'America/Los_Angeles',
    },
  },
})
